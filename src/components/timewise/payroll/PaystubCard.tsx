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
  const safeDeductions = deductions.filter(
    (deduction) =>
      deduction &&
      typeof deduction.label === "string" &&
      Number.isFinite(deduction.amount)
  );

  const totalDeductions = safeDeductions.reduce(
    (sum, deduction) => sum + deduction.amount,
    0
  );

  const regularAmount = payRate != null ? regularHours * payRate : 0;

  // Preserves your existing payroll rule:
  // bonus-hour rate = regular hourly rate + $0.50.
  const bonusRate = payRate != null ? payRate + 0.5 : 0;
  const bonusAmount = payRate != null ? bonusHours * bonusRate : 0;

  const isTaxDeduction = (label: string) => {
    const normalized = label.trim().toLowerCase();
    return (
      normalized.includes("federal") ||
      normalized.includes("state") ||
      normalized.includes("local") ||
      normalized.includes("social security") ||
      normalized.includes("medicare")
    );
  };

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

  const ytdTaxes =
    (ytd?.federalTax ?? 0) +
    (ytd?.stateTax ?? 0) +
    (ytd?.localTax ?? 0) +
    (ytd?.socialSecurity ?? 0) +
    (ytd?.medicare ?? 0);

  const ytdOtherDeductions = ytd?.otherDeductions ?? 0;

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

  const totalHours = regularHours + bonusHours;
  const initials = employeeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <article
      className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-950 shadow-xl print:max-w-none print:rounded-none print:border-0 print:shadow-none"
      aria-label={`Pay stub for ${employeeName}`}
    >
      {/* Branded header */}
      <header className="relative overflow-hidden bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 px-6 py-6 text-white sm:px-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 h-52 w-52 rounded-full bg-violet-500/15 blur-3xl" />

        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <div className="flex h-16 w-20 items-center justify-center rounded-2xl border border-white/15 bg-white p-2 shadow-lg">
                <img
                  src={logoUrl}
                  alt={`${companyName} logo`}
                  className="max-h-12 w-auto object-contain"
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-500 text-xl font-black shadow-lg">
                {companyName.charAt(0).toUpperCase()}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200">
                Official Pay Statement
              </p>
              <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                {companyName}
              </h1>
              <p className="mt-1 text-sm text-blue-100/80">
                Employee earnings and deductions
              </p>
            </div>
          </div>

          <div className="min-w-[240px] rounded-2xl border border-white/15 bg-white/10 p-4 backdrop-blur">
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <span className="text-blue-200">Pay date</span>
              <span className="text-right font-semibold">{payDate}</span>

              <span className="text-blue-200">Pay period</span>
              <span className="text-right font-semibold">
                {payPeriodStart} – {payPeriodEnd}
              </span>

              {employeeId ? (
                <>
                  <span className="text-blue-200">Employee ID</span>
                  <span className="text-right font-semibold">{employeeId}</span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* Employee and pay summary */}
      <section className="grid gap-4 bg-slate-50 px-6 py-5 sm:grid-cols-2 sm:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 font-bold text-blue-700">
              {initials || "E"}
            </div>

            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Employee
              </p>
              <h2 className="mt-1 truncate text-lg font-bold text-slate-950">
                {employeeName}
              </h2>

              <div className="mt-3 space-y-1 text-sm text-slate-600">
                <p>
                  <span className="font-semibold text-slate-800">Address:</span>{" "}
                  {employeeAddress || "Not provided"}
                </p>

                {payRate != null ? (
                  <p>
                    <span className="font-semibold text-slate-800">
                      Regular rate:
                    </span>{" "}
                    {formatMoney(payRate)}/hr
                  </p>
                ) : null}

                <p>
                  <span className="font-semibold text-slate-800">
                    Total hours:
                  </span>{" "}
                  {totalHours.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Take-home pay
          </p>
          <p className="mt-2 text-4xl font-black tracking-tight text-emerald-700">
            {formatMoney(netPay)}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-emerald-200 pt-4 text-sm">
            <div>
              <p className="text-slate-500">Gross pay</p>
              <p className="mt-1 font-bold text-slate-900">
                {formatMoney(grossPay)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-slate-500">Deductions</p>
              <p className="mt-1 font-bold text-rose-600">
                −{formatMoney(totalDeductions)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Earnings */}
      <section className="px-6 py-5 sm:px-8">
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-950">Earnings</h2>
          <p className="text-xs text-slate-500">
            Current pay-period earnings with year-to-date totals
          </p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="px-4 py-3 text-left font-semibold">Earnings</th>
                <th className="px-4 py-3 text-right font-semibold">Hours</th>
                <th className="px-4 py-3 text-right font-semibold">Rate</th>
                <th className="px-4 py-3 text-right font-semibold">Current</th>
                <th className="px-4 py-3 text-right font-semibold">YTD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-4 py-3 font-medium text-slate-900">Regular</td>
                <td className="px-4 py-3 text-right text-slate-600">{regularHours.toFixed(2)}</td>
                <td className="px-4 py-3 text-right text-slate-600">{payRate != null ? formatMoney(payRate) : "—"}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(regularAmount)}</td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatMoney(ytdRegularPay)}</td>
              </tr>
              {(bonusHours !== 0 || (ytd?.bonusHours ?? 0) !== 0) && (
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">Bonus</td>
                  <td className="px-4 py-3 text-right text-slate-600">{bonusHours.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{payRate != null ? formatMoney(bonusRate) : "—"}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatMoney(bonusAmount)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-violet-700">{formatMoney(ytdBonusPay)}</td>
                </tr>
              )}
              {(flatBonus !== 0 || (ytd?.flatBonus ?? 0) !== 0) && (
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">Flat Bonus</td>
                  <td className="px-4 py-3 text-right text-slate-400">—</td>
                  <td className="px-4 py-3 text-right text-slate-400">—</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatMoney(flatBonus)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">{formatMoney(ytd?.flatBonus ?? flatBonus)}</td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="bg-blue-50">
                <td colSpan={3} className="px-4 py-3 text-right font-bold text-blue-900">Gross Pay</td>
                <td className="px-4 py-3 text-right text-base font-black text-blue-700">{formatMoney(grossPay)}</td>
                <td className="px-4 py-3 text-right text-base font-black text-blue-700">{formatMoney(ytd?.grossPay ?? grossPay)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* Taxes */}
      <section className="border-t border-slate-100 px-6 py-5 sm:px-8">
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-950">Taxes</h2>
          <p className="text-xs text-slate-500">Required taxes withheld from gross pay</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-slate-100 text-slate-700"><th className="px-4 py-3 text-left font-semibold">Tax</th><th className="px-4 py-3 text-right font-semibold">Current</th><th className="px-4 py-3 text-right font-semibold">YTD</th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {[
                ["Federal Income Tax", taxDeductions.find(d => d.label.toLowerCase().includes("federal"))?.amount ?? 0, ytd?.federalTax ?? 0],
                ["Social Security", taxDeductions.find(d => d.label.toLowerCase().includes("social security"))?.amount ?? 0, ytd?.socialSecurity ?? 0],
                ["Medicare", taxDeductions.find(d => d.label.toLowerCase().includes("medicare"))?.amount ?? 0, ytd?.medicare ?? 0],
                ["State Tax", taxDeductions.find(d => d.label.toLowerCase().includes("state"))?.amount ?? 0, ytd?.stateTax ?? 0],
                ["Local Tax", taxDeductions.find(d => d.label.toLowerCase().includes("local"))?.amount ?? 0, ytd?.localTax ?? 0],
              ].filter(([, current, ytdAmount]) => Number(current) !== 0 || Number(ytdAmount) !== 0).map(([label, current, ytdAmount]) => (
                <tr key={String(label)}>
                  <td className="px-4 py-3 font-medium text-slate-800">{label}</td>
                  <td className="px-4 py-3 text-right font-semibold text-rose-600">{Number(current) > 0 ? `−${formatMoney(Number(current))}` : formatMoney(0)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-rose-700">{Number(ytdAmount) > 0 ? `−${formatMoney(Number(ytdAmount))}` : formatMoney(0)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot><tr className="bg-rose-50"><td className="px-4 py-3 text-right font-bold text-rose-900">Total Taxes</td><td className="px-4 py-3 text-right text-base font-black text-rose-700">−{formatMoney(currentTaxes)}</td><td className="px-4 py-3 text-right text-base font-black text-rose-700">−{formatMoney(ytdTaxes)}</td></tr></tfoot>
          </table>
        </div>
      </section>

      {/* Other Deductions */}
      <section className="border-t border-slate-100 px-6 py-5 sm:px-8">
        <div className="mb-3">
          <h2 className="text-base font-bold text-slate-950">Other Deductions</h2>
          <p className="text-xs text-slate-500">Insurance, retirement, garnishments, uniforms, and other deductions</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-slate-100 text-slate-700"><th className="px-4 py-3 text-left font-semibold">Deduction</th><th className="px-4 py-3 text-right font-semibold">Current</th><th className="px-4 py-3 text-right font-semibold">YTD</th></tr></thead>
            <tbody className="divide-y divide-slate-200">
              {otherDeductionRows.length > 0 ? otherDeductionRows.map((deduction, index) => (
                <tr key={`${deduction.label}-${index}`}><td className="px-4 py-3 font-medium text-slate-800">{deduction.label}</td><td className="px-4 py-3 text-right font-semibold text-rose-600">{deduction.amount > 0 ? `−${formatMoney(deduction.amount)}` : formatMoney(0)}</td><td className="px-4 py-3 text-right font-semibold text-rose-700">{index === 0 && ytdOtherDeductions > 0 ? `−${formatMoney(ytdOtherDeductions)}` : formatMoney(0)}</td></tr>
              )) : (
                <tr><td className="px-4 py-4 text-slate-600">No other deductions</td><td className="px-4 py-4 text-right">{formatMoney(0)}</td><td className="px-4 py-4 text-right">{formatMoney(ytdOtherDeductions)}</td></tr>
              )}
            </tbody>
            <tfoot><tr className="bg-amber-50"><td className="px-4 py-3 text-right font-bold text-amber-900">Total Other Deductions</td><td className="px-4 py-3 text-right text-base font-black text-amber-700">−{formatMoney(currentOtherDeductions)}</td><td className="px-4 py-3 text-right text-base font-black text-amber-700">−{formatMoney(ytdOtherDeductions)}</td></tr></tfoot>
          </table>
        </div>
      </section>

      {/* Net Pay */}
      <section className="mx-6 mb-5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-5 text-white shadow-lg shadow-emerald-600/15 sm:mx-8">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">Net Pay</p>
            <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-emerald-100">Gross Pay</p><p className="mt-1 font-bold">{formatMoney(grossPay)}</p></div>
              <div><p className="text-emerald-100">Taxes</p><p className="mt-1 font-bold">−{formatMoney(currentTaxes)}</p></div>
              <div><p className="text-emerald-100">Other Deductions</p><p className="mt-1 font-bold">−{formatMoney(currentOtherDeductions)}</p></div>
            </div>
          </div>
          <div className="border-t border-white/20 pt-4 text-left sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0 sm:text-right"><p className="text-xs uppercase tracking-wide text-emerald-100">Take-home pay</p><p className="mt-1 text-3xl font-black tracking-tight">{formatMoney(netPay)}</p></div>
        </div>
      </section>

      {/* YTD Totals */}
      <section className="mx-6 mb-6 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5 sm:mx-8">
        <div className="mb-3"><h2 className="text-base font-bold text-slate-950">YTD Totals</h2><p className="text-xs text-slate-500">Calendar-year totals through this pay date</p></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Gross Earnings</p><p className="mt-1 font-bold text-blue-700">{formatMoney(ytd?.grossPay ?? grossPay)}</p></div>
          <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Taxes Withheld</p><p className="mt-1 font-bold text-rose-700">{formatMoney(ytdTaxes)}</p></div>
          <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Other Deductions</p><p className="mt-1 font-bold text-amber-700">{formatMoney(ytdOtherDeductions)}</p></div>
          <div className="rounded-xl bg-white p-3 shadow-sm"><p className="text-xs text-slate-500">Net Pay</p><p className="mt-1 font-bold text-emerald-700">{formatMoney(ytd?.netPay ?? netPay)}</p></div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-xs text-slate-500 sm:px-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p>
              This is an electronically generated pay statement from{" "}
              <span className="font-semibold text-slate-700">{companyName}</span>.
            </p>
            {companyContact ? (
              <p className="mt-1 text-slate-600">{companyContact}</p>
            ) : null}
          </div>

          <p className="font-medium text-slate-500">
            Keep this statement for your records.
          </p>
        </div>
      </footer>
    </article>
  );
}