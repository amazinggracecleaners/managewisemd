import { useEffect, useState } from "react";
import type { Invoice } from "@/shared/types/domain";
import { useEngine } from "@/providers/EngineProvider";
import { useCompany } from "@/providers/CompanyProvider";

export function useInvoices() {
  const { repo } = useEngine();
  const { companyId } = useCompany();
  const [data, setData] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const r = repo.invoices();
    const unsubBus = r.onChange(setData);
    const unsubFs = r.watchAll({ companyId });
    setLoading(false);
    return () => { unsubFs?.(); unsubBus?.(); };
  }, [repo, companyId]);

  const create = (payload: Omit<Invoice, "id">) => repo.invoices().create(companyId, payload);
  const update = (id: string, patch: Partial<Invoice>) => repo.invoices().update(companyId, id, patch);
  const remove = (id: string) => repo.invoices().remove(companyId, id);

  return { invoices: data, create, update, remove, loading };
}
