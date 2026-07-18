import {
  doc,
  runTransaction,
  serverTimestamp,
  type DocumentReference,
  type DocumentData,
} from "firebase/firestore";

import { db } from "@/firebase/client";
import type {
  OtherExpense,
  Site,
} from "@/shared/types/domain";

type EnsureMonthlySiteExpensesInput = {
  companyId: string;
  site: Site;

  /**
   * Date of the completed scheduled service.
   * Format: YYYY-MM-DD
   */
  serviceDate: string;
};

type MonthlyFeeDefinition = {
  source: "site-rs-fee" | "site-other-fee";
  keySuffix: "rs-fee" | "other-fee";
  category: string;
  feeType?: "none" | "percent" | "fixed";
  feeValue?: number;
};

type ExpenseCandidate = {
  ref: DocumentReference<DocumentData>;
  data: Omit<OtherExpense, "id">;
};

/**
 * Safely rounds currency to two decimal places.
 */
const roundCurrency = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Calculates a fixed or percentage-based site fee.
 */
const calculateFeeAmount = ({
  feeType,
  feeValue,
  revenue,
}: {
  feeType?: "none" | "percent" | "fixed";
  feeValue?: number;
  revenue?: number;
}): number => {
  const safeFeeValue = Number(feeValue) || 0;
  const safeRevenue = Number(revenue) || 0;

  if (feeType === "fixed") {
    return roundCurrency(safeFeeValue);
  }

  if (feeType === "percent") {
    return roundCurrency(
      safeRevenue * (safeFeeValue / 100)
    );
  }

  return 0;
};

/**
 * Confirms that the value is a real calendar date
 * represented as YYYY-MM-DD.
 */
const isValidServiceDate = (
  value: string
): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value
    .split("-")
    .map(Number);

  const parsed = new Date(
    year,
    month - 1,
    day
  );

  return (
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day
  );
};

/**
 * Removes undefined values because Firestore rejects them.
 */
const removeUndefinedValues = <T extends object>(
  value: T
): T =>
  Object.fromEntries(
    Object.entries(value).filter(
      ([, fieldValue]) =>
        fieldValue !== undefined
    )
  ) as T;

/**
 * Creates the site's monthly R/S Fee and Other Fee expenses.
 *
 * Each expense uses a deterministic Firestore document ID:
 *
 * siteId_YYYY-MM_rs-fee
 * siteId_YYYY-MM_other-fee
 *
 * This prevents duplicate monthly expenses when multiple
 * employees clock out around the same time.
 */
export async function ensureMonthlySiteExpenses({
  companyId,
  site,
  serviceDate,
}: EnsureMonthlySiteExpensesInput): Promise<void> {
  const safeCompanyId = companyId.trim();
  const safeSiteId = site.id?.trim();
  const safeSiteName = site.name?.trim();

  if (!safeCompanyId) {
    throw new Error(
      "Cannot generate monthly site expenses without a company ID."
    );
  }

  if (!safeSiteId) {
    throw new Error(
      `Cannot generate monthly expenses for "${safeSiteName || "Unknown site"}" because the site has no ID.`
    );
  }

  if (!safeSiteName) {
    throw new Error(
      "Cannot generate monthly site expenses because the site has no name."
    );
  }

  if (!isValidServiceDate(serviceDate)) {
    throw new Error(
      `Invalid monthly-expense service date: "${serviceDate}". Expected a valid YYYY-MM-DD date.`
    );
  }

  const expensePeriod =
    serviceDate.slice(0, 7);

  const feeDefinitions: MonthlyFeeDefinition[] = [
    {
      source: "site-rs-fee",
      keySuffix: "rs-fee",
      category: "R/S Fee",
      feeType: site.rsFeeType,
      feeValue: site.rsFeeValue,
    },
    {
      source: "site-other-fee",
      keySuffix: "other-fee",
      category:
        site.otherFeeLabel?.trim() ||
        "Other Fee",
      feeType: site.otherFeeType,
      feeValue: site.otherFeeValue,
    },
  ];

  /*
   * Build all eligible expense candidates before starting
   * the Firestore transaction.
   */
  const candidates: ExpenseCandidate[] =
    feeDefinitions.flatMap((fee) => {
      if (
        !fee.feeType ||
        fee.feeType === "none"
      ) {
        return [];
      }

      const amount = calculateFeeAmount({
        feeType: fee.feeType,
        feeValue: fee.feeValue,
        revenue: site.revenue,
      });

      /*
       * Do not create zero-dollar or negative expenses.
       */
      if (amount <= 0) {
        return [];
      }

      const autoExpenseKey =
        `${safeSiteId}_${expensePeriod}_${fee.keySuffix}`;

      const expenseRef = doc(
        db,
        "companies",
        safeCompanyId,
        "other_expenses",
        autoExpenseKey
      );

      const expense: Omit<
        OtherExpense,
        "id"
      > = {
        date: serviceDate,
        expenseDate: serviceDate,
        paidDate: null,

        vendor: safeSiteName,
        description:
          `${fee.category} for ${safeSiteName} — ${expensePeriod}`,
        amount,

        siteId: safeSiteId,
        site: safeSiteName,
        siteName: safeSiteName,

        category: fee.category,

        source: fee.source,
        isAutoGenerated: true,

        expensePeriod,
        autoExpenseKey,

        feeType: fee.feeType,
        feeValue:
          Number(fee.feeValue) || 0,

        revenueBasis:
          fee.feeType === "percent"
            ? Number(site.revenue) || 0
            : undefined,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      return [
        {
          ref: expenseRef,
          data: removeUndefinedValues(
            expense
          ),
        },
      ];
    });

  /*
   * Nothing is configured for this site.
   */
  if (candidates.length === 0) {
    return;
  }

  await runTransaction(
    db,
    async (transaction) => {
      /*
       * Firestore requires all transaction reads to happen
       * before transaction writes.
       */
      const existingSnapshots =
        await Promise.all(
          candidates.map((candidate) =>
            transaction.get(candidate.ref)
          )
        );

      /*
       * Begin writing only after every read has completed.
       */
      candidates.forEach(
        (candidate, index) => {
          if (
            existingSnapshots[index].exists()
          ) {
            return;
          }

          transaction.set(
            candidate.ref,
            candidate.data
          );
        }
      );
    }
  );
}