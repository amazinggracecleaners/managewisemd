"use client";

import React, { createContext, useContext, useMemo } from "react";

type CompanyContextValue = {
  companyId: string;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const companyId = useMemo(() => {
    return process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners";
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