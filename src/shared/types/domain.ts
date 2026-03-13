

import type { Timestamp } from "firebase/firestore";

export type Entry = {
  id: string;
  employee: string; // employee name, denormalized for display
  employeeId: string; // stable fk
  action: "in" | "out";
  ts: number; // epoch ms
  lat?: number;
  lng?: number;
  note?: string;
  site?: string;
  // Firestore-specific fields
  createdAt?: Timestamp;
};

// Lightweight DTO for AI summary actions
export type AiEntry = Pick<Entry, "employee" | "action" | "site" | "lat" | "lng" | "note"> & {
  ts: string;    // ISO string
  id?: string;   // optional 
  employeeId: string;
};


export type FirebaseOptions = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  [key: string]: any;
}

export type Site = {
  id: string; 
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  color?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  notes?: string;
  entranceMethod?: string;
  alarmCode?: string;
  servicePrice?: number;
  billingFrequency?: BillingFrequency;
  bonusType?: 'hourly' | 'flat';
  bonusAmount?: number;
  geofenceRadiusFeet?: number;
};

export type DayOfWeek = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export type BillingFrequency = 'One-Time' | 'Daily' | 'Weekly' | 'Bi-Weekly' | 'Monthly' | 'Quarterly' | 'Yearly';

export type RepeatFrequency = 'does-not-repeat' | 'weekly' | 'every-2-weeks' | 'every-3-weeks' | 'monthly' | 'every-2-months' | 'quarterly' | 'yearly';

export type CleaningSchedule = {
  id: string;
  siteName: string;
  tasks: string;
  assignedTo: string[];
  note?: string;
  
  // New recurrence model
  startDate: string; // YYYY-MM-DD, the anchor date for the recurrence
  repeatFrequency: RepeatFrequency;
  daysOfWeek?: DayOfWeek[]; // Only for 'weekly', 'every-2-weeks', 'every-3-weeks'
  
  repeatUntil?: string; // yyyy-MM-dd, optional end date
  servicePrice?: number;
  billingFrequency?: BillingFrequency;
  exceptionDates?: string[];
  assignedTeamId?: string; // references settings.teams[].id

};


export type MileageLog = {
  id: string;
  date: string; // yyyy-MM-dd
  distance: number;
  purpose: string;
  siteName?: string;
  startCoords?: { lat: number; lng: number };
  endCoords?: { lat: number; lng: number };
}

export type OtherExpense = {
  id: string;
  date: string; // yyyy-MM-dd
  vendor?: string;
  description: string;
  amount: number;
  siteId?: string; // canonical directory key (preferred)
  site?: string; // legacy free text
  siteName?: string; // legacy alias
  receiptUrl?: string;
  receiptPath?: string;
  receiptMime?: string;
  receiptSize?: number;
  createdAt?: any;
  updatedAt?: any;
};

export type Employee = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  dob?: string;
  title?: string;
  address?: string;
  phone?: string;
  payRate: number; // Default dollars per hour
  hourlyRate?: number;
  pin: string;
  color?: string;

  // Manager-only organization
  teamId?: string;
  teamName?: string;

  emergencyContact?: {
    name: string;
    phone: string;
  };

  bankInfo?: {
    bankName: string;
    accountNumber: string;
    routingNumber: string;
  };
};
// shared/types/domain.ts
export type Team = {
  id: string;   // "team-a" (stable id)
  name: string; // "Team A" (display)
};

export type Invoice = {
  id: string;
  siteId?: string; // preferred
  siteName: string; // legacy alias
  invoiceNumber: string;
  date: string; // yyyy-MM-dd
  dueDate: string; // yyyy-MM-dd
  lineItems: InvoiceLineItem[];
  notes?: string;
  taxRate?: number;
  discountPercent?: number;
  discountAmount?: number;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  status: 'draft' | 'sent' | 'paid' | 'void';

  // 🔁 Recurring metadata
  recurring?: boolean;              // true if this is a monthly template
  recurringDayOfMonth?: number;     // if omitted, use the day from `date`
  recurringStart?: string;          // "YYYY-MM-DD" – first month to include
  recurringEnd?: string | null;     // "YYYY-MM-DD" – last month to include (optional)
  recurringTemplateId?: string;     // stable key linking all generated copies to the template
}

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export type Settings = {
  engine: "local" | "cloud";
  managerPIN: string;
  requireGPS: boolean;
  sites: Site[];
  firebaseConfig?: FirebaseOptions;
  companyId?: string;
   companyName?: string; 
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0 = Sunday, 1 = Monday, etc.
  mileageRate: number; // dollars per mile
  taxRate?: number;
  requireGeofence: boolean;
  geofenceRadius: number; // in feet now
  defaultHourlyWage?: number;
  lastBackupAt?: string;
  readOnlyMode?: boolean;
   teams?: Team[];
};

export type Session = {
  employee: string;
  employeeId: string;
  in?: Entry;
  out: Entry | null;
  minutes: number;
  active?: boolean;
};

export type SiteStatus = 'incomplete' | 'in-process' | 'complete';


export type PayrollStatus =
  | "draft"
  | "waiting_for_confirmation"
  | "ready_to_pay"
  | "paid";

export interface PayrollPeriod {
  id: string;

  startDate: string;
  endDate: string;

  status: PayrollStatus;

  revision: number;

  lineItems: PayrollLineItem[];

  // NEW FIELDS
  sentForConfirmationAt?: string;
  sentForConfirmationByUid?: string | null;
  paidAt?: string;
   paidByUid?: string | null;
}

export interface PayrollLineItem {
  employeeId: string;
  employeeName: string;

  minutes?: number;
  regularMinutes?: number;
  bonusMinutes?: number;

  gross?: number;
  flatBonus?: number;
  deductions?: number;
  net?: number;

  revision: number;
}

export type PayrollConfirmation = {
  id?: string;
  periodId: string;
  companyId: string;
  uid: string;
  employeeId: string;
  employeeName: string;

  revision: number;
  confirmed: boolean;

  at?: any;
  confirmedAt?: string;
  note?: string;
};
export type AppNotificationType =
  | "payroll_confirmation"
  | "general";

export type AppNotification = {
  id?: string;
  type: AppNotificationType;

  employeeId: string;
  employeeName?: string;

  title: string;
  message: string;

  read: boolean;

  periodId?: string;
  revision?: number;

  createdAt?: any;
  readAt?: any;
};
// src/lib/job-profitability.ts
export type JobProfitRow = {
  site: string;
  date: string; // YYYY-MM-DD
  revenue: number;
  labor: number; // wage * hours
  mileage: number; // miles * rate
  expenses: number; // other expenses
  profit: number; // revenue - labor - mileage - expenses
  marginPct: number; // profit / revenue (0 if revenue=0)
};

export type EmployeeUpdateRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  updates: Partial<Employee>;
  status: "pending" | "approved" | "rejected";
  requestedAt?: any;
  requestedByUid?: string | null;
  approvedAt?: any;
  approvedByUid?: string | null;
  rejectedAt?: any;
  rejectedByUid?: string | null;
  reason?: string | null;
};
