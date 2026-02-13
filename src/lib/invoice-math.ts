// src/lib/invoice-math.ts
import type { Invoice } from "@/shared/types/domain";

export type InvoiceLike = Partial<Invoice> & {
  taxRate?: number;               // e.g. 0.07 for 7%
  discountPercent?: number;       // e.g. 0.10 for 10%
  discountAmount?: number;        // fixed dollar off
};

export function computeInvoiceTotals(inv: InvoiceLike) {
  const items = (inv.lineItems ?? []).map((li: any) => {
    const qty = Number(li.quantity ?? 0);
    const price = Number(li.unitPrice ?? 0);
    const total = round2(qty * price);
    return { ...li, quantity: qty, unitPrice: price, total };
  });

  const subtotal = round2(items.reduce((s: number, li: any) => s + Number(li.total ?? 0), 0));

  const taxRate = Math.max(0, Number(inv.taxRate ?? 0));
  const tax = round2(subtotal * taxRate);

  const discountPct = Math.max(0, Number(inv.discountPercent ?? 0));
  const pctOff = round2(subtotal * discountPct);

  const discountAmt = Math.max(0, Number(inv.discountAmount ?? 0));

  // Apply percent first, then fixed amount (cap at subtotal)
  const discount = Math.min(round2(pctOff + discountAmt), subtotal);

  const total = round2(subtotal + tax - discount);

  return {
    items,
    subtotal,
    tax,
    discount,
    total,
  };
}

export function withComputed<T extends InvoiceLike>(inv: T): T & { subtotal: number, tax: number, discount: number, total: number } {
  const { items, subtotal, tax, discount, total } = computeInvoiceTotals(inv);
  return { ...inv, lineItems: items, subtotal, tax, discount, total };
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
