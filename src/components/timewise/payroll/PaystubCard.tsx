// src/components/timewise/payroll/PaystubCard.tsx
"use client";

type PaystubDeduction = {
  label: string;
  amount: number;
};

type PaystubCardProps = {
  companyName: string;
  logoUrl?: string;
  employeeName: string;
  employeeId?: string;
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
};

export function PaystubCard({
  companyName,
  logoUrl,
  employeeName,
  employeeId,
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
}: PaystubCardProps) {
    const totalDeductions = deductions.reduce((sum, d) => sum + d.amount, 0);

  const regularAmount =
    payRate != null ? regularHours * payRate : 0;

  const bonusRate =
    payRate != null ? payRate + 0.5 : 0;

  const bonusAmount =
    payRate != null ? bonusHours * bonusRate : 0;

  return (
    <div className="mx-auto w-full max-w-4xl bg-white text-black shadow-sm print:max-w-none print:shadow-none">
      <div className="border-b px-6 py-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={`${companyName} logo`}
                className="h-14 w-auto object-contain"
              />
            ) : (
              <div className="text-lg font-bold">{companyName}</div>
            )}

            <div>
              <h1 className="text-xl font-bold tracking-tight">
  {companyName}
</h1>
<p className="text-xs text-gray-500">
  Commercial Cleaning Services
</p>
              <p className="text-sm text-gray-600">Employee Pay Stub</p>
            </div>
          </div>

          <div className="text-sm">
            <div>
              <span className="font-semibold">Pay Date:</span> {payDate}
            </div>
            <div>
              <span className="font-semibold">Pay Period:</span> {payPeriodStart} - {payPeriodEnd}
            </div>
            {employeeId ? (
              <div>
                <span className="font-semibold">Employee ID:</span> {employeeId}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-6 py-4 md:grid-cols-2">
        <div className="rounded-md border p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            Employee Information
          </h2>
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-semibold">Name:</span> {employeeName}
            </div>
            {payRate != null ? (
              <div>
                <span className="font-semibold">Pay Rate:</span> ${payRate.toFixed(2)}/hr
              </div>
            ) : null}
            <div>
  <span className="font-semibold">Hours Worked:</span>{" "}
  {(regularHours + bonusHours).toFixed(2)}
</div>
          </div>
        </div>

        <div className="rounded-md border p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
            Pay Summary
          </h2>
          <div className="space-y-1 text-sm">
            <div>
              <span className="font-semibold">Gross Pay:</span> ${grossPay.toFixed(2)}
            </div>
            <div>
              <span className="font-semibold">Total Deductions:</span> ${totalDeductions.toFixed(2)}
            </div>
            <div className="text-lg font-bold text-green-700">
              <span>Net Pay:</span> ${netPay.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-2">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          Earnings
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b bg-gray-50 px-3 py-2 text-left font-semibold">Description</th>
              <th className="border-b bg-gray-50 px-3 py-2 text-right font-semibold">Hours</th>
              <th className="border-b bg-gray-50 px-3 py-2 text-right font-semibold">Rate</th>
              <th className="border-b bg-gray-50 px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
  <tr>
    <td className="border-b px-3 py-2">Regular</td>
    <td className="border-b px-3 py-2 text-right">
      {regularHours.toFixed(2)}
    </td>
    <td className="border-b px-3 py-2 text-right">
      {payRate != null ? `$${payRate.toFixed(2)}` : "-"}
    </td>
    <td className="border-b px-3 py-2 text-right">
      ${regularAmount.toFixed(2)}
    </td>
  </tr>

  {bonusHours > 0 ? (
    <tr>
      <td className="border-b px-3 py-2">Bonus</td>
      <td className="border-b px-3 py-2 text-right">
        {bonusHours.toFixed(2)}
      </td>
      <td className="border-b px-3 py-2 text-right">
        ${bonusRate.toFixed(2)}
      </td>
      <td className="border-b px-3 py-2 text-right">
        ${bonusAmount.toFixed(2)}
      </td>
    </tr>
  ) : null}

  {flatBonus > 0 ? (
    <tr>
      <td className="border-b px-3 py-2">Flat Bonus</td>
      <td className="border-b px-3 py-2 text-right">-</td>
      <td className="border-b px-3 py-2 text-right">-</td>
      <td className="border-b px-3 py-2 text-right">
        ${flatBonus.toFixed(2)}
      </td>
    </tr>
  ) : null}
</tbody>
        </table>
      </div>

      <div className="px-6 py-4">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-600">
          Deductions
        </h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b bg-gray-50 px-3 py-2 text-left font-semibold">Description</th>
              <th className="border-b bg-gray-50 px-3 py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {deductions.length > 0 ? (
              deductions.map((d) => (
                <tr key={d.label}>
                  <td className="border-b px-3 py-2">{d.label}</td>
                  <td className="border-b px-3 py-2 text-right">${d.amount.toFixed(2)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="border-b px-3 py-2">No deductions</td>
                <td className="border-b px-3 py-2 text-right">$0.00</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t px-6 py-4 text-xs text-gray-500 space-y-1">
  <div>This is a generated pay statement from {companyName}.</div>

  <div className="font-medium text-gray-700">
    Amazing Grace Cleaners LLC
  </div>

  <div>Email: amazinggracecleaners1@gmail.com</div>
  <div>Phone: (859) 740-0101</div>
</div>
    </div>
  );
}