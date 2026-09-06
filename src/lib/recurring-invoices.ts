import type { Invoice } from "@/shared/types/domain";

const toMonthKey = (date?: string | null) =>
  date ? date.slice(0, 7) : undefined;

/*
 * Normalize site names so small differences in capitalization
 * or extra spaces do not create duplicate invoices.
 */
const normalizeSiteName = (siteName?: string | null) =>
  String(siteName ?? "")
    .trim()
    .toLowerCase();

/*
 * Normalize invoice line items.
 *
 * We intentionally do NOT compare line-item IDs because two
 * identical invoice lines can have different generated IDs.
 *
 * Sorting also means changing the order of the line items
 * does not make ManageWiseMD think it is a different invoice.
 */
const normalizeLineItems = (
  lineItems: Invoice["lineItems"] = []
) =>
  lineItems
    .map((item) => ({
      description: String(item.description ?? "")
        .trim()
        .toLowerCase(),

      quantity: Number(item.quantity ?? 0),

      unitPrice: Number(item.unitPrice ?? 0),

      total: Number(item.total ?? 0),
    }))
    .sort((a, b) => {
      const aKey = JSON.stringify(a);
      const bKey = JSON.stringify(b);

      return aKey.localeCompare(bKey);
    });

const sameLineItems = (
  first: Invoice["lineItems"],
  second: Invoice["lineItems"]
) =>
  JSON.stringify(normalizeLineItems(first)) ===
  JSON.stringify(normalizeLineItems(second));

/*
 * Semantic identity used as an additional duplicate safeguard.
 *
 * Same month + same site + same line items
 * represents the same recurring invoice for generation purposes.
 */
const getSemanticGenerationKey = (
  invoice: Pick<Invoice, "siteName" | "lineItems">,
  targetMonthISO: string
) =>
  JSON.stringify({
    month: targetMonthISO,
    site: normalizeSiteName(invoice.siteName),
    lineItems: normalizeLineItems(invoice.lineItems),
  });

export function generateRecurringInvoicesForMonth(args: {
  targetMonthISO: string; // YYYY-MM
  allInvoices: Invoice[];
}): Omit<Invoice, "id">[] {
  const { targetMonthISO, allInvoices } = args;

  /*
   * Only true recurring templates may generate invoices.
   *
   * Newly generated monthly invoices are always saved with
   * recurring: false.
   */
  const templates = allInvoices.filter((invoice) => {
  if (invoice.recurring !== true) {
    return false;
  }

  /*
   * A real recurring template either has no recurringTemplateId,
   * or points to itself.
   *
   * Old generated invoices may incorrectly still have
   * recurring:true, but their recurringTemplateId points to
   * another invoice. Those must NOT generate invoices.
   */
  return (
    !invoice.recurringTemplateId ||
    invoice.recurringTemplateId === invoice.id
  );
});

  const results: Omit<Invoice, "id">[] = [];

  /*
   * Protection #1:
   * Prevent the same recurring template/month combination from
   * generating more than once during this invocation.
   */
  const generatedTemplateKeys = new Set<string>();

  /*
   * Protection #2:
   * Prevent multiple recurring templates for the same site and
   * same line items from producing duplicate invoices.
   *
   * This is especially useful for older Firestore data where
   * generated invoices may accidentally still have recurring:true.
   */
  const generatedSemanticKeys = new Set<string>();

  for (const template of templates) {
    const templateId =
      template.recurringTemplateId || template.id;

    const templateGenerationKey =
      `${templateId}_${targetMonthISO}`;

    const semanticGenerationKey =
      getSemanticGenerationKey(
        template,
        targetMonthISO
      );

    /*
     * Same template already processed during this run.
     */
    if (
      generatedTemplateKeys.has(
        templateGenerationKey
      )
    ) {
      continue;
    }

    /*
     * Same site + same line items already processed during
     * this run.
     */
    if (
      generatedSemanticKeys.has(
        semanticGenerationKey
      )
    ) {
      continue;
    }

    const startKey =
      toMonthKey(template.recurringStart);

    const endKey =
      toMonthKey(template.recurringEnd);

    if (
      startKey &&
      targetMonthISO < startKey
    ) {
      continue;
    }

    if (
      endKey &&
      targetMonthISO > endKey
    ) {
      continue;
    }

    /*
     * Protection #3:
     *
     * First check the permanent recurring-template identity.
     *
     * This is important because if the manager edits the generated
     * invoice later, ManageWiseMD must NOT recreate the original
     * version of that invoice.
     */
    const existingByTemplate =
      allInvoices.some((invoice) => {
        if (invoice.id === template.id) {
          return false;
        }

        const invoiceMonth =
          toMonthKey(
            invoice.serviceStartDate ||
              invoice.date
          );

        return (
          invoice.recurringTemplateId ===
            templateId &&
          invoiceMonth === targetMonthISO
        );
      });

    if (existingByTemplate) {
      generatedTemplateKeys.add(
        templateGenerationKey
      );

      generatedSemanticKeys.add(
        semanticGenerationKey
      );

      continue;
    }

    /*
     * Protection #4:
     *
     * Legacy/fallback duplicate check.
     *
     * If an invoice already exists for:
     *
     *   same month
     *   + same site
     *   + same line items
     *
     * do not create another one even when old data does not have
     * the correct recurringTemplateId.
     */
    const existingByContent =
      allInvoices.some((invoice) => {
        if (invoice.id === template.id) {
          return false;
        }

        const invoiceMonth =
          toMonthKey(
            invoice.serviceStartDate ||
              invoice.date
          );

        if (
          invoiceMonth !== targetMonthISO
        ) {
          return false;
        }

        const sameSite =
          normalizeSiteName(
            invoice.siteName
          ) ===
          normalizeSiteName(
            template.siteName
          );

        if (!sameSite) {
          return false;
        }

        return sameLineItems(
          invoice.lineItems,
          template.lineItems
        );
      });

    if (existingByContent) {
      generatedTemplateKeys.add(
        templateGenerationKey
      );

      generatedSemanticKeys.add(
        semanticGenerationKey
      );

      continue;
    }

    const {
      id: _ignoredId,
      ...rest
    } = template;

    results.push({
      ...rest,

      /*
       * InvoiceView will normalize invoice date,
       * service period, Due Date and Paid Date.
       */
      date: `${targetMonthISO}-01`,

      serviceStartDate:
        `${targetMonthISO}-01`,

      status: "draft",

      /*
       * CRITICAL:
       * Generated monthly invoices must never become
       * recurring templates themselves.
       */
      recurring: false,

      /*
       * Keep the permanent relationship with the
       * original recurring template.
       */
      recurringTemplateId:
        templateId,

      amountPaid: null,

      statusManuallyOverridden: false,
    });

    generatedTemplateKeys.add(
      templateGenerationKey
    );

    generatedSemanticKeys.add(
      semanticGenerationKey
    );
  }

  return results;
}