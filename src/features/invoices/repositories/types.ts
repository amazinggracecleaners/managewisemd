import type { Invoice } from "@/shared/types/domain";

export interface InvoicesRepo {
  onChange(fn: (list: Invoice[]) => void): () => void;
  watchAll(opts: { companyId: string; }): () => void; // returns unsubscribe; sets internal emitter or callback
  create(companyId: string, data: Omit<Invoice, "id">): Promise<Invoice>;
  update(companyId: string, id: string, patch: Partial<Invoice>): Promise<void>;
  remove(companyId: string, id: string): Promise<void>;
}
