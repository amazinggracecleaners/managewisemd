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
  const getYTDDeductionAmount = (
  label: string
): number => {
  const normalized = label
    .trim()
    .toLowerCase();

  if (normalized.includes("federal")) {
    return ytd?.federalTax ?? 0;
  }

  if (normalized.includes("state")) {
    return ytd?.stateTax ?? 0;
  }

  if (normalized.includes("local")) {
    return ytd?.localTax ?? 0;
  }

  if (normalized.includes("social security")) {
    return ytd?.socialSecurity ?? 0;
  }

  if (normalized.includes("medicare")) {
    return ytd?.medicare ?? 0;
  }

  if (normalized === "deductions") {
  return ytd?.totalDeductions ?? 0;
}

if (normalized.includes("other")) {
  return ytd?.otherDeductions ?? 0;
}

  return 0;
};

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
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">Earnings</h2>
            <p className="text-xs text-slate-500">
              Hours, rates, and earnings for this pay period
            </p>
          </div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
            Gross {formatMoney(grossPay)}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
  <tr>
    <th className="border-b bg-gray-50 px-3 py-2 text-left font-semibold">
      Description
    </th>
    <th className="border-b bg-gray-50 px-3 py-2 text-right font-semibold">
      Current Hours
    </th>
    <th className="border-b bg-gray-50 px-3 py-2 text-right font-semibold">
      Rate
    </th>
    <th className="border-b bg-gray-50 px-3 py-2 text-right font-semibold">
      Current Amount
    </th>
    <th className="border-b bg-gray-50 px-3 py-2 text-right font-semibold">
      YTD
    </th>
  </tr>
</thead>

            <tbody className="divide-y divide-slate-200">
              <tr>
                <td className="px-4 py-3 font-medium text-slate-900">
                  Regular earnings
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {regularHours.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right text-slate-600">
                  {payRate != null ? formatMoney(payRate) : "—"}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">
                  {formatMoney(regularAmount)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-blue-700">
  {(ytd?.regularHours ?? regularHours).toFixed(2)}
</td>
              </tr>

              {bonusHours > 0 ? (
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    Bonus hours
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {bonusHours.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {payRate != null ? formatMoney(bonusRate) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatMoney(bonusAmount)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-violet-700">
  {(ytd?.bonusHours ?? bonusHours).toFixed(2)}
</td>
                </tr>
              ) : null}

              {flatBonus > 0 ? (
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    Flat bonus
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">—</td>
                  <td className="px-4 py-3 text-right text-slate-400">—</td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">
                    {formatMoney(flatBonus)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-blue-700">
  {formatMoney(ytd?.flatBonus ?? flatBonus)}
</td>
                </tr>
              ) : null}
            </tbody>

            <tfoot>
  <tr className="bg-blue-50">
    <td
      colSpan={3}
      className="px-4 py-3 text-right font-bold text-blue-900"
    >
      Total gross pay
    </td>

    <td className="px-4 py-3 text-right text-base font-black text-blue-700">
      {formatMoney(grossPay)}
    </td>

    <td className="px-4 py-3 text-right text-base font-black text-blue-700">
      {formatMoney(ytd?.grossPay ?? grossPay)}
    </td>
  </tr>
</tfoot>
          </table>
        </div>
      </section>

      {/* Deductions */}
      <section className="border-t border-slate-100 px-6 py-5 sm:px-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">
              Taxes & Deductions
            </h2>
            <p className="text-xs text-slate-500">
              Amounts withheld from gross pay
            </p>
          </div>
          <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
            Total {formatMoney(totalDeductions)}
          </span>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <table className="w-full border-collapse text-sm">
            <thead>
  <tr className="bg-slate-100 text-slate-700">
    <th className="px-4 py-3 text-left font-semibold">
      Description
    </th>

    <th className="px-4 py-3 text-right font-semibold">
      Current
    </th>

    <th className="px-4 py-3 text-right font-semibold">
      YTD
    </th>
  </tr>
</thead>

            <tbody className="divide-y divide-slate-200">
              {safeDeductions.length > 0 ? (
                safeDeductions.map((deduction, index) => (
                  <tr key={`${deduction.label}-${index}`}>
  <td className="px-4 py-3 font-medium text-slate-800">
    {deduction.label}
  </td>

  <td className="px-4 py-3 text-right font-semibold text-rose-600">
    −{formatMoney(deduction.amount)}
  </td>

  <td className="px-4 py-3 text-right font-semibold text-rose-700">
    −{formatMoney(
      getYTDDeductionAmount(deduction.label)
    )}
  </td>
</tr>
                ))
              ) : (
                <tr>
                  <td className="px-4 py-4 text-slate-600">No deductions</td>
                  <td className="px-4 py-4 text-right font-semibold text-slate-700">
                    {formatMoney(0)}
                  </td>
                   <td className="px-4 py-4 text-right font-semibold text-slate-700">
    {formatMoney(ytd?.totalDeductions ?? 0)}
  </td>
                </tr>
              )}
            </tbody>

           <tfoot>
  <tr className="bg-rose-50">
    <td className="px-4 py-3 text-right font-bold text-rose-900">
      Total deductions
    </td>

    <td className="px-4 py-3 text-right text-base font-black text-rose-700">
      −{formatMoney(totalDeductions)}
    </td>

    <td className="px-4 py-3 text-right text-base font-black text-rose-700">
      −{formatMoney(
        ytd?.totalDeductions ?? totalDeductions
      )}
    </td>
  </tr>
</tfoot>
          </table>
        </div>
      </section>

      {/* Final net-pay band */}
      <section className="mx-6 mb-6 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-4 text-white shadow-lg shadow-emerald-600/15 sm:mx-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
              Net pay
            </p>
            <p className="mt-1 text-sm text-emerald-50/90">
              Gross pay minus taxes and deductions
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6 text-right">
  <div>
    <p className="text-xs uppercase tracking-wide text-emerald-100">
      Current
    </p>
    <p className="mt-1 text-2xl font-black tracking-tight">
      {formatMoney(netPay)}
    </p>
  </div>

  <div>
    <p className="text-xs uppercase tracking-wide text-emerald-100">
      YTD
    </p>
    <p className="mt-1 text-2xl font-black tracking-tight">
      {formatMoney(ytd?.netPay ?? netPay)}
    </p>
  </div>
</div>
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