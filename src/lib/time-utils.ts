import { format, isToday, isYesterday, isTomorrow } from "date-fns";
import type { Entry, Session } from "@/shared/types/domain";

export function formatDT(ms: number | undefined): string {
  if (ms === undefined) return "";
  const date = new Date(ms);
  const time = format(date, "hh:mm a");
  if (isToday(date)) return `Today ${time}`;
  if (isYesterday(date)) return `Yesterday ${time}`;
  if (isTomorrow(date)) return `Tomorrow ${time}`;
  return format(date, "MM-dd-yyyy hh:mm a");
}

export function diffMinutes(a: number, b: number): number {
  return Math.max(0, (b - a) / 60000);
}

export function minutesToHHMM(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function groupSessions(entries: Entry[]): Session[] {
  const sorted = [...entries].sort((a, b) => a.ts - b.ts);

  const sessions: Session[] = [];
  const openByKey = new Map<string, Session>();

  // NEW: track open sessions by employeeId as a fallback
  const openByEmployee = new Map<string, Set<Session>>();

  const norm = (s: string) => s.trim().toLowerCase();

  const makeKey = (e: Entry) => {
    const emp = norm((e.employeeId || e.employee || ""));
    const site = norm((e.site || ""));
    return `${emp}::${site}`;
  };

  const getEmpKey = (e: Entry) => norm((e.employeeId || e.employee || ""));

  const addOpen = (empKey: string, session: Session) => {
    if (!openByEmployee.has(empKey)) openByEmployee.set(empKey, new Set());
    openByEmployee.get(empKey)!.add(session);
  };

  const removeOpen = (empKey: string, session: Session) => {
    const set = openByEmployee.get(empKey);
    if (!set) return;
    set.delete(session);
    if (set.size === 0) openByEmployee.delete(empKey);
  };

  for (const e of sorted) {
    const empKey = getEmpKey(e);
    if (!empKey) continue;

    const key = makeKey(e);

    if (e.action === "in") {
      const session: Session = {
        employee: e.employee,
        employeeId: e.employeeId,
        in: e,
        out: null,
        minutes: 0,
        active: true,
      };
      sessions.push(session);

      // Primary index
      openByKey.set(key, session);
      // Fallback index
      addOpen(empKey, session);

    } else {
      // action === "out"
      let open = openByKey.get(key);

      // ✅ Fallback: if no site match (or site missing / inconsistent),
      // close the only open session for that employee (safe).
      if (!open) {
        const candidates = openByEmployee.get(empKey);
        if (candidates && candidates.size === 1) {
          open = [...candidates][0];
        }
      }

      if (open && open.in && !open.out) {
        const endTs = Math.max(e.ts, open.in.ts);
        open.out = e;
        open.minutes = (endTs - open.in.ts) / 60000;
        open.active = false;

        // Remove from indexes
        openByKey.delete(makeKey(open.in)); // remove original IN-key mapping
        removeOpen(empKey, open);
      } else {
        // Orphan OUT → standalone zero-length session
        sessions.push({
          employee: e.employee,
          employeeId: e.employeeId,
          in: undefined,
          out: e,
          minutes: 0,
          active: false,
        });
      }
    }
  }

  // Active sessions → duration up to now
  for (const session of sessions) {
    if (session.active && session.in) {
      session.minutes = diffMinutes(session.in.ts, Date.now());
    }
  }

  return sessions.sort(
    (a, b) => (a.in?.ts ?? a.out?.ts ?? 0) - (b.in?.ts ?? b.out?.ts ?? 0)
  );
}


export function uuid(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export const haversineDistance = (
  coords1: { lat: number; lng: number },
  coords2: { lat: number; lng: number }
): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371e3;

  const dLat = toRad(coords2.lat - coords1.lat);
  const dLon = toRad(coords2.lng - coords1.lng);
  const lat1 = toRad(coords1.lat);
  const lat2 = toRad(coords2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};
