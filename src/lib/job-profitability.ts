

// src/lib/job-profitability.ts
import { startOfDay, parseISO, differenceInCalendarWeeks, getDate, getMonth, getYear, isSameDay, format } from "date-fns";
import { groupSessions } from "@/lib/time-utils";
import type {
  Entry, CleaningSchedule, MileageLog, OtherExpense, Employee, Settings, Invoice, DayOfWeek
} from "@/shared/types/domain";

export type JobProfitRow = {
  site: string;
  date: string;            // YYYY-MM-DD
  revenue: number;
  labor: number;           // wage * hours
  mileage: number;         // miles * rate
  expenses: number;        // other expenses
  profit: number;          // revenue - labor - mileage - expenses
  marginPct: number;       // profit / revenue (0 if revenue=0)
};

type Args = {
  date: Date;                                // which day to compute (local)
  settings: Settings;
  entries: Entry[];
  employees: Employee[];
  mileageLogs: MileageLog[];
  otherExpenses: OtherExpense[];
  schedules: CleaningSchedule[];
  invoices: Invoice[];
};

// Accept common field name variations safely
function getEmployeeRate(emp?: Employee, settings?: Settings) {
  const fallback = Number((settings as any)?.defaultHourlyWage ?? 0);
  return Number((emp as any)?.payRate ?? (emp as any)?.wage ?? fallback) || 0;
}
function getMiles(log: any) {
  return Number(log?.miles ?? log?.distance ?? log?.distanceMiles ?? 0) || 0;
}
function getMileageRate(settings?: Settings) {
  return Number((settings as any)?.mileageRate ?? (settings as any)?.mileageRatePerMile ?? 0) || 0;
}
function sameDayISO(d: Date){ return d.toISOString().slice(0,10); }

function isScheduleActiveOnDate(schedule: CleaningSchedule, date: Date, weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6): boolean {
    if (!schedule.startDate) return false;
    const schStart = parseISO(schedule.startDate);
    
    if (date < startOfDay(schStart)) return false;
    if (schedule.repeatUntil && date > parseISO(schedule.repeatUntil)) return false;
    
    const monthDiff = (getYear(date) - getYear(schStart)) * 12 + (getMonth(date) - getMonth(schStart));

    switch (schedule.repeatFrequency) {
        case 'does-not-repeat':
            return isSameDay(date, schStart);

        case 'weekly':
        case 'every-2-weeks':
        case 'every-3-weeks':
            const dayName = format(date, 'EEEE') as DayOfWeek;
            if (!schedule.daysOfWeek?.includes(dayName)) return false;

            const weekDiff = differenceInCalendarWeeks(date, schStart, { weekStartsOn });
            if (schedule.repeatFrequency === 'weekly') return weekDiff >= 0;
            if (schedule.repeatFrequency === 'every-2-weeks') return weekDiff >= 0 && weekDiff % 2 === 0;
            if (schedule.repeatFrequency === 'every-3-weeks') return weekDiff >= 0 && weekDiff % 3 === 0;
            return false;
        
        case 'monthly':
            return getDate(date) === getDate(schStart) && monthDiff >= 0;
        
        case 'every-2-months':
            return getDate(date) === getDate(schStart) && monthDiff >= 0 && monthDiff % 2 === 0;

        case 'quarterly':
            return getDate(date) === getDate(schStart) && monthDiff >= 0 && monthDiff % 3 === 0;

        case 'yearly':
            return getDate(date) === getDate(schStart) && getMonth(date) === getMonth(schStart) && monthDiff >= 0;

        default:
            return false;
    }
}


function resolveRevenueForSiteDay(siteName: string, isoDate: string, opts: {
  schedules: CleaningSchedule[],
  invoices: Invoice[],
  settings: Settings
}) {
  // 1) If there is an invoice for this site/date, prefer it
  const inv = opts.invoices.find(i =>
    (i.siteName) === siteName && (i.date ?? "").slice(0,10) === isoDate
  );
  if (inv?.total != null) return Number(inv.total) || 0;

  // 2) If schedule has an explicit daily revenue/rate for that site/date
  const activeDate = new Date(isoDate + "T12:00:00");
  const sched = opts.schedules.find(s =>
    s.siteName === siteName && isScheduleActiveOnDate(s, activeDate, opts.settings.weekStartsOn)
  );

  const schedRevenue = Number((sched as any)?.servicePrice ?? 0);
  if (schedRevenue) return schedRevenue;

  // 3) Site-level default rate in settings (if present)
  const siteCfg = (opts.settings.sites ?? []).find(s => s.name === siteName);
  const defaultSiteRate = Number((siteCfg as any)?.servicePrice ?? 0);
  if (defaultSiteRate) return defaultSiteRate;

  // 4) No revenue known
  return 0;
}

export function computeJobProfitability(args: Args): Map<string, JobProfitRow> {
  const { date, settings, entries, employees, mileageLogs, otherExpenses, schedules, invoices } = args;

  const dayStart = startOfDay(date).getTime();
  const dayEnd = dayStart + 24*60*60*1000;
  const iso = sameDayISO(new Date(dayStart));

  // limit to this day
  const dayEntries = entries.filter(e => e.ts >= dayStart && e.ts < dayEnd);

  // sessions already contains minutes + employee
  const sessions = groupSessions(dayEntries);

  // Build set of sites we care about (from settings list only)
  const siteSet = new Set<string>();
  (settings.sites ?? []).forEach(s => siteSet.add(s.name));
  
  const rows = new Map<string, JobProfitRow>();

  for (const site of Array.from(siteSet).filter(Boolean)) {
    // Labor
    let labor = 0;
    for (const s of sessions) {
      const sSite = s.in?.site ?? s.out?.site;
      if (!sSite || sSite !== site) continue;
      if (!s.out) continue; // open shifts don’t count yet
      const emp = employees.find(e => e.id === (s as any).employeeId) ?? employees.find(e => e.name === s.employee);
      const rate = getEmployeeRate(emp, settings);
      const hours = (s.minutes ?? 0) / 60;
      labor += rate * hours;
    }

    // Mileage ($)
    const mileageRate = getMileageRate(settings);
    const mileageMiles = mileageLogs
      .filter(m => (m.date ?? "").slice(0,10) === iso && (m.siteName ?? "") === site)
      .reduce((sum, m) => sum + getMiles(m), 0);
    const mileage = mileageRate * mileageMiles;

    // Expenses ($)
    const expenses = otherExpenses
  .filter(o => (o.date ?? "").slice(0,10) === iso)
  .filter(o => {
    const siteName = (o as any).siteName ?? (o as any).site ?? null;
    return siteName === site;
  })
  .reduce((sum, o) => sum + Number((o as any).amount ?? 0), 0);


    // Revenue
    const revenue = resolveRevenueForSiteDay(site, iso, { schedules, invoices, settings });

    // Profit
    const profit = round2(revenue - labor - mileage - expenses);
    const marginPct = revenue > 0 ? round2(profit / revenue) : 0;

    rows.set(site, {
      site,
      date: iso,
      revenue: round2(revenue),
      labor: round2(labor),
      mileage: round2(mileage),
      expenses: round2(expenses),
      profit,
      marginPct,
    });
  }

  return rows;
}

function round2(n: number){ return Math.round((n + Number.EPSILON) * 100) / 100; }
