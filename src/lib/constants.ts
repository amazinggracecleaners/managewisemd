import type { Settings } from "@/shared/types/domain";

export const KEY_LOCAL = "timewise.v1.entries";
export const KEY_SETTINGS = "timewise.v1.settings";
export const KEY_SCHEDULES = "timewise.v1.schedules";
export const KEY_MILEAGE = "timewise.v1.mileage";
export const KEY_EMPLOYEES = "timewise.v1.employees";
export const KEY_INVOICES = "timewise.v1.invoices";
export const KEY_OTHER_EXPENSES = "timewise.v1.other_expenses";
export const KEY_PAYROLL_PERIODS = "timewise.v1.payroll_periods";

export const DEFAULT_PIN = "1953";

export const defaultSettings: Settings = {
  engine: "cloud",
  managerPIN: DEFAULT_PIN,
  requireGPS: false,
  sites: [
    { id: "general", name: "General", color: "#64748b" },
    { id: "site-a", name: "Site A", color: "#ef4444" },
    { id: "site-b", name: "Site B", color: "#3b82f6" },
  ],
  companyId: process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners",
  weekStartsOn: 0, // Sunday
  mileageRate: 0.58,
  taxRate: 0,
  requireGeofence: true,
  geofenceRadius: 100, // meters (or feet — just be consistent)
};
