// src/lib/profit.ts
import type {
  Entry,
  Invoice,
  OtherExpense,
  Settings,
  Employee,
  MileageLog,
} from "@/shared/types/domain";
import { indexSites } from "@/lib/site-index";
import { startOfMonth, endOfMonth } from "date-fns";
import { groupSessions } from "./time-utils";

type Row = {
  siteId: string;
  siteName: string;
  serviceCharge: number; // Standard service amount for the month
  labor: number;
  mileage: number;
  other: number;
  net: number;
};

function resolveToDirectorySiteId(
  siteId: string | undefined,
  legacyName: string | undefined,
  idx: ReturnType<typeof indexSites>
): { siteId?: string; siteName?: string } {
  if (siteId && idx.byId.has(siteId)) {
    const s = idx.byId.get(siteId)!;
    return { siteId, siteName: s.name };
  }
  if (legacyName) {
    const maybe = idx.byName.get(legacyName.trim().toLowerCase());
    if (maybe) return { siteId: maybe.id ?? maybe.name, siteName: maybe.name };
  }
  return {};
}

const getMonthRange = (isoYYYYMM?: string) => {
  // isoYYYYMM: "2025-10" or undefined => current month
  const base = isoYYYYMM ? new Date(isoYYYYMM + "-01T00:00:00") : new Date();
  return {
    min: startOfMonth(base).getTime(),
    max: endOfMonth(base).getTime(),
  };
};

export function aggregateMonthlySiteProfit(params: {
  entries: Entry[];
  employees: Employee[];
  mileageLogs: MileageLog[];
  otherExpenses: OtherExpense[];
  invoices?: Invoice[]; // kept for compatibility but not used
  settings?: Settings | null;
  monthISO?: string; // "YYYY-MM"
}) {
  const {
    entries,
    employees,
    mileageLogs,
    otherExpenses,
    settings,
    monthISO,
  } = params;
  const { min, max } = getMonthRange(monthISO);

  const directorySites = settings?.sites ?? [];
  const idx = indexSites(directorySites);

  if (!directorySites.length) {
    return {
      rows: [] as Array<{
        siteId: string;
        siteName: string;
        serviceCharge: number;
        labor: number;
        mileage: number;
        other: number;
        net: number;
      }>,
      totals: {
        serviceCharge: 0,
        labor: 0,
        mileage: 0,
        other: 0,
        net: 0,
      },
    };
  }

  const rows = new Map<string, Row>(); // key: siteId from directory

  const ensure = (siteId: string, siteName: string) => {
    if (!rows.has(siteId)) {
      rows.set(siteId, {
        siteId,
        siteName,
        serviceCharge: 0,
        labor: 0,
        mileage: 0,
        other: 0,
        net: 0,
      });
    }
    return rows.get(siteId)!;
  };

  // Pay rates
  const hourlyRatesByEmployee = new Map<string, number>();
  for (const e of employees) {
    const rate = e.payRate ?? settings?.defaultHourlyWage ?? 0;
    if (e.name) hourlyRatesByEmployee.set(e.name, rate);
  }

  // Track which days in the month each site was serviced
  // key: siteId -> Set<"YYYY-MM-DD">
  const visitDaysBySite = new Map<string, Set<string>>();

  // Labor (timeclock entries)
  const allSessions = groupSessions(entries);

  for (const session of allSessions) {
    // Only closed sessions have a final duration
    if (!session.out) continue;

    // Prefer IN site but fall back to OUT site
    const legacySiteName = session.in?.site ?? session.out?.site;
    if (!legacySiteName) continue;

    const { siteId, siteName } = resolveToDirectorySiteId(
      undefined,
      legacySiteName,
      idx
    );
    if (!siteId || !siteName) continue;

    // Use whichever timestamps are available
    const sessionStart = session.in?.ts ?? session.out?.ts ?? 0;
    const sessionEnd = session.out?.ts ?? session.in?.ts ?? 0;

    const overlapStart = Math.max(sessionStart, min);
    const overlapEnd = Math.min(sessionEnd, max);
    if (overlapEnd <= overlapStart) continue;

    const minutesInMonth = (overlapEnd - overlapStart) / 60000;
    // ✅ Track serviced day(s) so serviceCharge can be computed
const dayKey = new Date(overlapStart).toISOString().slice(0, 10);
let set = visitDaysBySite.get(siteId);
if (!set) {
  set = new Set<string>();
  visitDaysBySite.set(siteId, set);
}
set.add(dayKey);

    const rate =
      hourlyRatesByEmployee.get(session.employee) ??
      settings?.defaultHourlyWage ??
      0;
    const cost = (minutesInMonth / 60) * rate;

    const siteRow = ensure(siteId, siteName);
    siteRow.labor += cost;
  }

  // Service charge (Standard service amount * number of serviced days)
  for (const [siteId, daySet] of visitDaysBySite.entries()) {
    const directorySite = idx.byId.get(siteId);
    const siteName = directorySite?.name ?? rows.get(siteId)?.siteName ?? "";
    if (!siteName) continue;

    const servicePrice = directorySite?.servicePrice ?? 0;
    if (!servicePrice) continue;

    const siteRow = ensure(siteId, siteName);
    siteRow.serviceCharge += servicePrice * daySet.size;
  }

  // Mileage
  for (const m of mileageLogs) {
    const ts = safeDate(m.date);
    if (ts < min || ts > max) continue;

    const { siteId, siteName } = resolveToDirectorySiteId(
      (m as any).siteId,
      (m as any).site ?? m.siteName,
      idx
    );
    if (!siteId || !siteName) continue;

    const siteRow = ensure(siteId, siteName);
    siteRow.mileage += (m.distance || 0) * (settings?.mileageRate || 0);
  }

  // Other expenses
  for (const e of otherExpenses) {
    const ts = safeDate(e.date);
    if (ts < min || ts > max) continue;

    // If there is no site information at all, treat as general and skip in site-level totals
    const { siteId, siteName } = resolveToDirectorySiteId(
      e.siteId,
      e.site ?? e.siteName,
      idx
    );
    if (!siteId || !siteName) continue;

    const siteRow = ensure(siteId, siteName);
    siteRow.other += e.amount || 0;
  }

  // Net & rounding
  for (const r of rows.values()) {
    r.net = round2(r.serviceCharge - r.labor - r.mileage - r.other);
    r.serviceCharge = round2(r.serviceCharge);
    r.labor = round2(r.labor);
    r.mileage = round2(r.mileage);
    r.other = round2(r.other);
  }

  const list = [...rows.values()].sort((a, b) =>
    a.siteName.localeCompare(b.siteName)
  );

  const totals = list.reduce(
    (acc, r) => ({
      serviceCharge: acc.serviceCharge + r.serviceCharge,
      labor: acc.labor + r.labor,
      mileage: acc.mileage + r.mileage,
      other: acc.other + r.other,
      net: acc.net + r.net,
    }),
    {
      serviceCharge: 0,
      labor: 0,
      mileage: 0,
      other: 0,
      net: 0,
    }
  );

  for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
    totals[key] = round2(totals[key]);
  }

  return { rows: list, totals };
}

