// src/components/timewise/payroll/PaystubCard.tsx
"use client";

type PaystubDeduction = {
  label: string;
  amount: number;
};

type PaystubYTD = {
  regularHours: number;
  bonusHours: number;
  flatBonus: number;
  grossPay: number;
  regularPay?: number;
  bonusPay?: number;

  federalTax: number;
  stateTax: number;
  localTax: number;
  socialSecurity: number;
  medicare: number;
  otherDeductions: number;

  totalDeductions: number;
  netPay: number;
};

type PaystubCardProps = {
  companyName: string;
  logoUrl?: string;
  employeeName: string;
  employeeId?: string;
  employeeAddress?: string;
  payDate: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payRate?: number;
  regularHours?: number;
  bonusHours?: number;
  flatBonus?: number;
  grossPay: number;
  deductions: PaystubDeduction[];
  netPay: number;
  companyContact?: string;
  ytd?: PaystubYTD;
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatMoney(value: number) {
  return currency.format(Number.isFinite(value) ? value : 0);
}

function normalizeLabel(label: string) {
  return label.trim().toLowerCase();
}

function isTaxDeduction(label: string) {
  const normalized = normalizeLabel(label);

  return (
    normalized.includes("federal") ||
    normalized.includes("state") ||
    normalized.includes("local") ||
    normalized.includes("social security") ||
    normalized.includes("medicare")
  );
}

/**
 * Converts a company slug such as "amazing-grace-cleaners"
 * into "Amazing Grace Cleaners".
 *
 * Already formatted names such as "Amazing Grace Cleaners LLC"
 * are preserved.
 */
function formatCompanyName(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "Amazing Grace Cleaners";
  }

  const looksLikeSlug =
    trimmed.includes("-") ||
    trimmed.includes("_") ||
    trimmed === trimmed.toLowerCase();

  if (!looksLikeSlug) {
    return trimmed;
  }

  return trimmed
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => {
      const upper = word.toUpperCase();

      if (upper === "LLC" || upper === "INC" || upper === "DBA") {
        return upper;
      }

      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function deductionAmount(
  deductions: PaystubDeduction[],
  matcher: (normalizedLabel: string) => boolean
) {
  return deductions
    .filter((deduction) => matcher(normalizeLabel(deduction.label)))
    .reduce((sum, deduction) => sum + deduction.amount, 0);
}

export function PaystubCard({
  companyName,
  logoUrl,
  employeeName,
  employeeId,
  employeeAddress,
  payDate,
  payPeriodStart,
  payPeriodEnd,
  payRate,
  regularHours = 0,
  bonusHours = 0,
  flatBonus = 0,
  grossPay,
  deductions,
  netPay,
  companyContact,
  ytd,
}: PaystubCardProps) {
  const displayCompanyName = formatCompanyName(companyName);

  const safeDeductions = deductions.filter(
    (deduction) =>
      deduction &&
      typeof deduction.label === "string" &&
      Number.isFinite(deduction.amount)
  );

  const taxDeductions = safeDeductions.filter((deduction) =>
    isTaxDeduction(deduction.label)
  );

  const otherDeductionRows = safeDeductions.filter(
    (deduction) => !isTaxDeduction(deduction.label)
  );

  const currentTaxes = taxDeductions.reduce(
    (sum, deduction) => sum + deduction.amount,
    0
  );

  const currentOtherDeductions = otherDeductionRows.reduce(
    (sum, deduction) => sum + deduction.amount,
    0
  );

  const totalDeductions = currentTaxes + currentOtherDeductions;

  const regularAmount = payRate != null ? regularHours * payRate : 0;
  const bonusRate = payRate != null ? payRate + 0.5 : 0;
  const bonusAmount = payRate != null ? bonusHours * bonusRate : 0;

  const ytdRegularPay =
    ytd?.regularPay ??
    (payRate != null
      ? (ytd?.regularHours ?? regularHours) * payRate
      : regularAmount);

  const ytdBonusPay =
    ytd?.bonusPay ??
    (payRate != null
      ? (ytd?.bonusHours ?? bonusHours) * bonusRate
      : bonusAmount);

  const ytdTaxes =
    (ytd?.federalTax ?? 0) +
    (ytd?.stateTax ?? 0) +
    (ytd?.localTax ?? 0) +
    (ytd?.socialSecurity ?? 0) +
    (ytd?.medicare ?? 0);

  const ytdOtherDeductions = ytd?.otherDeductions ?? 0;
  const totalHours = regularHours + bonusHours;

  const initials = employeeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const federalCurrent = deductionAmount(
    taxDeductions,
    (label) => label.includes("federal")
  );

  const socialSecurityCurrent = deductionAmount(
    taxDeductions,
    (label) => label.includes("social security")
  );

  const medicareCurrent = deductionAmount(
    taxDeductions,
    (label) => label.includes("medicare")
  );

  const stateCurrent = deductionAmount(
    taxDeductions,
    (label) => label.includes("state")
  );

  const localCurrent = deductionAmount(
    taxDeductions,
    (label) => label.includes("local")
  );

  const taxRows = [
    {
      label: "Federal Income Tax",
      current: federalCurrent,
      ytd: ytd?.federalTax ?? 0,
    },
    {
      label: "Social Security",
      current: socialSecurityCurrent,
      ytd: ytd?.socialSecurity ?? 0,
    },
    {
      label: "Medicare",
      current: medicareCurrent,
      ytd: ytd?.medicare ?? 0,
    },
    {
      label: "State Tax",
      current: stateCurrent,
      ytd: ytd?.stateTax ?? 0,
    },
    {
      label: "Local Tax",
      current: localCurrent,
      ytd: ytd?.localTax ?? 0,
    },
  ];

  const otherRows = otherDeductionRows.map((deduction) => ({
    label: deduction.label,
    current: deduction.amount,
    ytd:
      normalizeLabel(deduction.label).includes("other") ||
      normalizeLabel(deduction.label) === "deductions"
        ? ytdOtherDeductions
        : 0,
  }));

  if (otherRows.length === 0) {
    otherRows.push(
      {
        label: "Health Insurance",
        current: 0,
        ytd: 0,
      },
      {
        label: "Retirement",
        current: 0,
        ytd: 0,
      },
      {
        label: "Garnishment",
        current: 0,
        ytd: 0,
      },
      {
        label: "Uniforms",
        current: 0,
        ytd: 0,
      },
      {
        label: "Other Deductions",
        current: 0,
        ytd: ytdOtherDeductions,
      }
    );
  }

  return (
    <article
  className="
    mx-auto w-full min-w-[980px] max-w-[1180px]
    overflow-hidden rounded-3xl border border-slate-200
    bg-white text-slate-950 shadow-2xl

    print:min-w-0
    print:max-w-[7.5in]
    print:w-[7.5in]
    print:rounded-none
    print:border-0
    print:shadow-none
    print:overflow-visible
  "
  aria-label={`Pay stub for ${employeeName}`}
>
      {/* Header */}
      <header className="relative overflow-hidden border-b border-blue-100 bg-white px-8 py-7">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-r from-blue-50 via-indigo-50 to-transparent opacity-80" />

        <div
  className="
    relative grid grid-cols-[minmax(0,1fr)_390px]
    items-start gap-8

    print:grid-cols-[minmax(0,1fr)_250px]
    print:gap-4
  "
>
          <div className="flex min-w-0 items-center gap-5">
            <div
  className="
    flex h-28 w-28 shrink-0 items-center justify-center
    overflow-hidden rounded-[28px]
    bg-gradient-to-br from-slate-900 to-blue-950
    p-3 shadow-lg

    print:h-20
    print:w-20
    print:rounded-2xl
  "
>
              {logoUrl ? (
                <div className="flex h-full w-full items-center justify-center rounded-full bg-white p-2">
                  <img
                    src={logoUrl}
                    alt={`${displayCompanyName} logo`}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <span className="text-3xl font-black text-white">
                  {displayCompanyName.charAt(0).toUpperCase()}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <h1 className="break-words text-4xl font-black tracking-tight text-blue-950 print:text-2xl">
                {displayCompanyName}
              </h1>
              <p className="mt-2 text-lg font-bold uppercase tracking-[0.16em] text-blue-800">
                Official Pay Statement
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-br from-blue-900 to-blue-950 px-6 py-5 text-white shadow-xl">
            <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="font-semibold text-blue-100">Pay Date:</dt>
              <dd className="font-semibold">{payDate}</dd>

              <dt className="font-semibold text-blue-100">Pay Period:</dt>
              <dd className="font-semibold">
                {payPeriodStart} – {payPeriodEnd}
              </dd>
            </dl>
          </div>
        </div>
      </header>

      {/* Employee card */}
    <section className="px-8 py-6 print:px-4 print:py-3">
  <div
    className="
      grid grid-cols-[minmax(0,1fr)_minmax(250px,0.85fr)]
      gap-8 rounded-3xl border border-slate-200
      bg-white p-6 shadow-sm

      print:grid-cols-[minmax(0,1fr)_190px]
      print:gap-4
      print:rounded-xl
      print:p-3
    "
  >
          <div className="flex min-w-0 items-start gap-5">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 text-xl font-black text-blue-800">
              {initials || "E"}
            </div>

            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-800">
                Employee
              </p>
              <h2 className="mt-1 whitespace-normal break-words text-2xl font-black leading-tight text-slate-950">
                {employeeName}
              </h2>

              <div className="mt-4 space-y-1.5 text-sm text-slate-700">
                <p className="whitespace-normal break-words">
                  <span className="font-bold text-slate-900">Address:</span>{" "}
                  {employeeAddress || "Not provided"}
                </p>
                <p>
                  <span className="font-bold text-slate-900">Regular rate:</span>{" "}
                  {payRate != null ? `${formatMoney(payRate)}/hr` : "—"}
                </p>
                <p>
                  <span className="font-bold text-slate-900">Total hours:</span>{" "}
                  {totalHours.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          <div className="border-l border-slate-200 pl-8 print:pl-4">
            <p className="text-sm font-bold text-slate-900">Employee ID:</p>
            <p className="mt-1 break-all text-sm text-slate-700">
              {employeeId || "—"}
            </p>
          </div>
        </div>
      </section>

      {/* Main two-column body */}
      <section
  className="
    grid grid-cols-[minmax(0,1fr)_300px]
    items-start gap-6 px-8 pb-7

    print:grid-cols-[minmax(0,1fr)_210px]
    print:gap-3
    print:px-4
    print:pb-4
  "
>
        <div className="space-y-6">
          {/* Earnings */}
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-xl font-black text-emerald-700">
                $
              </div>
              <h3 className="text-xl font-black uppercase tracking-wide text-blue-950">
                Earnings
              </h3>
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="px-5 py-3 text-left font-bold">Earnings</th>
                  <th className="px-4 py-3 text-right font-bold">Hours</th>
                  <th className="px-4 py-3 text-right font-bold">Rate</th>
                  <th className="px-4 py-3 text-right font-bold">Current</th>
                  <th className="px-5 py-3 text-right font-bold">YTD</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="px-5 py-3.5 font-medium">Regular</td>
                  <td className="px-4 py-3.5 text-right">{regularHours.toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right">
                    {payRate != null ? formatMoney(payRate) : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold">
                    {formatMoney(regularAmount)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-blue-800">
                    {formatMoney(ytdRegularPay)}
                  </td>
                </tr>

                <tr>
                  <td className="px-5 py-3.5 font-medium">Bonus</td>
                  <td className="px-4 py-3.5 text-right">{bonusHours.toFixed(2)}</td>
                  <td className="px-4 py-3.5 text-right">
                    {payRate != null ? formatMoney(bonusRate) : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold">
                    {formatMoney(bonusAmount)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-blue-800">
                    {formatMoney(ytdBonusPay)}
                  </td>
                </tr>

                <tr>
                  <td className="px-5 py-3.5 font-medium">Flat Bonus</td>
                  <td className="px-4 py-3.5 text-right">—</td>
                  <td className="px-4 py-3.5 text-right">—</td>
                  <td className="px-4 py-3.5 text-right font-bold">
                    {formatMoney(flatBonus)}
                  </td>
                  <td className="px-5 py-3.5 text-right font-bold text-blue-800">
                    {formatMoney(ytd?.flatBonus ?? flatBonus)}
                  </td>
                </tr>
              </tbody>

              <tfoot>
                <tr className="bg-blue-50">
                  <td colSpan={3} className="px-5 py-3.5 font-black uppercase text-blue-900">
                    Gross Pay
                  </td>
                  <td className="px-4 py-3.5 text-right text-lg font-black text-blue-800">
                    {formatMoney(grossPay)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-lg font-black text-blue-800">
                    {formatMoney(ytd?.grossPay ?? grossPay)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* Taxes */}
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-lg font-black text-rose-700">
                %
              </div>
              <h3 className="text-xl font-black uppercase tracking-wide text-blue-950">
                Taxes
              </h3>
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="px-5 py-3 text-left font-bold">Tax</th>
                  <th className="px-5 py-3 text-right font-bold">Current</th>
                  <th className="px-5 py-3 text-right font-bold">YTD</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {taxRows.map((row) => (
                  <tr key={row.label}>
                    <td className="px-5 py-3 font-medium">{row.label}</td>
                    <td className="px-5 py-3 text-right">
                      {row.current > 0 ? `−${formatMoney(row.current)}` : formatMoney(0)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.ytd > 0 ? `−${formatMoney(row.ytd)}` : formatMoney(0)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-rose-50">
                  <td className="px-5 py-3.5 font-black uppercase text-rose-800">
                    Total Taxes
                  </td>
                  <td className="px-5 py-3.5 text-right text-lg font-black text-rose-700">
                    −{formatMoney(currentTaxes)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-lg font-black text-rose-700">
                    −{formatMoney(ytdTaxes)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>

          {/* Other deductions */}
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-lg font-black text-violet-700">
                −
              </div>
              <h3 className="text-xl font-black uppercase tracking-wide text-blue-950">
                Other Deductions
              </h3>
            </div>

            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-800">
                  <th className="px-5 py-3 text-left font-bold">Deduction</th>
                  <th className="px-5 py-3 text-right font-bold">Current</th>
                  <th className="px-5 py-3 text-right font-bold">YTD</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200">
                {otherRows.map((row, index) => (
                  <tr key={`${row.label}-${index}`}>
                    <td className="px-5 py-3 font-medium">{row.label}</td>
                    <td className="px-5 py-3 text-right">
                      {row.current > 0 ? `−${formatMoney(row.current)}` : formatMoney(0)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {row.ytd > 0 ? `−${formatMoney(row.ytd)}` : formatMoney(0)}
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr className="bg-violet-50">
                  <td className="px-5 py-3.5 font-black uppercase text-violet-800">
                    Total Other Deductions
                  </td>
                  <td className="px-5 py-3.5 text-right text-lg font-black text-violet-700">
                    −{formatMoney(currentOtherDeductions)}
                  </td>
                  <td className="px-5 py-3.5 text-right text-lg font-black text-violet-700">
                    −{formatMoney(ytdOtherDeductions)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </section>
        </div>

        {/* Right summary rail */}
        <aside className="space-y-6">
          <section className="rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm print:rounded-xl print:p-3">
            <h3 className="text-xl font-black uppercase tracking-wide text-emerald-800">
              Net Pay Summary
            </h3>

            <div className="mt-7 space-y-5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span>Gross Pay</span>
                <strong>{formatMoney(grossPay)}</strong>
              </div>

              <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-5">
                <span>Total Taxes</span>
                <strong className="text-rose-600">−{formatMoney(currentTaxes)}</strong>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span>Other Deductions</span>
                <strong className="text-rose-600">
                  −{formatMoney(currentOtherDeductions)}
                </strong>
              </div>
            </div>

            <div className="mt-7 border-t-2 border-emerald-400 pt-6">
              <p className="text-lg font-black uppercase text-emerald-800">
                Net Pay
              </p>
              <p className="mt-2 text-4xl font-black tracking-tight text-emerald-700 print:text-2xl">
                {formatMoney(netPay)}
              </p>
            </div>
          </section>

         <section className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-6 shadow-sm print:rounded-xl print:p-3">
            <h3 className="text-xl font-black uppercase tracking-wide text-blue-900">
              YTD Totals
            </h3>

            <div className="mt-7 space-y-5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span>Gross Earnings</span>
                <strong>{formatMoney(ytd?.grossPay ?? grossPay)}</strong>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span>Taxes Withheld</span>
                <strong className="text-rose-600">−{formatMoney(ytdTaxes)}</strong>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span>Other Deductions</span>
                <strong className="text-rose-600">
                  −{formatMoney(ytdOtherDeductions)}
                </strong>
              </div>
            </div>

            <div className="mt-7 border-t border-slate-400 pt-6">
              <div className="flex items-center justify-between gap-4">
                <span className="text-lg font-black text-blue-950">Net Pay</span>
                <strong className="text-xl text-blue-900">
                  {formatMoney(ytd?.netPay ?? netPay)}
                </strong>
              </div>
            </div>
          </section>
        </aside>
      </section>

      {/* Footer */}
     <footer
  className="
    mx-8 mb-7 grid grid-cols-[1.2fr_1fr_1.2fr]
    divide-x divide-slate-200 rounded-2xl
    border border-slate-200 bg-slate-50
    px-6 py-5 text-sm text-slate-700

    print:mx-4
    print:mb-3
    print:grid-cols-[1.1fr_1fr_1.1fr]
    print:rounded-xl
    print:px-3
    print:py-3
    print:text-[10px]
  "
>
        <div className="pr-6 print:pr-3">
          <p className="font-black text-slate-950">{displayCompanyName}</p>
          {employeeAddress ? (
            <p className="mt-1 text-slate-600">{employeeAddress}</p>
          ) : null}
        </div>

        <div className="px-6 print:px-3">
          {companyContact ? (
            <p className="whitespace-normal break-words text-slate-600">
              {companyContact}
            </p>
          ) : (
            <p className="text-slate-500">Company contact information</p>
          )}
        </div>

       <div className="pl-6 print:pl-3">
          <p>This is an electronically generated pay statement.</p>
          <p className="mt-1 font-semibold text-slate-900">
            No signature required.
          </p>
        </div>
      </footer>
    </article>
  );
}