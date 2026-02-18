"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  collection,
  writeBatch,
  getDoc,
  type DocumentReference,
  type DocumentData,
} from "firebase/firestore";
import { onAuthStateChanged, signInAnonymously, type User } from "firebase/auth";
import { startOfDay, startOfToday, startOfMonth, endOfMonth, format } from "date-fns";

import type {
  Entry,
  Settings,
  Site,
  CleaningSchedule,
  MileageLog,
  Employee,
  Invoice,
  OtherExpense,
  PayrollPeriod,
  PayrollConfirmation,
  SiteStatus,
  AiEntry,
  EmployeeUpdateRequest,
  Session,
} from "@/shared/types/domain";

import {
  loadLocalEntries,
  saveLocalEntries,
  loadLocalSchedules,
  saveLocalSchedules,
  loadLocalMileageLogs,
  saveLocalMileageLogs,
  loadLocalEmployees,
  saveLocalEmployees,
  loadLocalInvoices,
  saveLocalInvoices,
  loadLocalOtherExpenses,
  saveLocalOtherExpenses,
  loadLocalPayrollPeriods,
  saveLocalPayrollPeriods,
} from "@/lib/storage";

import { groupSessions, uuid, haversineDistance } from "@/lib/time-utils";
import { useToast } from "@/hooks/use-toast";

import { Header } from "@/components/timewise/header";
import { Footer } from "@/components/timewise/footer";
import { EmployeeView } from "@/components/timewise/employee-view";
import { ManagerView } from "@/components/timewise/manager/manager-view";
import { AISummaryDialog } from "@/components/timewise/ai-summary-dialog";
import { EmployeeLogin } from "@/components/timewise/employee-login";

import { getAiSummary } from "@/app/actions";
import { errorEmitter } from "@/firebase/error-emitter";
import { FirestorePermissionError } from "@/firebase/errors";

// ✅ Import singletons
import { db, auth } from "@/firebase/client";

import { addOtherExpenseFS, updateOtherExpenseFS, deleteOtherExpenseFS } from "@/lib/expenses";

import { useEngine } from "@/providers/EngineProvider";
import { useSettings } from "@/features/settings/hooks/useSettings";
import { withComputed } from "@/lib/invoice-math";
import { computeJobProfitability } from "@/lib/job-profitability";
import { cleanForFirestore } from "@/lib/utils";
import { addDays } from "date-fns";

function sessionMinutesOnDay(s: Session, day: Date, nowTs: number = Date.now()): number {
  const inTs = s.in?.ts ?? 0;
  if (!inTs) return 0;

  const outTs = s.out?.ts ?? nowTs;

  const dayStart = startOfDay(day).getTime();
  const dayEnd = addDays(startOfDay(day), 1).getTime();

  const overlapStart = Math.max(inTs, dayStart);
  const overlapEnd = Math.min(outTs, dayEnd);

  if (overlapEnd <= overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / 60000);
}


/** companyId is always derived the same way everywhere */
const getCompanyId = (settings: Settings) =>
  settings.companyId?.trim() || process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners";

// Build a timestamp on a specific calendar day, using the time of `base`
const buildTsOnDay = (day: Date, base: Date) => {
  const d = new Date(day);
  d.setHours(base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds());
  return d.getTime();
};

async function writeThenVerify<T extends DocumentData>(
  ref: DocumentReference<T>,
  payload: T,
  label: string
) {
  await setDoc(ref, payload);
  const snap = await getDoc(ref);
  console.log(`[${label}] wrote path=${ref.path} exists=${snap.exists()}`, snap.data());
  return snap;
}

export default function TimeWisePage() {
  const { settings, updateSettings } = useSettings();
  const { engine, setEngine } = useEngine();
  const { toast } = useToast();

  // --- Auth state (single source of truth) ---
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // --- Core data state ---
  const [entries, setEntries] = useState<Entry[]>([]);
  const [schedules, setSchedules] = useState<CleaningSchedule[]>([]);
  const [mileageLogs, setMileageLogs] = useState<MileageLog[]>([]);
  const [otherExpenses, setOtherExpenses] = useState<OtherExpense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payrollPeriods, setPayrollPeriods] = useState<PayrollPeriod[]>([]);
  const [payrollConfirmations, setPayrollConfirmations] = useState<PayrollConfirmation[]>([]);
  const [employeeUpdateRequests, setEmployeeUpdateRequests] = useState<EmployeeUpdateRequest[]>([]);

  // UI state
  const [tab, setTab] = useState<"employee" | "manager">("employee");

  // Logged-in employee state
  const [loggedInEmployee, setLoggedInEmployee] = useState<Employee | null>(null);

  // GPS state
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);

  // Manager state
  const [unlocked, setUnlocked] = useState(false);
  const [fromDate, setFromDate] = useState(() => {
    const today = startOfToday();
    return format(startOfMonth(today), "yyyy-MM-dd");
  });
  const [toDate, setToDate] = useState(() => {
    const today = startOfToday();
    return format(endOfMonth(today), "yyyy-MM-dd");
  });
  const [search, setSearch] = useState("");

  // AI Summary state
  const [isAiSummaryOpen, setIsAiSummaryOpen] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const didFixSitesRef = useRef(false);

  const companyId = useMemo(() => getCompanyId(settings), [settings.companyId]);

  // Keep companyId pinned to env if present (prevents drift)
  useEffect(() => {
    const envId = process.env.NEXT_PUBLIC_COMPANY_ID?.trim();
    if (envId && settings.companyId?.trim() !== envId) {
      updateSettings((s) => ({ ...s, companyId: envId }));
    }
  }, [settings.companyId, updateSettings]);

  // Ensure all sites have a stable ID (run exactly once)
  useEffect(() => {
    if (didFixSitesRef.current) return;
    const sites = settings.sites ?? [];
    const already = (settings as any)?.meta?.migratedSiteIds;
    if (!sites.length || !sites.some((s) => !s.id) || already) return;

    didFixSitesRef.current = true;
    updateSettings((s) => ({
      ...s,
      sites: sites.map((site) => (site.id ? site : { ...site, id: uuid() })),
      meta: { ...(s as any).meta, migratedSiteIds: true },
    }));
  }, [settings.sites, updateSettings]);

  // Load initial data from local storage when in local engine
  useEffect(() => {
    if (engine !== "local") return;
    setEntries(loadLocalEntries());
    setSchedules(loadLocalSchedules());
    setMileageLogs(loadLocalMileageLogs());
    setOtherExpenses(loadLocalOtherExpenses());
    setEmployees(loadLocalEmployees());
    setInvoices(loadLocalInvoices());
    setPayrollPeriods(loadLocalPayrollPeriods());
  }, [engine]);

  // Persist logged-in employee
  useEffect(() => {
    const raw = localStorage.getItem("ops_last_employee");
    if (!raw) return;
    try {
      setLoggedInEmployee(JSON.parse(raw));
    } catch (e) {
      console.warn("Could not parse last employee from localStorage", e);
      localStorage.removeItem("ops_last_employee");
    }
  }, []);

  useEffect(() => {
    if (loggedInEmployee) {
      localStorage.setItem("ops_last_employee", JSON.stringify(loggedInEmployee));
    } else {
      localStorage.removeItem("ops_last_employee");
    }
  }, [loggedInEmployee]);

  /**
   * AUTH: in cloud mode, ensure we always have a signed-in user (anonymous is fine).
   * Single auth effect.
   */
const didAnonSignInRef = useRef(false);

