// src/lib/profit.ts
import type {
  Entry,
  OtherExpense,
  Settings,
  Employee,
  MileageLog,
  CleaningSchedule,
  Site,
} from "@/shared/types/domain";
import { indexSites } from "@/lib/site-index";
import {
  startOfMonth,
  endOfMonth,
} from "date-fns";
import { groupSessions } from "./time-utils";

type Row = {
  siteId: string;
  siteName: string;
  serviceCharge: number; // Service charge × completed visit days
  labor: number;
  mileage: number;
  other: number;
  net: number;
  revenue: number;
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
   sites: Site[];
  mileageLogs: MileageLog[];
  otherExpenses: OtherExpense[];
  schedules: CleaningSchedule[];
  settings?: Settings | null;
  monthISO?: string; // "YYYY-MM"
}) {
  const {
    entries,
    employees,
     sites,
    mileageLogs,
    otherExpenses,
    schedules,
    settings,
    monthISO,
  } = params;
  const { min, max } = getMonthRange(monthISO);

 const directorySites = sites;
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
          revenue: number;
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
    const directorySite =
      idx.byId.get(siteId) ??
      idx.byName.get(siteName.trim().toLowerCase());

    rows.set(siteId, {
      siteId,
      siteName,
      serviceCharge: 0,
      labor: 0,
      mileage: 0,
      other: 0,
      net: 0,

      // Monthly contract revenue stored in the Site profile.
      // It is counted once for the month.
      revenue: Number(directorySite?.revenue ?? 0),
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

  // Prevent Service Charge from being counted more than once
// when multiple employees work the same scheduled visit.
const chargedOccurrences = new Set<string>();



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
    const dayKey =
  new Date(overlapStart).toISOString().slice(0, 10);

const rate =
  hourlyRatesByEmployee.get(session.employee) ??
  settings?.defaultHourlyWage ??
  0;

const cost =
  (minutesInMonth / 60) * rate;

/*
 * Try to identify the exact schedule that produced
 * this clock session.
 *
 * Newer clock entries already carry scheduleId.
 * Older entries may not, so they will safely fall
 * back to the original single-site behavior below.
 */
const scheduleId =
  session.in?.scheduleId ??
  session.out?.scheduleId;

const sessionSchedule = scheduleId
  ? schedules.find(
      (schedule) => schedule.id === scheduleId
    )
  : undefined;

  /*
 * Service Charge for this completed scheduled visit.
 *
 * Multiple employees may work the same schedule occurrence,
 * but the service charge must be counted only once.
 */
if (sessionSchedule && scheduleId) {
  const occurrenceDate =
  session.in?.scheduleDate ??
  session.out?.scheduleDate ??
  dayKey;

const occurrenceKey =
  `${scheduleId}__${occurrenceDate}`;

  if (!chargedOccurrences.has(occurrenceKey)) {
    chargedOccurrences.add(occurrenceKey);

    const groupedNames =
      sessionSchedule.siteNames?.filter(Boolean) ?? [];

    /*
     * GROUPED SCHEDULE
     *
     * Example:
     * ABC Complex
     * A = $43.50
     * B = $28.77
     * C = $75.00
     */
    if (groupedNames.length > 1) {
      for (const groupSiteName of groupedNames) {
        const resolved =
          resolveToDirectorySiteId(
            undefined,
            groupSiteName,
            idx
          );

        if (
          !resolved.siteId ||
          !resolved.siteName
        ) {
          continue;
        }

        const chargeEntry =
          Object.entries(
            sessionSchedule.siteServiceCharges ?? {}
          ).find(
            ([name]) =>
              name.trim().toLowerCase() ===
              groupSiteName.trim().toLowerCase()
          );

        const siteCharge =
          Number(chargeEntry?.[1] ?? 0);

        const siteRow = ensure(
          resolved.siteId,
          resolved.siteName
        );

        siteRow.serviceCharge += siteCharge;
      }
    } else {
      /*
       * NORMAL SINGLE-SITE SCHEDULE
       */
      const normalCharge =
        Number(
          sessionSchedule.serviceCharge ?? 0
        );

      const siteRow = ensure(
        siteId,
        siteName
      );

      siteRow.serviceCharge += normalCharge;
    }
  }
}

/*
 * Legacy fallback:
 * Older clock entries may not contain scheduleId.
 *
 * These entries use the original primary-site behavior.
 */
if (!sessionSchedule || !scheduleId) {
  const legacyOccurrenceKey =
    `legacy__${siteId}__${dayKey}`;

  if (
    !chargedOccurrences.has(
      legacyOccurrenceKey
    )
  ) {
    chargedOccurrences.add(
      legacyOccurrenceKey
    );

    const normalizedSiteName =
      siteName.trim().toLowerCase();

    const legacySchedule =
  [...schedules]
    .reverse()
    .find((schedule) => {
      const primaryName =
        schedule.siteName
          ?.trim()
          .toLowerCase();

      const groupedNames =
        (schedule.siteNames ?? []).map(
          (name) =>
            name.trim().toLowerCase()
        );

      return (
        primaryName === normalizedSiteName ||
        groupedNames.includes(
          normalizedSiteName
        )
      );
    });

let legacyCharge = 0;

if (legacySchedule) {
  const isGrouped =
    (legacySchedule.siteNames?.length ?? 0) > 1;

  if (isGrouped) {
    const chargeEntry =
      Object.entries(
        legacySchedule.siteServiceCharges ?? {}
      ).find(
        ([name]) =>
          name.trim().toLowerCase() ===
          normalizedSiteName
      );

    legacyCharge =
      Number(chargeEntry?.[1] ?? 0);
  } else {
    legacyCharge =
      Number(
        legacySchedule.serviceCharge ?? 0
      );
  }
}

    const siteRow = ensure(
      siteId,
      siteName
    );

    siteRow.serviceCharge +=
      legacyCharge;
  }
}

/*
 * A grouped schedule contains siteNames with more
 * than one site.
 */
const groupedSiteNames =
  sessionSchedule?.siteNames?.filter(Boolean) ?? [];

if (groupedSiteNames.length > 1) {
  /*
   * Resolve every group member back to the Site directory.
   */
  const groupSites = groupedSiteNames
    .map((groupSiteName) => {
      const resolved =
        resolveToDirectorySiteId(
          undefined,
          groupSiteName,
          idx
        );

      if (!resolved.siteId || !resolved.siteName) {
        return null;
      }

      const directorySite =
        idx.byId.get(resolved.siteId) ??
        idx.byName.get(
          resolved.siteName
            .trim()
            .toLowerCase()
        );

      return {
        siteId: resolved.siteId,
        siteName: resolved.siteName,
        estimatedMinutes: Number(
          directorySite?.estimatedWorkMinutes ?? 0
        ),
      };
    })
    .filter(
      (
        item
      ): item is {
        siteId: string;
        siteName: string;
        estimatedMinutes: number;
      } => item !== null
    );

  /*
   * Use estimated work time only when every site
   * has a positive estimate.
   *
   * Otherwise use equal allocation so no site's
   * labor accidentally becomes zero.
   */
  const canUseEstimatedTime =
    groupSites.length > 0 &&
    groupSites.every(
      (groupSite) =>
        groupSite.estimatedMinutes > 0
    );

  const totalEstimatedMinutes =
    canUseEstimatedTime
      ? groupSites.reduce(
          (sum, groupSite) =>
            sum +
            groupSite.estimatedMinutes,
          0
        )
      : 0;

  for (const groupSite of groupSites) {
    const allocation =
      canUseEstimatedTime &&
      totalEstimatedMinutes > 0
        ? groupSite.estimatedMinutes /
          totalEstimatedMinutes
        : 1 / groupSites.length;

    const siteRow = ensure(
      groupSite.siteId,
      groupSite.siteName
    );

    siteRow.labor += cost * allocation;

  }
} else {
  /*
   * Normal single-site schedule.
   *
   * This preserves your existing behavior exactly.
   */
  const siteRow = ensure(
    siteId,
    siteName
  );

  siteRow.labor += cost;

}
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
    r.revenue = round2(r.revenue);
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
