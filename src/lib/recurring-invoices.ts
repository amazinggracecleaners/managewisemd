import type { Invoice } from "@/shared/types/domain";

const toMonthKey = (date?: string | null) =>
  date ? date.slice(0, 7) : undefined;

export function generateRecurringInvoicesForMonth(args: {
  targetMonthISO: string; // YYYY-MM
  allInvoices: Invoice[];
}): Omit<Invoice, "id">[] {
  const { targetMonthISO, allInvoices } = args;

  /*
   * Only true recurring templates may generate invoices.
   *
   * Generated monthly invoices are saved with recurring: false,
   * so they can never become additional templates.
   */
  const templates = allInvoices.filter(
    (invoice) => invoice.recurring === true
  );

  const results: Omit<Invoice, "id">[] = [];

  /*
   * Keep track of template/month combinations during this generation
   * pass as an additional duplicate safeguard.
   */
  const generatedKeys = new Set<string>();

  for (const template of templates) {
    const templateId =
      template.recurringTemplateId || template.id;

    const generationKey =
      `${templateId}_${targetMonthISO}`;

    /*
     * Prevent the same template from producing two invoices
     * during this invocation.
     */
    if (generatedKeys.has(generationKey)) {
      continue;
    }

    const startKey = toMonthKey(template.recurringStart);
    const endKey = toMonthKey(template.recurringEnd);

    if (startKey && targetMonthISO < startKey) {
      continue;
    }

    if (endKey && targetMonthISO > endKey) {
      continue;
    }

    /*
 * Saved-invoice duplicate check:
 * has an invoice for this template/month already been saved?
 */
    const alreadyExists = allInvoices.some((invoice) => {
      if (invoice.id === template.id) {
        return false;
      }

      const invoiceTemplateId =
        invoice.recurringTemplateId;

      const invoiceMonth =
        toMonthKey(
          invoice.serviceStartDate || invoice.date
        );

      return (
        invoiceTemplateId === templateId &&
        invoiceMonth === targetMonthISO
      );
    });

    if (alreadyExists) {
      generatedKeys.add(generationKey);
      continue;
    }

    const { id: _ignoredId, ...rest } = template;

    results.push({
      ...rest,

      /*
       * InvoiceView will normalize the actual invoice date,
       * service period, Due Date and Paid Date.
       */
      date: `${targetMonthISO}-01`,

      serviceStartDate: `${targetMonthISO}-01`,

      status: "draft",

      /*
       * This is the critical duplicate-prevention change.
       * A generated invoice is NOT another recurring template.
       */
      recurring: false,

      recurringTemplateId: templateId,

      amountPaid: null,

      statusManuallyOverridden: false,
    });

    generatedKeys.add(generationKey);
  }

  return results;
}