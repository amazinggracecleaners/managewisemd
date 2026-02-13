
import React, { createContext, useContext, useMemo } from "react";
import { useSettings } from "@/features/settings/hooks/useSettings";

const Ctx = createContext<{ companyId: string }|null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const companyId = useMemo(
    () => (settings.companyId?.trim()) || process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners",
    [settings.companyId]
  );
  return <Ctx.Provider value={{ companyId }}>{children}</Ctx.Provider>;
}
export const useCompany = () => {
  const v = useContext(Ctx); if (!v) throw new Error("CompanyProvider missing");
  return v;
};