/**
 * 1) AUTH effect (only auth)
 */
 useEffect(() => {
    setAuthReady(false);
    didAnonSignInRef.current = false;

    const unsub = onAuthStateChanged(auth, async (u) => {
      console.log("[AUTH] state changed user=", u?.uid ?? null, "engine=", engine);

      if (engine !== "cloud") {
        setUser(null);
        setAuthReady(true);
        return;
      }

      if (u) {
        setUser(u);
        setAuthReady(true);
        return;
      }

      if (didAnonSignInRef.current) {
        setAuthReady(true);
        return;
      }
      didAnonSignInRef.current = true;

      try {
        const cred = await signInAnonymously(auth);
        console.log("[AUTH] signed in anonymously uid=", cred.user.uid);
        setUser(cred.user);
      } catch (e: any) {
        console.error("[AUTH] anonymous sign-in failed", e?.code, e?.message, e);
        toast({
          variant: "destructive",
          title: "Auth sign-in failed",
          description: `${e?.code || "error"}: ${e?.message || "unknown"}`,
          duration: 10000,
        });
        setUser(null);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsub();
  }, [engine, toast]);
/**
 * 2) Firestore listener attach function (MUST return an array)
 */
 const attachFirestoreListeners = useCallback(
  (cId: string) => {
    const unsubs: Array<() => void> = [];
    const confirmUnsubs: Array<() => void> = [];

    const resetConfirmListeners = () => {
      confirmUnsubs.forEach((u) => u());
      confirmUnsubs.length = 0;
    };

    const handleSnapshotError =
      (collectionName: string) =>
      (error: any) => {
        const code = error?.code || "";
        const msg = String(error?.message || "");

        console.error(`[Firestore] onSnapshot error (${collectionName})`, { code, msg, error });

        const looksPerm =
          /permission-denied|insufficient/i.test(code) ||
          /Missing or insufficient permissions/i.test(msg);

        if (looksPerm) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({
              path: `companies/${cId}/${collectionName}`,
              operation: "list",
            })
          );

          toast({
            variant: "destructive",
            title: `Cloud permissions error on ${collectionName}`,
            description: `Check Firestore rules & companyId: ${cId}.`,
            duration: 10000,
          });
          return;
        }

        toast({
          variant: "destructive",
          title: `Firestore listener failed on ${collectionName}`,
          description: `${code || "unknown"}: ${msg || "Unknown error"}`,
          duration: 10000,
        });
      };

    // payroll periods + nested confirmations
    unsubs.push(
      onSnapshot(
        query(collection(db, "companies", cId, "payroll_periods"), orderBy("endDate", "desc")),
        (snap) => {
          const periods = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayrollPeriod));
          setPayrollPeriods(periods);

          resetConfirmListeners();

          for (const p of periods) {
            const cu = onSnapshot(
              collection(db, "companies", cId, "payroll_periods", p.id, "confirmations"),
              (confSnap) => {
                const periodConfirmations = confSnap.docs.map((d) => ({
                  ...(d.data() as PayrollConfirmation),
                  id: d.id,
                  periodId: p.id,
                }));

                setPayrollConfirmations((prev) => [
                  ...prev.filter((c) => c.periodId !== p.id),
                  ...periodConfirmations,
                ]);
              },
              handleSnapshotError(`payroll_periods/${p.id}/confirmations`)
            );
            confirmUnsubs.push(cu);
          }
        },
        handleSnapshotError("payroll_periods")
      )
    );

    // main collections
    unsubs.push(
      onSnapshot(
        query(collection(db, "companies", cId, "timeclock_entries"), orderBy("ts", "asc")),
        (snap) => setEntries(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Entry))),
        handleSnapshotError("timeclock_entries")
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, "companies", cId, "schedules")),
        (snap) => setSchedules(snap.docs.map((d) => ({ id: d.id, ...d.data() } as CleaningSchedule))),
        handleSnapshotError("schedules")
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, "companies", cId, "mileage_logs")),
        (snap) => setMileageLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MileageLog))),
        handleSnapshotError("mileage_logs")
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, "companies", cId, "other_expenses"), orderBy("date", "desc")),
        (snap) => setOtherExpenses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as OtherExpense))),
        handleSnapshotError("other_expenses")
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, "companies", cId, "employees")),
        (snap) => setEmployees(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Employee))),
        handleSnapshotError("employees")
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, "companies", cId, "invoices"), orderBy("date", "desc")),
        (snap) => setInvoices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Invoice))),
        handleSnapshotError("invoices")
      )
    );

    unsubs.push(
      onSnapshot(
        query(collection(db, "companies", cId, "employee_update_requests"), orderBy("requestedAt", "desc")),
        (snap) =>
          setEmployeeUpdateRequests(
            snap.docs.map((d) => ({ id: d.id, ...d.data() } as EmployeeUpdateRequest))
          ),
        handleSnapshotError("employee_update_requests")
      )
    );

    // ✅ RETURN A CLEANUP FUNCTION (NOT an array)
    return () => {
      unsubs.forEach((u) => u());
      resetConfirmListeners();
    };
  },
  [toast]
);


  useEffect(() => {
  if (engine !== "cloud") return;
  if (!authReady) return;
  if (!user) return;

  console.log("[APP] Subscribing to Firestore", {
    companyId,
    uid: user.uid,
    fs: (db as any)?._settings,
  });

  return attachFirestoreListeners(companyId);
}, [engine, authReady, user, companyId, attachFirestoreListeners]);



  // --- Auto-cleanup orphaned schedules (cloud + manager only) ---
  useEffect(() => {
    if (engine !== "cloud" || !unlocked) return;
    if (!schedules.length || !settings.sites?.length) return;

    const siteNames = new Set(settings.sites.map((s) => s.name));
    const orphaned = schedules.filter((s) => !siteNames.has(s.siteName));

    if (orphaned.length === 0) return;

    console.warn(
      "[Cleanup] Removing orphaned schedules:",
      orphaned.map((s) => `${s.siteName} (${s.id})`)
    );

    const cId = getCompanyId(settings);
    orphaned.forEach((s) => {
      deleteDoc(doc(db, "companies", cId, "schedules", s.id)).catch((err) =>
        console.warn("Failed to delete orphaned schedule", s.id, err)
      );
    });
  }, [schedules, settings.sites, engine, settings.companyId, unlocked]);



  // --- Debug helpers exposed to window (dev only) ---
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;

    (window as any).testAddExpense = async () => {
      const cId = getCompanyId(settings);
      const ref = collection(db, "companies", cId, "other_expenses");
      const data = {
        date: new Date().toISOString().slice(0, 10),
        description: "Test expense from console",
        amount: 1.23,
        createdAt: serverTimestamp(),
      };
      console.log("Attempting to add test expense to:", ref.path, data);
      return addDoc(ref, data);
    };

    (window as any).testAddInvoice = async () => {
      const cId = getCompanyId(settings);
      const ref = doc(db, "companies", cId, "invoices", String(Date.now()));
      const payload = {
        siteName: "Test Site",
        invoiceNumber: `INV-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        lineItems: [{ id: "1", description: "Test", quantity: 1, unitPrice: 10, total: 10 }],
        total: 10,
        status: "draft",
      };
      console.log("[TEST ADD INVOICE] path=", ref.path, payload);
      return setDoc(ref, payload as any);
    };
  }, [settings]);
// --- Derived data ---
const orderedEntries = useMemo(() => [...entries].sort((a, b) => a.ts - b.ts), [entries]);

// Make TS happy: Session[] is explicit, so `s` is NOT implicit any
const sessions = useMemo<Session[]>(() => groupSessions(orderedEntries), [orderedEntries]);

/**
 * Map employeeId -> Set(siteName) for currently active sessions
 */
const activeByEmployeeSite = useMemo(() => {
  const activeSessions = sessions.filter((s) => s.active && s.in);
  const map = new Map<string, Set<string>>();

  for (const s of activeSessions) {
    const empId = (s.employeeId || "").trim();
    const siteName = (s.in?.site || "").trim();
    if (!empId || !siteName) continue;

    if (!map.has(empId)) map.set(empId, new Set());
    map.get(empId)!.add(siteName);
  }

  return map;
}, [sessions]);

/**
 * Is employee clocked in? (optionally at a specific site)
 */
const isClockedIn = useCallback(
  (siteName?: string, employeeId?: string): boolean => {
    const empId = (employeeId || "").trim();
    if (!empId) return false;

    const activeSites = activeByEmployeeSite.get(empId);
    if (!activeSites || activeSites.size === 0) return false;

    if (!siteName) return true;

    const key = siteName.trim().toLowerCase();
    for (const s of activeSites) {
      if (s.toLowerCase() === key) return true;
    }
    return false;
  },
  [activeByEmployeeSite]
);

/**
 * GPS capture
 */
const requestLocation = useCallback((): Promise<{ lat: number; lng: number } | null> => {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast({ variant: "destructive", title: "Geolocation Not Supported" });
      resolve(null);
      return;
    }

    setIsGettingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const currentCoord = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoord(currentCoord);
        setIsGettingLocation(false);
        resolve(currentCoord);
      },
      (err) => {
        console.warn("[GEO] failed", err);
        toast({
          variant: "destructive",
          title: "Unable to get location",
          description: "Please enable location services and allow the browser permission.",
        });
        setIsGettingLocation(false);
        resolve(null);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  });
}, [toast]);

type SiteStatus = "complete" | "in-process" | "incomplete";

/**
 * Site status badges for a day (based on sessions)
 */
const getSiteStatuses = useCallback(
  (forDate: Date): Map<string, SiteStatus> => {
    const statuses = new Map<string, SiteStatus>();
    const dayStart = startOfDay(forDate).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    for (const site of settings.sites ?? []) {
      const siteName = site.name;

      const overlapping = sessions
        .filter((s) => (s.in?.site || s.out?.site) === siteName)
        .filter((s) => {
          const start = s.in?.ts ?? s.out?.ts ?? 0;
          const end = s.out?.ts ?? Date.now();
          return end > dayStart && start < dayEnd;
        });

      if (overlapping.length === 0) {
        statuses.set(siteName, "incomplete");
        continue;
      }

      const hasClosed = overlapping.some((s) => !!s.out);
      const hasActive = overlapping.some((s) => s.active);

      if (hasClosed) statuses.set(siteName, "complete");
      else if (hasActive) statuses.set(siteName, "in-process");
      else statuses.set(siteName, "incomplete");
    }

    return statuses;
  },
  [sessions, settings.sites]
);
 
 // --- Actions ---
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SHIFT_MS = 60 * 1000; // 1 minute minimum so it never shows 00:00 due to rounding/edge cases

// Build a timestamp on the selected calendar day using the current clock time.
// If that would be <= minTs (ex: clock-in), roll it forward 1 day (cross-midnight fix).
function buildTsOnDayWithRoll(forDate: Date, now: Date, minTs?: number) {
  const d = new Date(forDate);
  d.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
  let ts = d.getTime();

  if (typeof minTs === "number" && ts <= minTs) {
    ts += DAY_MS; // roll into next day
  }
  return ts;
}

const recordEntry = useCallback(
  async (
    action: "in" | "out",
    site: Site,
    forDate: Date,
    note?: string,
    employeeId?: string,
    isManagerOverride: boolean = false
  ) => {
    const targetEmployee =
      employees.find((e) => e.id === (employeeId || loggedInEmployee?.id)) || null;

    if (!targetEmployee) {
      toast({ variant: "destructive", title: "No employee selected." });
      return;
    }
    if (!site) {
      toast({
        variant: "destructive",
        title: "No site selected",
        description: "Please select a site from your schedule to clock in.",
      });
      return;
    }

    let entryData: Omit<Entry, "id"> | null = null;
    let currentCoord = coord;

    // --- CLOCK-OUT ---
    if (action === "out") {
      const openShift = sessions.find(
        (s) =>
          s.active &&
          s.employeeId === targetEmployee.id &&
          (s.in?.site || "") === site.name
      );

      const now = new Date();

      // Manager-only: manual OUT on a specific day (synthetic IN)
      if (!openShift && isManagerOverride) {
        // Use your existing helper for manual outs, but ensure IN < OUT and at least 1 minute
        const outTsRaw = buildTsOnDay(forDate, now);

        // If buildTsOnDay accidentally lands before start-of-day, clamp up.
        const dayStartTs = startOfDay(new Date(forDate)).getTime();
        const outTs = Math.max(outTsRaw, dayStartTs + MIN_SHIFT_MS);

        const inTs = Math.max(outTs - MIN_SHIFT_MS, dayStartTs);

        const syntheticIn: Omit<Entry, "id"> = {
          employee: targetEmployee.name,
          employeeId: targetEmployee.id,
          action: "in",
          ts: inTs,
          site: site.name,
          note: "[MANUAL] Synthetic IN to pair manual OUT",
        };

        const manualOut: Omit<Entry, "id"> = {
          employee: targetEmployee.name,
          employeeId: targetEmployee.id,
          action: "out",
          ts: outTs,
          site: site.name,
          note: note || "[MANUAL] Manual OUT",
        };

        if (engine === "cloud") {
          const cId = getCompanyId(settings);
          const col = collection(db, "companies", cId, "timeclock_entries");
          await addDoc(col, { ...syntheticIn, createdAt: serverTimestamp() });
          await addDoc(col, { ...manualOut, createdAt: serverTimestamp() });
        } else {
          setEntries((prev) => [
            ...prev,
            { id: uuid(), ...syntheticIn } as Entry,
            { id: uuid(), ...manualOut } as Entry,
          ]);
        }

        toast({ title: `Clock OUT recorded for ${site.name} (manual).` });
        return;
      }

      if (!openShift) {
        toast({
          variant: "destructive",
          title: "Not clocked in at this site",
          description: `${targetEmployee.name} is not currently clocked in at ${site.name}.`,
        });
        return;
      }

      const inTs = openShift.in?.ts ?? 0;

      // ✅ FIX: candidate OUT time in manager override is built on forDate,
      // but if it would fall BEFORE the IN time (cross-midnight), roll to next day.
      const candidateOutTs = isManagerOverride
        ? buildTsOnDayWithRoll(forDate, now, inTs)
        : now.getTime();

      // ✅ Ensure OUT is at least 1 minute after IN (prevents 00:00 display edge cases)
      const outTs = Math.max(candidateOutTs, inTs + MIN_SHIFT_MS);

      entryData = {
        employee: targetEmployee.name,
        employeeId: targetEmployee.id,
        action: "out",
        ts: outTs,
        site: site.name,
      };
    } else {
      // --- CLOCK-IN ---
      const anyShiftActive = isClockedIn(undefined, targetEmployee.id);

      if (!isManagerOverride && anyShiftActive) {
        toast({
          variant: "destructive",
          title: "Shift already active",
          description: `${targetEmployee.name} must clock out from their current shift before starting a new one.`,
        });
        return;
      }

      // Only employees must pass GPS / geofence checks
      if (!isManagerOverride) {
        if (settings.requireGPS && !currentCoord) {
          toast({
            title: "Location required",
            description: "Getting your location to verify...",
          });
          currentCoord = await requestLocation();
        }

        if (settings.requireGPS && !currentCoord) {
          toast({
            variant: "destructive",
            title: "Clock-in denied",
            description:
              "Could not get your location. Please enable location services.",
          });
          return;
        }

        if (settings.requireGeofence && currentCoord) {
          if (!site.lat || !site.lng) {
            toast({
              variant: "destructive",
              title: "Clock-in denied: site location missing",
              description: `Geofence is required, but the site "${site.name}" does not have GPS coordinates set.`,
              duration: 7000,
            });
            return;
          }

          const METERS_TO_FEET = 3.28084;
          const distanceInMeters = haversineDistance(
            { lat: site.lat, lng: site.lng },
            currentCoord
          );
          const distanceInFeet = distanceInMeters * METERS_TO_FEET;

          // ⚠️ Note: your settings.geofenceRadius is stored in METERS in ManagerSettingsView (Option 1),
          // so radiusInFeet should convert meters -> feet.
          const radiusMeters = settings.geofenceRadius ?? 0;
          const radiusInFeet = radiusMeters > 0 ? radiusMeters * METERS_TO_FEET : 150;

          if (distanceInFeet > radiusInFeet) {
            toast({
              variant: "destructive",
              title: "Clock-in denied: out of range",
              description: `You are ${distanceInFeet.toFixed(
                0
              )}ft away. You must be within ${radiusInFeet.toFixed(0)}ft.`,
              duration: 7000,
            });
            return;
          }
        }
      }

      const now = new Date();
      const ts = isManagerOverride ? buildTsOnDay(forDate, now) : now.getTime();

      entryData = {
        employee: targetEmployee.name,
        employeeId: targetEmployee.id,
        action: "in",
        ts,
        site: site.name,
      };
    }

    const dataToSave: any = { ...entryData };
    if (currentCoord?.lat && currentCoord?.lng) {
      dataToSave.lat = currentCoord.lat;
      dataToSave.lng = currentCoord.lng;
    }
    if (typeof note === "string" && note.trim()) dataToSave.note = note.trim();

    if (engine === "cloud") {
      const cId = getCompanyId(settings);
      const ref = collection(db, "companies", cId, "timeclock_entries");
      await addDoc(ref, { ...dataToSave, createdAt: serverTimestamp() });
      toast({ title: `Clock ${action.toUpperCase()} recorded for ${site.name}.` });
    } else {
      setEntries((prev) => [
        ...prev,
        { id: uuid(), ...(dataToSave as any) } as Entry,
      ]);
      toast({ title: `Clock ${action.toUpperCase()} recorded for ${site.name}.` });
    }
  },
  [
    employees,
    loggedInEmployee,
    coord,
    engine,
    settings,
    sessions,
    toast,
    isClockedIn,
    requestLocation,
  ]
);


  const deleteEntry = useCallback(
    async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this time entry?")) return;

      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "timeclock_entries", id);
        try {
          await deleteDoc(docRef);
          toast({ title: "Entry deleted" });
        } catch (e: any) {
          errorEmitter.emit("permission-error", new FirestorePermissionError({ path: docRef.path, operation: "delete" }));
          toast({ variant: "destructive", title: "Cloud delete failed", description: e.message, duration: 9000 });
        }
      } else {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        toast({ title: "Entry deleted" });
      }
    },
    [engine, settings, toast]
  );

  const updateEntry = useCallback(
    async (id: string, updates: Partial<Entry>) => {
      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "timeclock_entries", id);
        try {
          await updateDoc(docRef, cleanForFirestore(updates));
          toast({ title: "Entry updated" });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: docRef.path, operation: "update", requestResourceData: updates })
          );
          toast({ variant: "destructive", title: "Cloud update failed", description: e.message, duration: 9000 });
        }
      } else {
        setEntries((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...updates } as Entry) : e)));
        toast({ title: "Entry updated" });
      }
    },
    [engine, settings, toast]
  );

  // --- Schedule ---
  const addSchedule = useCallback(
    async (scheduleData: Omit<CleaningSchedule, "id">) => {
      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const newDocRef = doc(collection(db, "companies", cId, "schedules"));
        const dataToSave: CleaningSchedule = { ...scheduleData, id: newDocRef.id, exceptionDates: [] };

        try {
          await writeThenVerify(newDocRef as any, cleanForFirestore(dataToSave) as any, "ADD_SCHEDULE");
          toast({ title: "Schedule added" });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: newDocRef.path, operation: "create", requestResourceData: dataToSave })
          );
          toast({
            variant: "destructive",
            title: "Cloud write failed",
            description: e?.message ?? String(e),
            duration: 9000,
          });
        }
      } else {
        setSchedules((prev) => [...prev, { id: uuid(), ...scheduleData, exceptionDates: [] } as CleaningSchedule]);
        toast({ title: "Schedule added" });
      }
    },
    [engine, settings, toast]
  );

  const updateSchedule = useCallback(
    async (id: string, updates: Partial<CleaningSchedule>) => {
      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "schedules", id);
        try {
          await updateDoc(docRef, cleanForFirestore(updates));
          toast({ title: "Schedule updated" });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: docRef.path, operation: "update", requestResourceData: updates })
          );
          toast({ variant: "destructive", title: "Cloud write failed", description: e.message, duration: 9000 });
        }
      } else {
        setSchedules((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...updates } as CleaningSchedule) : s)));
        toast({ title: "Schedule updated" });
      }
    },
    [engine, settings, toast]
  );

  const deleteSchedule = useCallback(
    async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this schedule?")) return;

      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "schedules", id);
        try {
          await deleteDoc(docRef);
          toast({ title: "Schedule deleted" });
        } catch (e: any) {
          errorEmitter.emit("permission-error", new FirestorePermissionError({ path: docRef.path, operation: "delete" }));
          toast({ variant: "destructive", title: "Cloud delete failed", description: e.message, duration: 9000 });
        }
      } else {
        setSchedules((prev) => prev.filter((s) => s.id !== id));
        toast({ title: "Schedule deleted" });
      }
    },
    [engine, settings, toast]
  );

  // --- Sites ---
  const deleteSite = useCallback(
    async (siteId: string) => {
      const siteToDelete = (settings.sites ?? []).find((s) => s.id === siteId);
      if (!siteToDelete) {
        toast({ variant: "destructive", title: "Site not found" });
        return;
      }

      if (
        !window.confirm(
          `Are you sure you want to delete the site "${siteToDelete.name}" and all its associated schedules? This cannot be undone.`
        )
      )
        return;

      const schedulesToDelete = schedules.filter((s) => s.siteName === siteToDelete.name);

      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const batch = writeBatch(db);

        schedulesToDelete.forEach((schedule) => {
          batch.delete(doc(db, "companies", cId, "schedules", schedule.id));
        });

        const updatedSites = (settings.sites ?? []).filter((s) => s.id !== siteId);
        batch.set(doc(db, "companies", cId, "settings", "main"), { sites: updatedSites }, { merge: true });

        try {
          await batch.commit();
          toast({ title: `Site "${siteToDelete.name}" and its schedules have been deleted.` });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({
              path: `companies/${cId}`,
              operation: "update",
              requestResourceData: { sites: updatedSites },
            })
          );
          toast({ variant: "destructive", title: "Cloud delete failed", description: e.message, duration: 9000 });
        }
      } else {
        setSchedules((prev) => prev.filter((s) => s.siteName !== siteToDelete.name));
        updateSettings((s) => ({ ...s, sites: (s.sites ?? []).filter((x) => x.id !== siteId) }));
        toast({ title: `Site "${siteToDelete.name}" and its schedules have been deleted.` });
      }
    },
    [engine, schedules, settings.sites, toast, updateSettings, settings]
  );

  // --- Mileage ---
  const addMileageLog = useCallback(
    async (logData: Omit<MileageLog, "id">) => {
      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const newDocRef = doc(collection(db, "companies", cId, "mileage_logs"));
        const dataToSave = { ...logData, id: newDocRef.id };

        try {
          await writeThenVerify(newDocRef as any, cleanForFirestore(dataToSave) as any, "ADD_MILEAGE");
          toast({ title: "Mileage log added" });
        } catch (e: any) {
          console.error("[ADD_MILEAGE] failed", e?.code, e?.message);
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: newDocRef.path, operation: "create", requestResourceData: dataToSave })
          );
          toast({
            variant: "destructive",
            title: "Cloud write failed",
            description: e?.message ?? String(e),
            duration: 9000,
          });
        }
      } else {
        setMileageLogs((prev) => [...prev, { id: uuid(), ...logData } as MileageLog]);
        toast({ title: "Mileage log added" });
      }
    },
    [engine, settings, toast]
  );

  const updateMileageLog = useCallback(
    async (id: string, updates: Partial<MileageLog>) => {
      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "mileage_logs", id);
        try {
          await updateDoc(docRef, cleanForFirestore(updates));
          toast({ title: "Mileage log updated" });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: docRef.path, operation: "update", requestResourceData: updates })
          );
          toast({ variant: "destructive", title: "Cloud write failed", description: e.message, duration: 9000 });
        }
      } else {
        setMileageLogs((prev) => prev.map((l) => (l.id === id ? ({ ...l, ...updates } as MileageLog) : l)));
        toast({ title: "Mileage log updated" });
      }
    },
    [engine, settings, toast]
  );

  const deleteMileageLog = useCallback(
    async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this mileage log?")) return;

      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "mileage_logs", id);
        try {
          await deleteDoc(docRef);
          toast({ title: "Mileage log deleted" });
        } catch (e: any) {
          errorEmitter.emit("permission-error", new FirestorePermissionError({ path: docRef.path, operation: "delete" }));
          toast({ variant: "destructive", title: "Cloud delete failed", description: e.message, duration: 9000 });
        }
      } else {
        setMileageLogs((prev) => prev.filter((l) => l.id !== id));
        toast({ title: "Mileage log deleted" });
      }
    },
    [engine, settings, toast]
  );

  // --- Other Expenses ---
  const addOtherExpense = useCallback(
    async (expenseData: Omit<OtherExpense, "id">, receiptFile?: File) => {
      const cId = getCompanyId(settings);

      if (engine === "cloud") {
        try {
          await addOtherExpenseFS(cId, expenseData, receiptFile);
          toast({ title: "Expense added" });
        } catch (e: any) {
          console.error("[addOtherExpense] failed", e);
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({
              path: `companies/${cId}/other_expenses`,
              operation: "create",
              requestResourceData: expenseData,
            })
          );
          toast({
            variant: "destructive",
            title: "Could not add expense",
            description: e.message || "Check connection and permissions.",
          });
        }
      } else {
        setOtherExpenses((prev) => [...prev, { id: uuid(), ...expenseData } as OtherExpense]);
        toast({ title: "Expense added (local)" });
      }
    },
    [engine, settings, toast]
  );

  const updateOtherExpense = useCallback(
    async (id: string, updates: Partial<OtherExpense>, receiptFile?: File) => {
      const cId = getCompanyId(settings);

      if (engine === "cloud") {
        try {
          await updateOtherExpenseFS(cId, id, updates, receiptFile);
          toast({ title: "Expense updated" });
        } catch (e: any) {
          console.error("[updateOtherExpense] failed", e);
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({
              path: `companies/${cId}/other_expenses/${id}`,
              operation: "update",
              requestResourceData: updates,
            })
          );
          toast({
            variant: "destructive",
            title: "Could not update expense",
            description: e.message || "Check connection and permissions.",
          });
        }
      } else {
        setOtherExpenses((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...updates } as OtherExpense) : e)));
        toast({ title: "Expense updated (local)" });
      }
    },
    [engine, settings, toast]
  );

  const deleteOtherExpense = useCallback(
    async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this expense?")) return;
      const cId = getCompanyId(settings);
      const existing = otherExpenses.find((e) => e.id === id);

      if (engine === "cloud") {
        try {
          await deleteOtherExpenseFS(cId, id, existing);
          toast({ title: "Expense deleted" });
        } catch (e: any) {
          console.error("[deleteOtherExpense] failed", e);
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({
              path: `companies/${cId}/other_expenses/${id}`,
              operation: "delete",
            })
          );
          toast({
            variant: "destructive",
            title: "Could not delete expense",
            description: e.message || "Check connection and permissions.",
          });
        }
      } else {
        setOtherExpenses((prev) => prev.filter((e) => e.id !== id));
        toast({ title: "Expense deleted (local)" });
      }
    },
    [engine, settings, toast, otherExpenses]
  );

  // --- Employees ---
  const addEmployee = useCallback(
    async (employeeData: Omit<Employee, "id">) => {
      try {
        if (engine === "cloud") {
          const cId = getCompanyId(settings);
          const newDocRef = doc(collection(db, "companies", cId, "employees"));
          const dataToSave: Employee = { ...employeeData, id: newDocRef.id };

          await writeThenVerify(newDocRef as any, cleanForFirestore(dataToSave) as any, "ADD_EMPLOYEE");
          toast({ title: "Employee added", description: `${dataToSave.name} has been created.` });
          return;
        }

        const localEmp: Employee = { id: uuid(), ...employeeData } as Employee;
        setEmployees((prev) => [...prev, localEmp]);
        toast({ title: "Employee added", description: `${localEmp.name} has been created.` });
      } catch (e: any) {
        console.error("addEmployee failed:", e?.code, e?.message, e);
        toast({
          variant: "destructive",
          title: "Cloud write failed",
          description: `${e?.code}: ${e?.message}`,
        });
        throw e;
      }
    },
    [engine, settings, toast]
  );

  const updateEmployee = useCallback(
    async (id: string, updates: Partial<Employee>) => {
      const cId = getCompanyId(settings);
      const isSelfEdit = loggedInEmployee?.id === id && !(unlocked && tab === "manager");

      if (engine === "cloud") {
        if (isSelfEdit) {
          const reqRef = doc(collection(db, "companies", cId, "employee_update_requests"));

          const payload: EmployeeUpdateRequest = {
            id: reqRef.id,
            employeeId: id,
            employeeName: loggedInEmployee?.name || "",
            updates: cleanForFirestore(updates),
            status: "pending",
            requestedAt: serverTimestamp() as any,
            requestedByUid: user?.uid || undefined,
          };

          try {
            await setDoc(reqRef, payload as any);
            toast({
              title: "Profile changes submitted",
              description: "Your manager must approve your profile updates before they go live.",
            });
          } catch (e: any) {
            errorEmitter.emit(
              "permission-error",
              new FirestorePermissionError({ path: reqRef.path, operation: "create", requestResourceData: payload })
            );
            toast({
              variant: "destructive",
              title: "Could not submit changes",
              description: e.message,
              duration: 9000,
            });
          }
          return;
        }

        const docRef = doc(db, "companies", cId, "employees", id);

        try {
          await updateDoc(docRef, cleanForFirestore(updates));
          toast({ title: "Employee updated" });

          if (loggedInEmployee?.id === id) {
            setLoggedInEmployee((prev) => (prev ? ({ ...prev, ...updates } as Employee) : null));
          }
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: docRef.path, operation: "update", requestResourceData: updates })
          );
          toast({ variant: "destructive", title: "Cloud write failed", description: e.message, duration: 9000 });
        }
      } else {
        setEmployees((prev) => prev.map((emp) => (emp.id === id ? ({ ...emp, ...updates } as Employee) : emp)));
        if (loggedInEmployee?.id === id) {
          setLoggedInEmployee((prev) => (prev ? ({ ...prev, ...updates } as Employee) : null));
        }
        toast({ title: "Employee updated (local)" });
      }
    },
    [engine, settings, toast, loggedInEmployee, unlocked, tab, user, employeeUpdateRequests]
  );

  const handleEmployeeUpdateRequest = useCallback(
    async (updates: Partial<Employee>) => {
      if (!loggedInEmployee) return;
      await updateEmployee(loggedInEmployee.id, updates);
    },
    [loggedInEmployee, updateEmployee]
  );

  const deleteEmployee = useCallback(
    async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this employee? This cannot be undone.")) return;

      const employeeToDelete = employees.find((emp) => emp.id === id);
      if (!employeeToDelete) return;

      const employeeName = employeeToDelete.name;
      const schedulesToUpdate = schedules.filter((schedule) => schedule.assignedTo.includes(employeeName));

      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const batch = writeBatch(db);

        batch.delete(doc(db, "companies", cId, "employees", id));

        schedulesToUpdate.forEach((schedule) => {
          const updatedAssignedTo = schedule.assignedTo.filter((name) => name !== employeeName);
          batch.update(doc(db, "companies", cId, "schedules", schedule.id), { assignedTo: updatedAssignedTo });
        });

        try {
          await batch.commit();
          toast({ title: "Employee deleted and unassigned from schedules." });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: `companies/${cId}/employees/${id}`, operation: "delete" })
          );
          toast({ variant: "destructive", title: "Cloud delete failed", description: e.message, duration: 9000 });
        }
      } else {
        setEmployees((prev) => prev.filter((emp) => emp.id !== id));
        setSchedules((prev) =>
          prev.map((schedule) =>
            schedule.assignedTo.includes(employeeName)
              ? { ...schedule, assignedTo: schedule.assignedTo.filter((n) => n !== employeeName) }
              : schedule
          )
        );
        toast({ title: "Employee deleted and unassigned from schedules." });
      }
    },
    [employees, engine, schedules, settings, toast]
  );

  const approveEmployeeUpdate = useCallback(
    async (requestId: string) => {
      const req = employeeUpdateRequests.find((r) => r.id === requestId);
      if (!req) {
        toast({ variant: "destructive", title: "Request not found" });
        return;
      }

      const cId = getCompanyId(settings);

      if (engine === "cloud") {
        const batch = writeBatch(db);
        batch.update(doc(db, "companies", cId, "employees", req.employeeId), cleanForFirestore(req.updates));
        batch.update(doc(db, "companies", cId, "employee_update_requests", requestId), {
          status: "approved",
          approvedAt: serverTimestamp(),
          approvedByUid: user?.uid || null,
        });

        try {
          await batch.commit();
          toast({ title: "Profile update approved", description: `Changes applied to ${req.employeeName}.` });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({
              path: `companies/${cId}`,
              operation: "update",
              requestResourceData: { employee: req.employeeId, updates: req.updates },
            })
          );
          toast({ variant: "destructive", title: "Could not approve request", description: e.message, duration: 9000 });
        }
      } else {
        setEmployees((prev) =>
          prev.map((emp) => (emp.id === req.employeeId ? ({ ...emp, ...req.updates } as Employee) : emp))
        );
        setEmployeeUpdateRequests((prev) => prev.map((r) => (r.id === requestId ? { ...r, status: "approved" } : r)));
        toast({ title: "Profile update approved (local mode)" });
      }
    },
    [engine, settings, employeeUpdateRequests, user, toast]
  );

  const rejectEmployeeUpdate = useCallback(
    async (requestId: string, reason?: string) => {
      const req = employeeUpdateRequests.find((r) => r.id === requestId);
      if (!req) {
        toast({ variant: "destructive", title: "Request not found" });
        return;
      }

      const cId = getCompanyId(settings);
      const rejectionPayload = {
        status: "rejected" as const,
        rejectedAt: serverTimestamp(),
        rejectedByUid: user?.uid || null,
        reason: reason || null,
      };

      if (engine === "cloud") {
        const reqRef = doc(db, "companies", cId, "employee_update_requests", requestId);
        try {
          await updateDoc(reqRef, cleanForFirestore(rejectionPayload));
          toast({ title: "Profile update rejected", description: reason || undefined });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: reqRef.path, operation: "update", requestResourceData: rejectionPayload })
          );
          toast({ variant: "destructive", title: "Could not reject request", description: e.message, duration: 9000 });
        }
      } else {
        setEmployeeUpdateRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, status: "rejected", reason: reason || null } : r))
        );
        toast({ title: "Profile update rejected (local mode)" });
      }
    },
    [engine, settings, employeeUpdateRequests, user, toast]
  );

  // --- Invoices ---
  const addInvoice = useCallback(
    async (invoiceData: Omit<Invoice, "id">) => {
      const cId = getCompanyId(settings);
      const today = new Date().toISOString().slice(0, 10);

      const payload = withComputed({
        ...invoiceData,
        status: invoiceData.status ?? "draft",
        date: invoiceData.date ?? today,
        dueDate: invoiceData.dueDate ?? today,
        lineItems: invoiceData.lineItems ?? [],
        taxRate: invoiceData.taxRate ?? settings.taxRate ?? 0,
        discountPercent: invoiceData.discountPercent ?? 0,
        discountAmount: invoiceData.discountAmount ?? 0,
      });

      if (engine === "cloud") {
        try {
          const newDocRef = doc(collection(db, "companies", cId, "invoices"));
          const dataToSave = cleanForFirestore({ ...payload, id: newDocRef.id });
          console.log("[ADD INVOICE] path=", newDocRef.path, dataToSave);
          await writeThenVerify(newDocRef as any, dataToSave as any, "ADD_INVOICE");
          toast({ title: "Invoice added" });
        } catch (e: any) {
          console.warn("[ADD INVOICE] FAILED", e?.code, e?.message);
          toast({
            variant: "destructive",
            title: "Cloud write failed",
            description: `${e?.code || "error"}: ${e?.message || "unknown"}`,
            duration: 9000,
          });
        }
      } else {
        setInvoices((prev) => [...prev, { id: String(Date.now()), ...(payload as any) } as Invoice]);
        toast({ title: "Invoice added (local)" });
      }
    },
    [engine, settings, toast]
  );

  const updateInvoice = useCallback(
    async (id: string, updates: Partial<Invoice>) => {
      const existing = invoices.find((i) => i.id === id) as any;
      const computed = withComputed({ ...existing, ...updates });

      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "invoices", id);
        try {
          await updateDoc(docRef, cleanForFirestore(computed));
          toast({ title: "Invoice updated" });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: docRef.path, operation: "update", requestResourceData: updates })
          );
          toast({ variant: "destructive", title: "Cloud write failed", description: e.message, duration: 9000 });
        }
      } else {
        setInvoices((prev) => prev.map((inv) => (inv.id === id ? ({ ...inv, ...computed } as Invoice) : inv)));
        toast({ title: "Invoice updated" });
      }
    },
    [engine, invoices, settings, toast]
  );

  const deleteInvoice = useCallback(
    async (id: string) => {
      if (!window.confirm("Are you sure you want to delete this invoice?")) return;

      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "invoices", id);
        try {
          await deleteDoc(docRef);
          toast({ title: "Invoice deleted." });
        } catch (e: any) {
          errorEmitter.emit("permission-error", new FirestorePermissionError({ path: docRef.path, operation: "delete" }));
          toast({ variant: "destructive", title: "Cloud delete failed", description: e.message, duration: 9000 });
        }
      } else {
        setInvoices((prev) => prev.filter((inv) => inv.id !== id));
        toast({ title: "Invoice deleted." });
      }
    },
    [engine, settings, toast]
  );

  // --- Payroll ---
  const savePayrollPeriod = useCallback(
    async (periodData: PayrollPeriod) => {
      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "payroll_periods", periodData.id);
        const isCreate = !payrollPeriods.find((p) => p.id === periodData.id);

        try {
          await setDoc(docRef, cleanForFirestore(periodData), { merge: true });
          toast({ title: `Payroll for period ending ${periodData.endDate.substring(0, 10)} saved.` });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({
              path: docRef.path,
              operation: isCreate ? "create" : "update",
              requestResourceData: periodData,
            })
          );
          toast({ variant: "destructive", title: "Cloud write failed", description: e.message, duration: 9000 });
        }
      } else {
        setPayrollPeriods((prev) => {
          const existing = prev.find((p) => p.id === periodData.id);
          return existing
            ? prev.map((p) => (p.id === periodData.id ? { ...p, ...periodData } : p))
            : [...prev, periodData];
        });
        toast({ title: `Payroll for period ending ${periodData.endDate.substring(0, 10)} saved.` });
      }
    },
    [engine, settings, toast, payrollPeriods]
  );

  const deletePayrollPeriod = useCallback(
    async (periodId: string) => {
      if (!window.confirm("Are you sure you want to permanently delete this payroll period? This cannot be undone."))
        return;

      if (engine === "cloud") {
        const cId = getCompanyId(settings);
        const docRef = doc(db, "companies", cId, "payroll_periods", periodId);

        try {
          await deleteDoc(docRef);
          toast({ title: "Payroll period deleted." });
        } catch (e: any) {
          errorEmitter.emit("permission-error", new FirestorePermissionError({ path: docRef.path, operation: "delete" }));
          toast({ variant: "destructive", title: "Cloud delete failed", description: e.message, duration: 9000 });
        }
      } else {
        setPayrollPeriods((prev) => prev.filter((p) => p.id !== periodId));
        toast({ title: "Payroll period deleted." });
      }
    },
    [engine, settings, toast]
  );

  const confirmPayroll = useCallback(
    async (periodId: string, employeeId: string, revision: number) => {
      if (!user) return;

      const confirmation: PayrollConfirmation = {
        periodId,
        companyId: getCompanyId(settings),
        uid: user.uid,
        employeeId,
        employeeName: employees.find((e) => e.id === employeeId)?.name || "Unknown",
        confirmed: true,
        at: serverTimestamp() as any,
        revision,
      };

      const cId = getCompanyId(settings);
      const docId = `${employeeId}__rev${revision}`;

      if (engine === "cloud") {
        const docRef = doc(db, `companies/${cId}/payroll_periods/${periodId}/confirmations`, docId);
        try {
          await setDoc(docRef, cleanForFirestore(confirmation), { merge: true });
          toast({ title: "Payroll confirmed!" });
        } catch (e: any) {
          errorEmitter.emit(
            "permission-error",
            new FirestorePermissionError({ path: docRef.path, operation: "create", requestResourceData: confirmation })
          );
          toast({ variant: "destructive", title: "Cloud write failed", description: e.message, duration: 9000 });
        }
      } else {
        toast({ title: "Payroll confirmed (local mode)." });
      }
    },
    [engine, employees, settings, toast, user]
  );

  // --- Exports ---
  const exportCSV = useCallback(() => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Employee", "Action", "Timestamp", "Local Date/Time", "Latitude", "Longitude", "Site", "Note"];
    const rows = entries
      .slice()
      .sort((a, b) => a.ts - b.ts)
      .map((e) =>
        [e.employee, e.action, e.ts, new Date(e.ts).toLocaleString(), e.lat, e.lng, e.site, e.note]
          .map(esc)
          .join(",")
      );
    const csv = [header.map(esc).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timewise-entries-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "CSV Export Started" });
  }, [entries, toast]);

  const exportSessionsCSV = useCallback(() => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Employee", "Site", "In", "Out", "Minutes"];

    const rows = groupSessions([...entries].sort((a, b) => a.ts - b.ts))
      .filter((s): s is Session & { in: NonNullable<Session["in"]>; out: NonNullable<Session["out"]> } => Boolean(s.in && s.out))
      .map((s) =>
        [s.employee, s.in.site || "", new Date(s.in.ts).toLocaleString(), new Date(s.out.ts).toLocaleString(), s.minutes]
          .map(esc)
          .join(",")
      );

    const csv = [header.map(esc).join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `timewise-sessions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Sessions CSV Export Started" });
  }, [entries, toast]);

  const setSiteLocationFromHere = useCallback(
    async (siteId: string) => {
      const pos = await requestLocation();
      if (!pos) return;

      const { lat, lng } = pos;
      const site = (settings.sites ?? []).find((s) => s.id === siteId);
      if (!site) {
        toast({ variant: "destructive", title: "Site not found" });
        return;
      }

      const updatedSites = (settings.sites ?? []).map((s) => (s.id === site.id ? { ...s, lat, lng } : s));
      updateSettings((s) => ({ ...s, sites: updatedSites }));
      toast({ title: `GPS set for ${site.name}` });
    },
    [settings.sites, updateSettings, requestLocation, toast]
  );

  const testGeofence = useCallback(
    async (site: Site) => {
      if (!site?.lat || !site?.lng) {
        toast({ variant: "destructive", title: "Site is missing GPS" });
        return;
      }
      const pos = await requestLocation();
      if (!pos) return;

      const METERS_TO_FEET = 3.28084;
      const distanceMeters = haversineDistance({ lat: site.lat, lng: site.lng }, pos);
      const distanceFeet = distanceMeters * METERS_TO_FEET;
      const radiusFeet = settings.geofenceRadius ?? 150;

      toast({
        title: distanceFeet <= radiusFeet ? "Inside Geofence" : "Outside Geofence",
        description: `Distance: ${distanceFeet.toFixed(0)}ft · Limit: ${radiusFeet.toFixed(0)}ft`,
      });
    },
    [requestLocation, settings.geofenceRadius, toast]
  );

  // --- Memos for Manager ---
  const employeeNames = useMemo(() => employees.map((e) => e.name).sort((a, b) => a.localeCompare(b)), [employees]);

  const filteredSessions = useMemo(() => {
    let list = sessions;
    const min = fromDate ? new Date(fromDate + "T00:00:00").getTime() : -Infinity;
    const max = toDate ? new Date(toDate + "T23:59:59").getTime() : Infinity;

    list = list.filter((s) => {
      const start = s.in?.ts ?? s.out?.ts ?? 0;
      const end = s.out?.ts ?? s.in?.ts ?? 0;
      return Math.max(start, min) <= Math.min(end || start, max);
    });

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.employee.toLowerCase().includes(q));
    }
    return list;
  }, [sessions, fromDate, toDate, search]);

  const handleGenerateSummary = useCallback(async () => {
    setIsAiSummaryOpen(true);
    setIsGenerating(true);
    setAiSummary(null);
    setAiError(null);

    try {
      const entriesForAI: AiEntry[] = filteredSessions
        .flatMap((s) => (s.out ? [s.in, s.out] : [s.in]))
        .filter((e): e is Entry => !!e)
        .map(({ id, employee, employeeId, action, ts, lat, lng, note, site }) => {
          const result: AiEntry = {
            employee,
            employeeId: employeeId!,
            action,
            site,
            ts: new Date(ts).toISOString(),
          };
          if (lat !== undefined) result.lat = lat;
          if (lng !== undefined) result.lng = lng;
          if (note !== undefined) result.note = note;
          if (id) result.id = id;
          return result;
        });

      const result = await getAiSummary(entriesForAI, fromDate, toDate);
      if (result.success && result.summary) setAiSummary(result.summary);
      else setAiError(result.error || "An unknown error occurred.");
    } catch (e: any) {
      setAiError(e?.message || "Failed to generate summary.");
    } finally {
      setIsGenerating(false);
    }
  }, [filteredSessions, fromDate, toDate]);

  const totalsByEmployee = useMemo(() => {
    const map = new Map<string, number>();
    const min = fromDate ? new Date(fromDate + "T00:00:00").getTime() : -Infinity;
    const max = toDate ? new Date(toDate + "T23:59:59").getTime() : Infinity;

    for (const s of sessions) {
      if (!s.in || !s.out) continue;
      const overlapStart = Math.max(s.in.ts, min);
      const overlapEnd = Math.min(s.out.ts, max);
      if (overlapEnd > overlapStart) {
        const minutesInFilter = (overlapEnd - overlapStart) / 60000;
        map.set(s.employee, (map.get(s.employee) || 0) + minutesInFilter);
      }
    }

    let result = Array.from(map.entries())
      .map(([employee, minutes]) => ({ employee, minutes }))
      .sort((a, b) => b.minutes - a.minutes);

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((r) => r.employee.toLowerCase().includes(q));
    }

    return result;
  }, [sessions, fromDate, toDate, search]);

  const activeShifts = useMemo(() => sessions.filter((s) => s.active), [sessions]);

  const handleLogin = useCallback((employee: Employee) => setLoggedInEmployee(employee), []);
  const handleLogout = useCallback(() => setLoggedInEmployee(null), []);

  const managerChipDate = useMemo(() => (fromDate ? new Date(fromDate + "T00:00:00") : new Date()), [fromDate]);

  const profitabilityBySite = useMemo(() => {
    return computeJobProfitability({
      date: managerChipDate,
      settings,
      entries,
      employees,
      mileageLogs,
      otherExpenses,
      schedules,
      invoices,
    });
  }, [managerChipDate, settings, entries, employees, mileageLogs, otherExpenses, schedules, invoices]);

  const getDurationsBySite = useCallback(
    (forDate: Date) => {
      const map = new Map<string, { minutes: number; byEmployee: Record<string, number> }>();
      const dayStart = startOfDay(forDate).getTime();
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;

      for (const s of sessions) {
        if (!s.in) continue;
        const sessionStart = s.in.ts;
        const sessionEnd = s.out?.ts ?? Date.now();

        const overlapStart = Math.max(sessionStart, dayStart);
        const overlapEnd = Math.min(sessionEnd, dayEnd);
        if (overlapEnd <= overlapStart) continue;

        const minutes = (overlapEnd - overlapStart) / 60000;
        const site = s.in.site || "Unassigned";

        const current = map.get(site) || { minutes: 0, byEmployee: {} };
        current.minutes += minutes;
        current.byEmployee[s.employee] = (current.byEmployee[s.employee] || 0) + minutes;
        map.set(site, current);
      }
      return map;
    },
    [sessions]
  );

  // --- Render guards ---
    // --- Render guards ---
  const showConnecting = engine === "cloud" && !authReady;

  return (
    <main className="min-h-screen p-4 sm:p-6 lg:p-8">
      {showConnecting ? (
        <div className="min-h-[60vh] flex items-center justify-center">
          <p>Connecting to the cloud...</p>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto">
          {process.env.NODE_ENV !== "production" && (
            <div className="mb-2 text-xs text-muted-foreground">
              Engine: <b>{engine}</b> · Company:{" "}
              <b>{settings.companyId?.trim() || process.env.NEXT_PUBLIC_COMPANY_ID}</b>
            </div>
          )}

          <Header
            tab={tab}
            onTabChange={setTab as any}
            isManager={unlocked && tab === "manager"}
            isLoggedIn={!!loggedInEmployee}
          />

          {loggedInEmployee ? (
            <EmployeeView
              employee={loggedInEmployee}
              onLogout={handleLogout}
              settings={settings}
              recordEntry={recordEntry}
              requestLocation={requestLocation}
              coord={coord}
              entries={entries ?? []}
              schedules={schedules ?? []}
              updateSchedule={updateSchedule}
              isGettingLocation={isGettingLocation}
              isClockedIn={isClockedIn}
              updateEmployee={updateEmployee}
              payrollPeriods={payrollPeriods ?? []}
              confirmPayroll={confirmPayroll}
              payrollConfirmations={payrollConfirmations ?? []}
              getSiteStatuses={getSiteStatuses}
              onRequestUpdate={handleEmployeeUpdateRequest}
            />
          ) : tab === "employee" ? (
            <EmployeeLogin employees={employees} onLogin={handleLogin} />
          ) : (
            <ManagerView
              unlocked={unlocked}
              setUnlocked={setUnlocked}
              settings={settings}
              setSettings={updateSettings}
              activeShifts={activeShifts}
              totalsByEmployee={totalsByEmployee}
              filteredSessions={filteredSessions}
              fromDate={fromDate}
              setFromDate={setFromDate}
              toDate={toDate}
              setToDate={setToDate}
              setSearch={setSearch}
              search={search}
              exportCSV={exportCSV}
              exportSessionsCSV={exportSessionsCSV}
              setSiteLocationFromHere={setSiteLocationFromHere}
              onGenerateSummary={handleGenerateSummary}
              isGenerating={isGenerating}
              updateEntry={updateEntry}
              deleteEntry={deleteEntry}
              sites={settings.sites ?? []}
              employees={employees ?? []}
              employeeNames={employeeNames}
              addEmployee={addEmployee}
              updateEmployee={updateEmployee}
              deleteEmployee={deleteEmployee}
              schedules={schedules ?? []}
              addSchedule={addSchedule}
              updateSchedule={updateSchedule}
              deleteSchedule={deleteSchedule}
              deleteSite={deleteSite}
              mileageLogs={mileageLogs ?? []}
              addMileageLog={addMileageLog}
              updateMileageLog={updateMileageLog}
              deleteMileageLog={deleteMileageLog}
              otherExpenses={otherExpenses ?? []}
              addOtherExpense={addOtherExpense}
              updateOtherExpense={updateOtherExpense}
              deleteOtherExpense={deleteOtherExpense}
              allEntries={entries}
              payrollPeriods={payrollPeriods ?? []}
              savePayrollPeriod={savePayrollPeriod}
              deletePayrollPeriod={deletePayrollPeriod}
              payrollConfirmations={payrollConfirmations ?? []}
              getSiteStatuses={getSiteStatuses}
              recordEntry={recordEntry}
              isClockedIn={isClockedIn}
              invoices={invoices ?? []}
              addInvoice={addInvoice}
              updateInvoice={updateInvoice}
              deleteInvoice={deleteInvoice}
              testGeofence={testGeofence}
              profitabilityBySite={profitabilityBySite}
              getDurationsBySite={getDurationsBySite}
              employeeUpdateRequests={employeeUpdateRequests}
              approveEmployeeUpdate={approveEmployeeUpdate}
              rejectEmployeeUpdate={rejectEmployeeUpdate}
              engine={engine}
              setEngine={setEngine}
            />
          )}

          <Footer engine={engine} />
        </div>
      )}

      <AISummaryDialog
        isOpen={isAiSummaryOpen}
        onOpenChange={setIsAiSummaryOpen}
        summary={aiSummary}
        error={aiError}
        isLoading={isGenerating}
      />
    </main>
  );
  }
