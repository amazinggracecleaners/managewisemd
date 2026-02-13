import type { Invoice } from "@/shared/types/domain";

const toMonthKey = (d: string | undefined) => (d ? d.slice(0, 7) : undefined);

export function generateRecurringInvoicesForMonth(args: {
  targetMonthISO: string; // "YYYY-MM"
  allInvoices: Invoice[];
}): Omit<Invoice, "id">[] {
  const { targetMonthISO, allInvoices } = args;

  const templates = allInvoices.filter((inv) => inv.recurring);
  const results: Omit<Invoice, "id">[] = [];

  for (const tmpl of templates) {
    const templateId = tmpl.recurringTemplateId || tmpl.id;

    const startKey = toMonthKey(tmpl.recurringStart);
    const endKey = toMonthKey(tmpl.recurringEnd || undefined);

    if (startKey && targetMonthISO < startKey) continue;
    if (endKey && targetMonthISO > endKey) continue;

    const alreadyExists = allInvoices.some((inv) => {
      const templateKey = inv.recurringTemplateId || null;
      const monthKey = toMonthKey(inv.date);
      return templateKey === templateId && monthKey === targetMonthISO;
    });
    if (alreadyExists) continue;

    const baseDate = tmpl.date ? new Date(tmpl.date) : new Date();
    const day = tmpl.recurringDayOfMonth || baseDate.getDate();
    const dayPadded = String(day).padStart(2, "0");
    const targetDateStr = `${targetMonthISO}-${dayPadded}`;

    const { id: _ignore, ...rest } = tmpl;

    results.push({
      ...rest,
      date: targetDateStr,
      dueDate: targetDateStr,
      status: "draft",
      recurringTemplateId: templateId,
    });
  }

  return results;
}