function safeDate(d?: string | number | Date) {
  if (!d) return 0;
  try {
    const ts = new Date(d as any).getTime();
    return isFinite(ts) ? ts : 0;
  } catch {
    return 0;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// Export helper
export function exportSiteMonthCSV(args: {
  rows: Array<{
    siteName: string;
    serviceCharge: number;
    labor: number;
    mileage: number;
    other: number;
    net: number;
  }>;
  totals: {
    serviceCharge: number;
    labor: number;
    mileage: number;
    other: number;
    net: number;
  };
  monthISO?: string; // "YYYY-MM"
}) {
  const { rows, totals, monthISO } = args;
  const hdr = ["Site", "Service charge", "Labor", "Mileage", "Other", "Net"];

  const data = rows.map((r) => [
    r.siteName,
    r.serviceCharge.toFixed(2),
    r.labor.toFixed(2),
    r.mileage.toFixed(2),
    r.other.toFixed(2),
    r.net.toFixed(2),
  ]);

  // Totals row
  data.push([]);
  data.push([
    "TOTAL",
    totals.serviceCharge.toFixed(2),
    totals.labor.toFixed(2),
    totals.mileage.toFixed(2),
    totals.other.toFixed(2),
    totals.net.toFixed(2),
  ]);

  const csv = [hdr, ...data]
    .map((row) =>
      row.map((v) => `"${String(v).replaceAll(`"`, `""`)}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const namePart = monthISO ?? new Date().toISOString().slice(0, 7);
  a.href = url;
  a.download = `site-monthly-profitability-${namePart}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
