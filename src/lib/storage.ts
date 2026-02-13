

import type { Settings, Entry, CleaningSchedule, MileageLog, Employee, Invoice, OtherExpense, PayrollPeriod } from "@/shared/types/domain";
import { defaultSettings, KEY_SETTINGS, KEY_LOCAL, KEY_SCHEDULES, KEY_MILEAGE, KEY_EMPLOYEES, KEY_OTHER_EXPENSES, KEY_INVOICES, KEY_PAYROLL_PERIODS } from "@/lib/constants";

function safeJsonParse<T>(key: string, defaultValue: T): T {
  if (typeof window === "undefined") return defaultValue;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) || defaultValue;
  } catch {
    return defaultValue;
  }
}


export function loadSettings(): Settings {
  const loaded = safeJsonParse<Partial<Settings>>(KEY_SETTINGS, {});
  // Merge defaults with loaded settings. ENV var for companyId is handled in page.tsx now.
  return { 
      ...defaultSettings, 
      ...loaded,
  };
}

export function saveSettings(s: Settings) {
  if (typeof window === "undefined") return;
  const toSave = {...s};
  // Don't save the full firebaseConfig to local storage
  delete toSave.firebaseConfig;
  
  localStorage.setItem(KEY_SETTINGS, JSON.stringify(toSave));
}

export function loadLocalEntries(): Entry[] {
  return safeJsonParse<Entry[]>(KEY_LOCAL, []);
}

export function saveLocalEntries(entries: Entry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_LOCAL, JSON.stringify(entries));
}

// --- Functions for Schedules and Mileage ---

export function loadLocalSchedules(): CleaningSchedule[] {
 return safeJsonParse<CleaningSchedule[]>(KEY_SCHEDULES, []);
}

export function saveLocalSchedules(schedules: CleaningSchedule[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_SCHEDULES, JSON.stringify(schedules));
}

export function loadLocalMileageLogs(): MileageLog[] {
  return safeJsonParse<MileageLog[]>(KEY_MILEAGE, []);
}

export function saveLocalMileageLogs(logs: MileageLog[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_MILEAGE, JSON.stringify(logs));
}

// --- Functions for Employees ---

export function loadLocalEmployees(): Employee[] {
  return safeJsonParse<Employee[]>(KEY_EMPLOYEES, []);
}

export function saveLocalEmployees(employees: Employee[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_EMPLOYEES, JSON.stringify(employees));
}


// --- Functions for Invoices ---

export function loadLocalInvoices(): Invoice[] {
  return safeJsonParse<Invoice[]>(KEY_INVOICES, []);
}

export function saveLocalInvoices(invoices: Invoice[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY_INVOICES, JSON.stringify(invoices));
}

// --- Functions for Other Expenses ---

export function loadLocalOtherExpenses(): OtherExpense[] {
    return safeJsonParse<OtherExpense[]>(KEY_OTHER_EXPENSES, []);
}

export function saveLocalOtherExpenses(expenses: OtherExpense[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY_OTHER_EXPENSES, JSON.stringify(expenses));
}

// --- Functions for Payroll Periods ---

export function loadLocalPayrollPeriods(): PayrollPeriod[] {
    return safeJsonParse<PayrollPeriod[]>(KEY_PAYROLL_PERIODS, []);
}

export function saveLocalPayrollPeriods(periods: PayrollPeriod[]) {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY_PAYROLL_PERIODS, JSON.stringify(periods));
}


    
