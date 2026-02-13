// src/lib/invoice-export.ts
import type { Invoice } from "@/shared/types/domain";
import { withComputed } from "./invoice-math";

export function exportInvoiceToPDF(inv: Invoice, orgName = "ManageWise") {
  const computed = withComputed(inv as any);

  const styles = `
    <style>
      *{box-sizing:border-box}
      body{font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:24px}
      .wrap{max-width:800px;margin:0 auto}
      h1,h2,h3{margin:0 0 8px}
      .muted{color:#555}
      .row{display:flex;gap:24px;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;margin-top:12px}
      th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:14px}
      th{background:#f9fafb;font-weight:600}
      .right{text-align:right}
      .totals{margin-top:16px;display:grid;gap:6px;max-width:320px;margin-left:auto}
      .totals .line{display:flex;justify-content:space-between}
      .grand{font-size:18px;font-weight:700;border-top:2px solid #111;margin-top:8px;padding-top:8px}
      .badge{display:inline-block;padding:2px 8px;border-radius:9999px;border:1px solid #e5e7eb;font-size:12px}
      @media print {.no-print{display:none}}
    </style>
  `;

  const lineRows = (computed.lineItems ?? []).map((li: any) => `
    <tr>
      <td>${escapeHtml(li.description ?? "")}</td>
      <td class="right">${num(li.quantity)}</td>
      <td class="right">$${num(li.unitPrice)}</td>
      <td class="right">$${num(li.total)}</td>
    </tr>
  `).join("");

  const html = `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Invoice ${escapeHtml(inv.invoiceNumber ?? "")}</title>
        ${styles}
      </head>
      <body>
        <div class="wrap">
          <div class="row">
            <div>
              <h1>${escapeHtml(orgName)}</h1>
              <div class="muted">${escapeHtml((inv as any).fromAddress ?? "")}</div>
            </div>
            <div class="right">
              <h2>Invoice</h2>
              <div># ${escapeHtml(inv.invoiceNumber ?? "")}</div>
              <div class="muted">Date: ${escapeHtml(inv.date ?? "")}</div>
              <div class="muted">Due: ${escapeHtml(inv.dueDate ?? "")}</div>
              ${inv.status ? `<div class="badge" style="margin-top:6px">${escapeHtml(inv.status)}</div>` : ""}
            </div>
          </div>

          <div class="row">
            <div>
              <h3>Bill To</h3>
              <div>${escapeHtml((inv as any).billToName ?? inv.siteName ?? "")}</div>
              <div class="muted">${escapeHtml((inv as any).billToAddress ?? "")}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="right">Qty</th>
                <th class="right">Unit</th>
                <th class="right">Line Total</th>
              </tr>
            </thead>
            <tbody>
              ${lineRows || `<tr><td colspan="4" class="muted">No line items</td></tr>`}
            </tbody>
          </table>

          <div class="totals">
            <div class="line"><div>Subtotal</div><div>$${num(computed.subtotal)}</div></div>
            <div class="line"><div>Tax</div><div>$${num(computed.tax)}</div></div>
            <div class="line"><div>Discount</div><div>−$${num(computed.discount)}</div></div>
            <div class="line grand"><div>Total</div><div>$${num(computed.total)}</div></div>
          </div>

          ${inv.notes ? `<div style="margin-top:16px"><h3>Notes</h3><div class="muted">${escapeHtml(inv.notes)}</div></div>` : ""}

          <div class="no-print" style="margin-top:24px;text-align:right">
            <button onclick="window.print()">Print / Save as PDF</button>
          </div>
        </div>
        <script>setTimeout(()=>window.print(), 50)</script>
      </body>
    </html>
  `;

  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=800");
  if (!w) return;
  w.document.open();
  w.document.write(html);
  w.document.close();
}

function num(n: any){ return Number(n ?? 0).toFixed(2); }
function escapeHtml(s: string){
  return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]!));
}
