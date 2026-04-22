"use client";

import React, { createContext, useContext, useMemo } from "react";

type CompanyContextValue = {
  companyId: string;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const companyId = useMemo(() => {
    const id =
      process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners";

    console.log("[COMPANY DEBUG] resolved companyId =", id);

    return id;
  }, []);

  return (
    <CompanyContext.Provider value={{ companyId }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const value = useContext(CompanyContext);
  if (!value) throw new Error("CompanyProvider missing");
  return value;
}