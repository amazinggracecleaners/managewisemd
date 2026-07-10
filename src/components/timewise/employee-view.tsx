"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  writeBatch,
   addDoc,
   updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  Entry,
  Settings,
  Site,
  CleaningSchedule,
  Employee,
  PayrollPeriod,
  PayrollConfirmation,
  SiteStatus,
  Session,
} from "@/shared/types/domain";
import { formatDT, groupSessions, minutesToHHMM } from "@/lib/time-utils";
import {
  LogIn,
  LogOut,
  ExternalLink,
  Navigation,
  Power,
  User,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FilePenLine,
  Bell,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { uploadMessageAttachment } from "@/features/messages/message-attachments";
import {
  format,
  add,
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  isSameDay,
  parseISO,
  differenceInCalendarWeeks,
  getDate,
  getMonth,
  getYear,
  differenceInCalendarDays,
  startOfToday,
  endOfMonth,
  isBefore,
  startOfMonth,
  isToday,
} from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { EmployeeProfileDialog } from "./employee-profile";
import { EmployeePayrollView } from "./employee-payroll-view";
import { cn } from "@/lib/utils";
import { getGoogleMapsUrl } from "@/lib/navigation";
import {
  haversineMiles,
  estimateDriveMinutes,
  optimizeRouteFromStart,
} from "@/lib/routing";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
 DialogTrigger,
} from "@/components/ui/dialog";

import { Textarea } from "@/components/ui/textarea";
import { EmployeeNotifications } from "./employee-notifications";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
interface EmployeeViewProps {
  employee: Employee;
  onLogout: () => void;
  settings: Settings;
    recordEntry: (
  action: "in" | "out",
  site: Site,
  entryTime: Date,

  scheduleId?: string,
  scheduleDate?: string,

  note?: string,
  employeeId?: string,
  isManagerOverride?: boolean,
  context?: {
    source:
      | "employee-clock"
      | "manager-schedule-view"
      | "manager-manual-entry";
    initiatedBy?: string;
  }
) => void;
  requestLocation: () => void;
  coord: { lat: number; lng: number } | null;
  entries: Entry[];
  schedules: CleaningSchedule[];
  updateSchedule: (id: string, updates: Partial<CleaningSchedule>) => void;
  isManagerPreview?: boolean;
  isGettingLocation?: boolean;
  isClockedIn: (siteName?: string, employeeId?: string) => boolean;
  updateEmployee: (id: string, updates: Partial<Employee>) => Promise<void>;
  payrollPeriods: PayrollPeriod[];
  confirmPayroll: (periodId: string, employeeId: string, revision: number) => Promise<void>;
  payrollConfirmations: PayrollConfirmation[];
  getSiteStatuses: (forDate: Date) => Map<string, SiteStatus>;
  onRequestUpdate?: (updates: Partial<Employee>) => Promise<void>;

  // ✅ OPTION A — Added
  teams?: { id: string; name: string }[];
}


const getStatusIndicator = (status: SiteStatus | undefined, hours?: string) => {
  if (!status) return null;
  const statusConfig = {
    incomplete: { color: "bg-red-500", label: "Incomplete" },
    "in-process": { color: "bg-lime-400", label: "In Process" },
    complete: { color: "bg-green-500", label: "Complete" },
  } as const;

  const base = statusConfig[status];
  const label = status === "complete" && hours ? `Complete (${hours})` : base.label;

  return (
    <Badge variant="outline" className={cn("capitalize text-white text-xs", base.color)}>
      {label}
    </Badge>
  );
};

const formatDateHeader = (date: Date): string => {
  const today = startOfToday();
  const diff = differenceInCalendarDays(date, today);
  const fullDate = format(date, "EEEE, MMMM d, yyyy");

  if (diff === 0) return `Today, ${fullDate}`;
  if (diff === -1) return `Yesterday, ${fullDate}`;
  if (diff === 1) return `Tomorrow, ${fullDate}`;

  return fullDate;
};

/**
 * Minutes of a session that overlap a specific calendar day.
 * Handles cross-midnight shifts correctly.
 */
function sessionMinutesOnDay(s: Session, day: Date, nowTs: number = Date.now()): number {
  const inTs = s.in?.ts ?? 0;
  if (!inTs) return 0;

  const outTs = s.out?.ts ?? nowTs;

  const dayStart = startOfDay(day).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;

  const overlapStart = Math.max(inTs, dayStart);
  const overlapEnd = Math.min(outTs, dayEnd);

  if (overlapEnd <= overlapStart) return 0;
  return Math.floor((overlapEnd - overlapStart) / 60000);
}
function decimalHoursToHHMM(hours: number): string {
  if (!hours || hours <= 0) return "00:00";

  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;

  return `${h.toString().padStart(2, "0")}:${m
    .toString()
    .padStart(2, "0")}`;
}
export function EmployeeView({
  employee,
  onLogout,
  settings,
  recordEntry,
  requestLocation,
  coord,
  entries,
  schedules,
  updateSchedule,
  isManagerPreview = false,
  isGettingLocation = false,
  isClockedIn,
  updateEmployee,
  payrollPeriods,
  confirmPayroll,
  payrollConfirmations = [],
  getSiteStatuses,
  onRequestUpdate,
    teams = [], // ✅ default safe fallback
}: EmployeeViewProps) {
  const { toast } = useToast();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(startOfDay(new Date()));
const [dailySearch, setDailySearch] = useState("");

const [statusFilter, setStatusFilter] = useState<
  "all" | "complete" | "in-process" | "incomplete"
>("all");
const [openNotifications, setOpenNotifications] = useState(false);
const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
type HeaderEmployeeNotification = {
  id: string;
  employeeId: string;
  type: "schedule-change" | "payroll-confirmation" | "payment"  | "manager-message";
  title: string;
  message: string;
  createdAt?: unknown;
  read: boolean;
};

const [headerNotifications, setHeaderNotifications] = useState<
  HeaderEmployeeNotification[]
>([]);
const prevUnreadRef = React.useRef(0);
useEffect(() => {
  setDailySearch("");
  setStatusFilter("all");
}, [currentDate]);
const [liveNow, setLiveNow] = useState(Date.now());

useEffect(() => {
  const id = window.setInterval(() => {
    setLiveNow(Date.now());
  }, 1000);

  return () => window.clearInterval(id);
}, []);

const companyId =
  settings.companyId?.trim() ||
  process.env.NEXT_PUBLIC_COMPANY_ID ||
  "amazing-grace-cleaners";

const vibrateNotification = () => {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;

  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch (error) {
    console.warn("Employee vibration failed:", error);
  }
};

useEffect(() => {
  if (!employee?.id) {
    setUnreadNotificationCount(0);
    setHeaderNotifications([]);
    prevUnreadRef.current = 0;
    return;
  }

  const q = query(
    collection(db, "companies", companyId, "employee_notifications"),
    where("employeeId", "==", employee.id),
    orderBy("createdAt", "desc")
  );

  const unsub = onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as HeaderEmployeeNotification[];

      setHeaderNotifications(items);

      const unread = items.filter((n) => !n.read).length;
      setUnreadNotificationCount(unread);

      // 🔥 vibration trigger
      if (unread > prevUnreadRef.current) {
        vibrateNotification();
      }
      prevUnreadRef.current = unread;
    },
    (err) => {
      console.error("Notifications failed:", err);
      setUnreadNotificationCount(0);
      setHeaderNotifications([]);
      prevUnreadRef.current = 0;
    }
  );

  return () => unsub();
}, [employee?.id, companyId]);

useEffect(() => {
  if (!companyId || !employee?.id) return;

  const q = query(
    collection(db, "companies", companyId, "messages"),
    where("employeeId", "==", employee.id)
  );

  return onSnapshot(q, (snap) => {
    const items = snap.docs
      .map((d) => ({
        id: d.id,
        ...d.data(),
      }))
      .sort((a: any, b: any) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return aTime - bTime;
      });

    setEmployeeMessages(items);
  });
}, [companyId, employee?.id]);

const markHeaderNotificationRead = useCallback(
  async (id: string) => {
    const batch = writeBatch(db);

    batch.update(
      doc(db, "companies", companyId, "employee_notifications", id),
      {
        read: true,
        readAt: new Date().toISOString(),
      }
    );

    await batch.commit();
  },
  [companyId]
);

const markAllHeaderNotificationsRead = useCallback(async () => {
  const unread = headerNotifications.filter((n) => !n.read);
  if (!unread.length) return;

  const batch = writeBatch(db);

  unread.forEach((n) => {
    batch.update(
      doc(db, "companies", companyId, "employee_notifications", n.id),
      {
        read: true,
        readAt: new Date().toISOString(),
      }
    );
  });

  await batch.commit();
}, [companyId, headerNotifications]);
  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [editingNoteForSchedule, setEditingNoteForSchedule] = useState<CleaningSchedule | null>(null);
  const [currentNote, setCurrentNote] = useState("");

  const [isTimesheetDialogOpen, setIsTimesheetDialogOpen] = useState(false);
  const [timesheetData, setTimesheetData] = useState<{
    period?: PayrollPeriod;
    sessions: Session[];
  }>({ sessions: [] });
const [employeeNoteOpen, setEmployeeNoteOpen] = useState(false);
const [employeeNoteText, setEmployeeNoteText] = useState("");
const [employeeNoteSite, setEmployeeNoteSite] = useState<string>("");
const [employeeMessages, setEmployeeMessages] = useState<any[]>([]);
const [employeeReplyText, setEmployeeReplyText] = useState("");
const [employeeReplyFile, setEmployeeReplyFile] = useState<File | null>(null);
const [employeeNoteFile, setEmployeeNoteFile] = useState<File | null>(null);
  const asNoteText = (n: unknown): string => (typeof n === "string" ? n : "");

  const userEntries = useMemo(() => {
    return entries
      .filter((e) => e.employeeId === employee.id)
      .slice()
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 20);
  }, [entries, employee.id]);

  /**
   * ✅ IMPORTANT: sort before groupSessions
   * Firestore/local updates can arrive out-of-order.
   */
  const orderedEmployeeEntries = useMemo(() => {
    return entries
      .filter((e) => e.employeeId === employee.id)
      .slice()
      .sort((a, b) => a.ts - b.ts);
  }, [entries, employee.id]);

  const sessionsForEmployee = useMemo(() => {
    return groupSessions(orderedEmployeeEntries);
  }, [orderedEmployeeEntries]);

  const today = new Date();
  const isCurrentDayToday = isToday(currentDate);

  const scheduleForDay = (date: Date) => {
    return schedules.filter((s) => {
      if (!s.startDate) return false;

     const isAssignedDirect =
  (s.assignedEmployeeIds?.length
    ? s.assignedEmployeeIds.includes(employee.id)
    : (s.assignedTo ?? []).includes(employee.name));

const employeeTeamId =
  (employee as any).teamId as string | undefined;

const isAssignedViaTeam =
  !!s.assignedTeamId &&
  !!employeeTeamId &&
  s.assignedTeamId === employeeTeamId;
const dateStr = format(date, "yyyy-MM-dd");

const viewingPast =
  startOfDay(date) < startOfToday();

const isAssigned =
  isAssignedDirect || isAssignedViaTeam;

/*
 * True when this employee has a saved clock-in or clock-out
 * for this exact schedule occurrence.
 */
const workedThisOccurrence = entries.some((entry) => {
  if (entry.employeeId !== employee.id) {
    return false;
  }

  /*
   * Newer entries contain scheduleId and scheduleDate.
   */
  if (entry.scheduleId && entry.scheduleDate) {
    return (
      entry.scheduleId === s.id &&
      entry.scheduleDate === dateStr
    );
  }

  /*
   * Older entries may not contain scheduleId.
   * Use the site and entry date as a fallback.
   */
  return (
    entry.site === s.siteName &&
    format(new Date(entry.ts), "yyyy-MM-dd") === dateStr
  );
});

/*
 * Today and future:
 * show only when currently assigned.
 *
 * Past:
 * show when assigned to the historical schedule
 * or when the employee has saved clock entries.
 */
if (!isAssigned && !(viewingPast && workedThisOccurrence)) {
  return false;
}

const schStart = parseISO(s.startDate);
if (s.exceptionDates?.includes(dateStr)) return false;
      if (date < startOfDay(schStart)) return false;

      if (s.repeatUntil && date > endOfDay(parseISO(s.repeatUntil))) return false;

      const monthDiff = (getYear(date) - getYear(schStart)) * 12 + (getMonth(date) - getMonth(schStart));

      switch (s.repeatFrequency) {
        case "does-not-repeat":
          return isSameDay(date, schStart);

        case "weekly":
        case "every-2-weeks":
        case "every-3-weeks": {
          const dayName = format(date, "EEEE") as any;
          if (!s.daysOfWeek?.includes(dayName)) return false;

          const weekDiff = differenceInCalendarWeeks(date, schStart, {
            weekStartsOn: settings.weekStartsOn,
          });

          if (weekDiff < 0) return false;
          if (s.repeatFrequency === "weekly") return true;
          if (s.repeatFrequency === "every-2-weeks" && weekDiff % 2 === 0) return true;
          if (s.repeatFrequency === "every-3-weeks" && weekDiff % 3 === 0) return true;
          return false;
        }

        case "monthly":
          return getDate(date) === getDate(schStart) && monthDiff >= 0;

        case "every-2-months":
          return getDate(date) === getDate(schStart) && monthDiff >= 0 && monthDiff % 2 === 0;

        case "quarterly":
          return getDate(date) === getDate(schStart) && monthDiff >= 0 && monthDiff % 3 === 0;

        case "yearly":
          return getDate(date) === getDate(schStart) && getMonth(date) === getMonth(schStart) && monthDiff >= 0;

        default:
          return false;
      }
    });
  };
    const currentSiteStatuses = useMemo(() => getSiteStatuses(currentDate), [getSiteStatuses, currentDate]);

const dailySchedules = useMemo(() => {
  return scheduleForDay(currentDate);
}, [currentDate, schedules, employee.id, settings.weekStartsOn]);

const filteredDailySchedules = useMemo(() => {
  const q = dailySearch.trim().toLowerCase();

  return dailySchedules.filter((s) => {
    const matchesSearch =
      !q ||
      s.siteName.toLowerCase().includes(q) ||
      s.tasks.toLowerCase().includes(q) ||
      (s.note ?? "").toLowerCase().includes(q);

    const status = currentSiteStatuses.get(s.siteName);
    const matchesStatus =
      statusFilter === "all" ? true : status === statusFilter;

    return matchesSearch && matchesStatus;
  });
}, [dailySchedules, dailySearch, statusFilter, currentSiteStatuses]);

const routedDailySchedules = useMemo(() => {
  if (!settings.enableRouteOptimization) {
    return filteredDailySchedules;
  }

  const incompleteSchedules = filteredDailySchedules.filter((schedule) => {
    const status = currentSiteStatuses.get(schedule.siteName);
    return status !== "complete";
  });

  const completedSchedules = filteredDailySchedules.filter((schedule) => {
    const status = currentSiteStatuses.get(schedule.siteName);
    return status === "complete";
  });

  const scheduleWithSites = incompleteSchedules.map((schedule) => {
    const site = settings.sites.find((s) => s.name === schedule.siteName);

    return {
      schedule,
      site,
      lat: site?.lat,
      lng: site?.lng,
    };
  });

  const optimizedIncomplete = optimizeRouteFromStart(
    scheduleWithSites,
    coord
  ).map((x) => x.schedule);

  return [...optimizedIncomplete, ...completedSchedules];
}, [
  filteredDailySchedules,
  currentSiteStatuses,
  settings.enableRouteOptimization,
  settings.sites,
  coord,
]);

  // Off-schedule active shifts (for today only)
  const offScheduleActiveShifts = useMemo(() => {
    if (!isSameDay(currentDate, new Date())) return [];

    const scheduledSiteNames = new Set(scheduleForDay(currentDate).map((s) => s.siteName));

    return sessionsForEmployee.filter((s) => s.active && s.in?.site && !scheduledSiteNames.has(s.in.site));
  }, [schedules, employee.id, today, settings.weekStartsOn]);

  const weeklySchedule = useMemo(() => {
    const startOfUserWeek = startOfWeek(today, { weekStartsOn: settings.weekStartsOn });
    const week: Array<{ date: Date; schedules: CleaningSchedule[] }> = [];

    for (let i = 0; i < 7; i++) {
      const day = add(startOfUserWeek, { days: i });
      week.push({ date: day, schedules: scheduleForDay(day) });
    }
    return week;
  }, [schedules, employee.id, today, settings.weekStartsOn]);

  const handleOpenNoteDialog = (schedule: CleaningSchedule) => {
    setEditingNoteForSchedule(schedule);
    setCurrentNote(schedule.note || "");
    setIsNoteDialogOpen(true);
  };

  const handleSaveNote = useCallback(() => {
    if (!editingNoteForSchedule) return;

    updateSchedule(editingNoteForSchedule.id, { note: currentNote });

    setIsNoteDialogOpen(false);
    setEditingNoteForSchedule(null);
  }, [editingNoteForSchedule, currentNote, updateSchedule]);

  /**
   * ✅ FIX: Detect open shift for a site on a day by OVERLAP, not by "clock-in day"
   */
  const hasOpenShiftForSiteOnDate = useCallback(
  (siteName: string, forDate: Date) => {
    const dayStart = startOfDay(forDate).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    return sessionsForEmployee.some((s) => {
      if (!s.active || !s.in) return false;
      if ((s.in.site || "") !== siteName) return false;

      const start = s.in.ts;
      const rawEnd = s.out?.ts ?? Math.max(Date.now(), start);
      const end = Math.min(rawEnd, dayEnd);

      return end > dayStart && start < dayEnd;
    });
  },
  [sessionsForEmployee]
);
const getActiveShiftForSiteOnDate = useCallback(
  (siteName: string, forDate: Date) => {
    const dayStart = startOfDay(forDate).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    return sessionsForEmployee.find((s) => {
      if (!s.active || !s.in) return false;
      if ((s.in.site || "") !== siteName) return false;

      const start = s.in.ts;
      const rawEnd = s.out?.ts ?? Math.max(Date.now(), start);
      const end = Math.min(rawEnd, dayEnd);

      return end > dayStart && start < dayEnd;
    });
  },
  [sessionsForEmployee]
);

const getActiveShiftForScheduleOccurrence = useCallback(
  (scheduleId: string, scheduleDate: string) => {
    return sessionsForEmployee.find((s) => {
      if (!s.active || !s.in) return false;

      return (
        (s.in as any).scheduleId === scheduleId &&
        (s.in as any).scheduleDate === scheduleDate
      );
    });
  },
  [sessionsForEmployee]
);

const getLiveHoursForOpenShift = useCallback(
  (siteName: string, forDate: Date) => {
    const activeShift = getActiveShiftForSiteOnDate(siteName, forDate);
    if (!activeShift?.in) return null;

    const dayStart = startOfDay(forDate).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;

    const start = Math.max(activeShift.in.ts, dayStart);
    const end = Math.min(liveNow, dayEnd);

    if (end <= start) return "00:00";

    const minutes = Math.floor((end - start) / 60000);
    return minutesToHHMM(minutes);
  },
  [getActiveShiftForSiteOnDate, liveNow]
);
 const handleClockInOut = useCallback(
  (
    action: "in" | "out",
    siteName: string,
    scheduleId?: string
  ) => {
    const site = settings.sites.find((s) => s.name === siteName);
    if (!site) {
      toast({ variant: "destructive", title: "Site not found." });
      return;
    }

    const selectedDay = startOfDay(currentDate);
    const today = startOfToday();

    const isPastDay = isBefore(selectedDay, today);
    const isFutureDay = isBefore(today, selectedDay);
    const isDateOverride = !!isManagerPreview;

    if (action === "in") {
      const activeSomewhere = isClockedIn(undefined, employee.id);
      const activeHere = isClockedIn(siteName, employee.id);

      if (!isManagerPreview && activeSomewhere && !activeHere) {
        toast({
          variant: "destructive",
          title: "You are already clocked in.",
          description:
            "Please clock out from your current job before starting another.",
        });
        return;
      }

      recordEntry(
  "in",
  site,
  currentDate,
  scheduleId,
  format(currentDate, "yyyy-MM-dd"),
  undefined,
  employee.id,
  isDateOverride,
  {
    source: "employee-clock",
    initiatedBy: employee.id,
  }
);
      return;
    }

    const confirmed = window.confirm(
  `Are you sure you want to clock out from ${siteName}?`
);

if (!confirmed) return;

recordEntry(
  "out",
  site,
  currentDate,
  scheduleId,
  format(currentDate, "yyyy-MM-dd"),
  undefined,
  employee.id,
  isDateOverride,
  {
    source: "employee-clock",
    initiatedBy: employee.id,
  }
);
  },
  [
    settings.sites,

    isClockedIn,
    employee.id,
    currentDate,
    recordEntry,
    toast,
    isManagerPreview,
  ]
);

  const calculateHoursForPeriod = useCallback(
    (startDate: Date, endDate: Date) => {
      const from = startDate.getTime();
      const to = endDate.getTime();

      let totalMinutes = 0;

      for (const s of sessionsForEmployee) {
        if (!s.in) continue;

        const sessionStart = s.in.ts;
        const sessionEnd = s.out?.ts ?? Date.now();

        const overlapStart = Math.max(sessionStart, from);
        const overlapEnd = Math.min(sessionEnd, to);

        if (overlapEnd > overlapStart) {
          totalMinutes += (overlapEnd - overlapStart) / 60000;
        }
      }

      return totalMinutes / 60;
    },
    [sessionsForEmployee]
  );

  const activeShiftsCount = useMemo(() => {
    const activeSites = new Set<string>();
    for (const s of settings.sites) {
      if (isClockedIn(s.name, employee.id)) activeSites.add(s.name.toLowerCase());
    }
    return activeSites.size;
  }, [settings.sites, employee.id, isClockedIn]);

  const totalHoursToday = useMemo(() => {
    const start = startOfDay(currentDate);
    const end = endOfDay(currentDate);
    return calculateHoursForPeriod(start, end);
  }, [calculateHoursForPeriod, currentDate]);

  const totalHoursThisWeek = useMemo(() => {
    const start = startOfWeek(currentDate, { weekStartsOn: settings.weekStartsOn });
    const end = endOfWeek(currentDate, { weekStartsOn: settings.weekStartsOn });
    return calculateHoursForPeriod(start, end);
  }, [calculateHoursForPeriod, currentDate, settings.weekStartsOn]);

  const totalHoursThisMonth = useMemo(() => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    return calculateHoursForPeriod(start, end);
  }, [calculateHoursForPeriod, currentDate]);

  const changeDay = (amount: number) => {
    setCurrentDate((prev) => add(prev, { days: amount }));
  };
const totalHoursTodayHHMM = useMemo(
  () => decimalHoursToHHMM(totalHoursToday),
  [totalHoursToday]
);

const totalHoursThisWeekHHMM = useMemo(
  () => decimalHoursToHHMM(totalHoursThisWeek),
  [totalHoursThisWeek]
);

const totalHoursThisMonthHHMM = useMemo(
  () => decimalHoursToHHMM(totalHoursThisMonth),
  [totalHoursThisMonth]
);

// ✅ Daily Site Summary for Employee
const dailySiteSummary = useMemo(() => {
  const schedulesToday = scheduleForDay(currentDate);
  const statuses = getSiteStatuses(currentDate);

  let total = schedulesToday.length;
  let complete = 0;
  let inProcess = 0;
  let incomplete = 0;

  for (const s of schedulesToday) {
    const status = statuses.get(s.siteName);

    if (status === "complete") complete++;
    else if (status === "in-process") inProcess++;
    else incomplete++;
  }

  return { total, complete, inProcess, incomplete };
}, [currentDate, schedules, employee.id, getSiteStatuses]);

  /**
 * ✅ Anchor cross-midnight sessions to the CLOCK-IN day.
 * If a session starts on `forDate`, count the FULL duration (even after midnight).
 */

const getHoursForSiteDay = useCallback(
  (siteName: string, forDate: Date) => {
    const dayStart = startOfDay(forDate).getTime();

    const siteEntries = entries
      .filter((e) => e.employeeId === employee.id && e.site === siteName)
      .slice()
      .sort((a, b) => a.ts - b.ts);

    const siteSessions = groupSessions(siteEntries);

    let totalMinutes = 0;

    for (const s of siteSessions) {
      if (!s.in || !s.out) continue; // only closed sessions

      // ✅ Only count sessions that START on this day (clock-in day)
      const inDayStart = startOfDay(new Date(s.in.ts)).getTime();
      if (inDayStart !== dayStart) continue;

      const sessionMinutes = Math.max(
        0,
        Math.round((s.out.ts - s.in.ts) / 60000)
      );

      totalMinutes += sessionMinutes;
    }

    return minutesToHHMM(totalMinutes);
  },
  [entries, employee.id]
);


const dailyWorkedMinutes = useMemo(() => {
  const selectedDayStart =
    startOfDay(currentDate).getTime();

  let totalMinutes = 0;

  for (const session of sessionsForEmployee) {
    if (!session.in || !session.out) {
      continue;
    }

    /*
     * Hours are attached to the day the employee clocked in.
     */
    const clockInDayStart =
      startOfDay(new Date(session.in.ts)).getTime();

    if (clockInDayStart !== selectedDayStart) {
      continue;
    }

    totalMinutes += Math.max(
      0,
      Math.round(
        (session.out.ts - session.in.ts) / 60000
      )
    );
  }

  return totalMinutes;
}, [
  sessionsForEmployee,
  currentDate,
]);

const dailyWorkedHHMM = useMemo(() => {
  return minutesToHHMM(dailyWorkedMinutes);
}, [dailyWorkedMinutes]);

  const handleViewTimesheet = (periodId: string, employeeId: string) => {
    const period = payrollPeriods.find((p) => p.id === periodId);
    if (!period || employee.id !== employeeId) return;

    const fromTime = parseISO(period.startDate).getTime();
    const toTime = endOfDay(parseISO(period.endDate)).getTime();

    const periodEntries = entries.filter((e) => e.employeeId === employee.id && e.ts >= fromTime && e.ts <= toTime);

    // ✅ Also sort before grouping (same reasoning)
    const sessions = groupSessions(periodEntries.slice().sort((a, b) => a.ts - b.ts));

    setTimesheetData({ period, sessions });
    setIsTimesheetDialogOpen(true);
  };
const sendEmployeeNoteToManager = async () => {
  if (!employeeNoteText.trim() || !employeeNoteSite) return;
const attachment = employeeNoteFile
  ? await uploadMessageAttachment({
      companyId,
      employeeId: employee.id,
      file: employeeNoteFile,
    })
  : {};
  const payload = {
    type: "employee-note",
    employeeId: employee.id,
    employeeName: employee.name,
    site: employeeNoteSite,
    conversationKey: `${employee.id}_${employeeNoteSite || "general"}`,
    message: employeeNoteText.trim(),

    sender: "employee",

    readByManager: false,
    readByEmployee: true,

    date: format(currentDate, "yyyy-MM-dd"),
    createdAt: serverTimestamp(),
    ...attachment,
  };

  // ✅ Main chat/messages system
  await addDoc(
    collection(db, "companies", companyId, "messages"),
    payload
  );

  // ✅ Dashboard notification copy
  await addDoc(
    collection(db, "companies", companyId, "notifications"),
    {
      ...payload,
      read: false,
    }
  );

  toast({
    title: "Note sent",
    description: "Your note was sent to the manager.",
  });

  setEmployeeNoteText("");
  setEmployeeNoteFile(null);
  setEmployeeNoteSite("");
  setEmployeeNoteOpen(false);
};

const sendEmployeeReply = async () => {
  if (!employeeReplyText.trim()) return;
const attachment = employeeReplyFile
  ? await uploadMessageAttachment({
      companyId,
      employeeId: employee.id,
      file: employeeReplyFile,
    })
  : {};
  await addDoc(collection(db, "companies", companyId, "messages"), {
    type: "employee-note",
    employeeId: employee.id,
    employeeName: employee.name,
    site: "",
    conversationKey: `${employee.id}_general`,
    message: employeeReplyText.trim(),
    sender: "employee",
    readByManager: false,
    readByEmployee: true,
    createdAt: serverTimestamp(),
    ...attachment,
  });

  await addDoc(collection(db, "companies", companyId, "notifications"), {
    type: "employee-note",
    employeeId: employee.id,
    employeeName: employee.name,
    site: "",
    conversationKey: `${employee.id}_general`,
    message: employeeReplyText.trim(),
    sender: "employee",
    readByManager: false,
    readByEmployee: true,
    read: false,
    createdAt: serverTimestamp(),
    ...attachment,
  });

  setEmployeeReplyText("");
setEmployeeReplyFile(null);
  toast({
    title: "Reply sent",
    description: "Your reply was sent to the manager.",
  });
};
const employeeUnreadMessages = employeeMessages.filter(
  (m) => m.sender === "manager" && !m.readByEmployee
).length;

const getTravelEstimateText = useCallback(
  (site?: Site | null) => {
    if (!settings.enableTravelDurations) return null;

    if (!coord || !site?.lat || !site?.lng) {
      return null;
    }

    const miles = haversineMiles(
      coord.lat,
      coord.lng,
      site.lat,
      site.lng
    );

    const minutes = estimateDriveMinutes(miles);

    return `~${minutes} min drive • ${miles.toFixed(1)} mi`;
  },
  [coord, settings.enableTravelDurations]
);

 return (
  <>
    <Card className="mb-6">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>Welcome, {employee.name}</CardTitle>

          {!isManagerPreview && (
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsProfileOpen(true)}
              >
                <User className="mr-2 h-4 w-4" />
                My Profile
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="relative">
                    <Bell className="mr-2 h-4 w-4" />
                    Notifications

                    {unreadNotificationCount > 0 && (
                      <span className="ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        {unreadNotificationCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-96">
                
                    <div className="px-3 py-2 border-b flex justify-between items-center">
  <span className="font-semibold text-sm">Notifications</span>

  {unreadNotificationCount > 0 && (
    <Button
      variant="ghost"
      size="sm"
      onClick={markAllHeaderNotificationsRead}
    >
      Mark all as read
    </Button>
  )}
</div>
                  

                  <DropdownMenuSeparator />

                  {headerNotifications.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground">
                      No notifications
                    </div>
                  ) : (
                    <>
                      {headerNotifications.slice(0, 3).map((n) => (
                        <DropdownMenuItem
                          key={n.id}
                          onClick={() => {
                            if (!n.read) void markHeaderNotificationRead(n.id);
                          }}
                          className="flex flex-col items-start gap-1 cursor-pointer hover:bg-muted"
                        >
                          <div className="flex justify-between w-full">
                            <span className="font-medium">{n.title}</span>
                            {!n.read && (
                              <Badge
                                variant="destructive"
                                className="text-[10px]"
                              >
                                New
                              </Badge>
                            )}
                          </div>

                          <span className="text-xs text-muted-foreground line-clamp-2">
                            {n.message}
                          </span>
                        </DropdownMenuItem>
                      ))}

                      <DropdownMenuSeparator />

                      <Button
                        variant="ghost"
                        className="w-full"
                        onClick={() => setOpenNotifications(true)}
                      >
                        View all notifications
                      </Button>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Dialog
                open={openNotifications}
                onOpenChange={setOpenNotifications}
              >
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Notifications</DialogTitle>
                    <DialogDescription>
                      Schedule updates, payroll confirmations, and payments
                    </DialogDescription>
                  </DialogHeader>

                  <EmployeeNotifications
                    employee={employee}
                    companyId={companyId}
                  />
                </DialogContent>
              </Dialog>

              <Button variant="ghost" size="sm" onClick={onLogout}>
                <Power className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>
          )}
        </div>
         
          <CardDescription>
            Your base pay rate is ${employee.payRate.toFixed(2)}/hour.
            {activeShiftsCount > 0 ? (
              <Badge variant="default" className="bg-green-600 ml-2">
                Clocked IN ({activeShiftsCount} {activeShiftsCount > 1 ? "sites" : "site"})
              </Badge>
            ) : (
              <Badge variant="secondary" className="ml-2">
                Clocked OUT
              </Badge>
            )}
            {isManagerPreview && (
              <Badge variant="destructive" className="ml-2">
                Read-only Preview
              </Badge>
            )}
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs
  defaultValue="schedule"
  className="w-full"
  onValueChange={async (value) => {
    if (value !== "messages") return;

    const unread = employeeMessages.filter(
      (m) => m.sender === "manager" && !m.readByEmployee
    );

    for (const m of unread) {
      await updateDoc(doc(db, "companies", companyId, "messages", m.id), {
        readByEmployee: true,
      });
    }
  }}
>
  

  {/* 🔥 Sticky Tabs Bar */}
  <div className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b">
    <div className="w-full overflow-x-auto">
      <TabsList className="flex w-max min-w-full gap-1">
        <TabsTrigger value="schedule">Schedule & Actions</TabsTrigger>
        <TabsTrigger value="messages" className="relative">
  Messages
  {employeeUnreadMessages > 0 && (
    <span className="ml-2 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">
      {employeeUnreadMessages}
    </span>
  )}
</TabsTrigger>
        <TabsTrigger value="activity">Recent Activity</TabsTrigger>
        <TabsTrigger value="payroll">Payroll</TabsTrigger>
      </TabsList>
    </div>
  </div>

        {/* SCHEDULE TAB */}
        <TabsContent value="schedule" className="mt-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Hours Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Your Hours Worked</CardTitle>
                <CardDescription>Based on your completed shifts.</CardDescription>
              </CardHeader>
             <CardContent className="p-3 sm:p-4">
                <Tabs defaultValue="week">
                  <div className="w-full overflow-x-auto">
  <TabsList className="flex w-max min-w-full gap-1">
                    <TabsTrigger value="today">Today</TabsTrigger>
                    <TabsTrigger value="week">This Week</TabsTrigger>
                    <TabsTrigger value="month">This Month</TabsTrigger>
                  </TabsList>
</div>
                  <TabsContent value="today" className="pt-4">
                    <div className="text-center">
                     <p className="text-3xl font-bold">{totalHoursTodayHHMM}</p>
<p className="text-sm text-muted-foreground">hours today</p>
                    </div>
                  </TabsContent>
                  <TabsContent value="week" className="pt-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{totalHoursThisWeekHHMM}</p>
<p className="text-sm text-muted-foreground">hours this week</p>
                    </div>
                  </TabsContent>
                  <TabsContent value="month" className="pt-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{totalHoursThisMonthHHMM}</p>
<p className="text-sm text-muted-foreground">hours this month</p>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>

            {/* Schedule */}
            {employee.name && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Schedule</CardTitle>
                  <CardDescription>Tasks assigned to you.</CardDescription>
                </CardHeader>
               <CardContent className="p-3 sm:p-4">
                  <Tabs defaultValue="daily">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="daily">Daily</TabsTrigger>
                      <TabsTrigger value="weekly">Weekly</TabsTrigger>
                    </TabsList>

                    {/* DAILY VIEW */}
                    <TabsContent value="daily">
                      <div className="flex justify-between items-center my-2 flex-wrap gap-2">
  <div className="flex items-center gap-2 flex-wrap">
    <h3 className="font-semibold">
      {formatDateHeader(currentDate)}
    </h3>

    <Badge variant="outline">
      Total Hours: {dailyWorkedHHMM}
    </Badge>
  </div>
                        <div className="flex gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeDay(-1)}>
                            <ChevronLeft />
                          </Button>
                          <Button
  variant={isSameDay(currentDate, startOfDay(new Date())) ? "default" : "outline"}
  className="h-7 min-w-[110px]"
  onClick={() => setCurrentDate(startOfDay(new Date()))}
  title="Jump back to today"
>
  {formatDateHeader(currentDate)}
</Button>
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeDay(1)}>
                            <ChevronRight />
                          </Button>
                        </div>
                      </div>
{/* ✅ Daily Site Summary */}
<div className="flex flex-wrap gap-3 mb-3">
  <Badge variant="outline">
    Total: {dailySiteSummary.total}
  </Badge>

  <Badge className="bg-green-600 text-white">
    Complete: {dailySiteSummary.complete}
  </Badge>

  <Badge className="bg-yellow-500 text-white">
    In Process: {dailySiteSummary.inProcess}
  </Badge>

  <Badge className="bg-red-500 text-white">
    Incomplete: {dailySiteSummary.incomplete}
  </Badge>
</div>
 <div className="mb-3 flex flex-col sm:flex-row gap-2 sm:items-center">

  {/* 🔍 Search */}
  <div className="relative flex-1 min-w-[220px]">
    <Input
      placeholder="Search site or task..."
      value={dailySearch}
      onChange={(e) => setDailySearch(e.target.value)}
      className="pr-8"
    />

    {dailySearch && (
      <button
        onClick={() => setDailySearch("")}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
      >
        ✕
      </button>
    )}
  </div>

  {/* 🎯 Status Filter */}
  <Select
    value={statusFilter}
    onValueChange={(v: "all" | "complete" | "in-process" | "incomplete") =>
      setStatusFilter(v)
    }
  >
    <SelectTrigger className="w-[180px]">
      <SelectValue placeholder="Filter by status" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">All statuses</SelectItem>
      <SelectItem value="complete">Complete</SelectItem>
      <SelectItem value="in-process">In Progress</SelectItem>
      <SelectItem value="incomplete">Incomplete</SelectItem>
    </SelectContent>
  </Select>

</div>

{settings.enableRouteOptimization &&
  routedDailySchedules.length > 1 && (
    <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
      Suggested route order is enabled for today.
      Employees may still follow manager instructions if needed.
    </div>
)}
                      <ScrollArea className="h-[60vh]">
  {filteredDailySchedules.length > 0 ? (
    <ul className="space-y-4">
      {routedDailySchedules.map((schedule, index) => {
  const scheduleSite = settings.sites.find((s) => s.name === schedule.siteName);

 

const scheduleDateKey = format(currentDate, "yyyy-MM-dd");

const activeShiftForThisSchedule =
  getActiveShiftForScheduleOccurrence(
    schedule.id,
    scheduleDateKey
  );

const clockedInAtThisSite = !!activeShiftForThisSchedule;
  const status = currentSiteStatuses.get(schedule.siteName);
  const employeeCompletedThisSchedule = entries.some((e) => {
  if (e.employeeId !== employee.id) return false;
  if (e.action !== "out") return false;

  return (
    e.scheduleId === schedule.id &&
    e.scheduleDate === scheduleDateKey
  );
});

const scheduleCompletedByAnyone = entries.some((e) => {
  if (e.action !== "out") return false;

  return (
    e.scheduleId === schedule.id &&
    e.scheduleDate === scheduleDateKey
  );
});

const clockInDisabled =
  employeeCompletedThisSchedule ||
  scheduleCompletedByAnyone;

  const hoursForThisSiteDay = getHoursForSiteDay(
  schedule.siteName,
  currentDate
);

const hoursSpent =
  employeeCompletedThisSchedule || hoursForThisSiteDay !== "00:00"
    ? hoursForThisSiteDay
    : undefined;

  return (
    <li
      key={schedule.id}
      className={cn(
        "p-3 rounded-md border bg-muted/20 transition-all",
        clockedInAtThisSite && "ring-2 ring-green-500 bg-green-50/40 dark:bg-green-950/20"
      )}
      style={{
        borderLeftColor: scheduleSite?.color,
        borderLeftWidth: "4px",
      }}
    >
      <div className="flex justify-between items-start gap-3">
        <div>
                    
          <div className="flex items-center gap-2 flex-wrap">
  {settings.enableRouteOptimization &&
    routedDailySchedules.length > 1 && (
      <Badge variant="secondary">
        Stop {index + 1}
      </Badge>
    )}

  <p
    className="font-semibold"
    style={{ color: scheduleSite?.color }}
  >
    {schedule.siteName}
  </p>
</div>
  

          {getTravelEstimateText(scheduleSite) && (
  <p className="text-xs text-muted-foreground">
    {getTravelEstimateText(scheduleSite)}
  </p>
)}

        </div>

        {getStatusIndicator(status, hoursSpent)}
      </div>

      <p className="text-sm text-muted-foreground my-1">
        {schedule.tasks}
      </p>
{asNoteText(schedule.note) && (
  <div className="mt-2 rounded-md border-l-4 border-amber-500 bg-amber-50 p-2 text-sm text-amber-900">
    <span className="font-semibold">Manager note: </span>
    {asNoteText(schedule.note)}
  </div>
)}
      <div className="flex gap-2 mt-2 flex-wrap">
        {clockedInAtThisSite ? (
          <Button
            size="sm"
            variant="destructive"
            onClick={() =>
  handleClockInOut(
    "out",
    schedule.siteName,
    schedule.id
  )
}
            disabled={isManagerPreview}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Clock Out
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() =>
  handleClockInOut(
    "in",
    schedule.siteName,
    schedule.id
  )
}
            disabled={isManagerPreview || clockInDisabled}
          >
            <LogIn className="mr-2 h-4 w-4" />
            Clock In
          </Button>
        )}
        <Button
  size="sm"
  variant="outline"
  onClick={() => {
    setEmployeeNoteSite(schedule.siteName);
    setEmployeeNoteOpen(true);
  }}
>
  <MessageSquare className="mr-2 h-4 w-4" />
  Note to Manager
</Button>

{settings.enableNavigationLinks !== false && scheduleSite && (
  <Button
    size="sm"
    variant="outline"
    asChild
  >
    <a
      href={getGoogleMapsUrl(scheduleSite)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Navigation className="mr-2 h-4 w-4" />
      Navigate
    </a>
  </Button>
)}
      </div>
    </li>
  );
})}
    </ul>
  ) : (
    <div className="flex items-center justify-center h-24 text-muted-foreground">
      {dailySchedules.length === 0
        ? "You have no scheduled tasks for this day."
        : "No schedules match your search or filter."}
    </div>
  )}
</ScrollArea>
                    </TabsContent>

                    {/* WEEKLY VIEW */}
                    <TabsContent value="weekly">
                      <ScrollArea className="h-[50vh]">
                        <ul className="space-y-4">
                          {weeklySchedule.map((day) => (
                            <li key={day.date.toISOString()}>
                              <h3 className="font-semibold text-sm mb-1">{format(day.date, "eeee, MMM d")}</h3>
                              {day.schedules.length > 0 ? (
                                <div className="pl-4 border-l-2 border-primary/50 space-y-2">
                                  {day.schedules.map((schedule) => {
                                    const scheduleSite = settings.sites.find((s) => s.name === schedule.siteName);
                                    return (
                                      <div
                                        key={schedule.id}
                                        className="text-xs p-2 rounded-md bg-muted/30"
                                        style={{
                                          borderLeftColor: scheduleSite?.color,
                                          borderLeftWidth: "2px",
                                        }}
                                      >
                                        <p className="font-semibold" style={{ color: scheduleSite?.color }}>
            {schedule.siteName}
          </p>
                                        <p className="text-muted-foreground">{schedule.tasks}</p>
                                        {asNoteText(schedule.note) && (
                                          <p className="text-xs italic text-amber-700 truncate">
                                            <MessageSquare className="inline h-3 w-3 mr-1" />
                                            {asNoteText(schedule.note)}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p className="pl-4 text-xs text-muted-foreground">No tasks scheduled.</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Message Tab */}
        <TabsContent value="messages" className="mt-4">
  <Card>
    <CardHeader>
      <CardTitle>Messages</CardTitle>
    </CardHeader>

    <CardContent>
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {employeeMessages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No messages yet.
          </p>
        ) : (
          employeeMessages.map((m) => (
            <div
              key={m.id}
              className={`rounded-lg p-3 max-w-[85%] ${
                m.sender === "manager"
                  ? "bg-primary text-primary-foreground ml-auto"
                  : "bg-muted"
              }`}
            >
              <p className="text-sm">{m.message}</p>
              {m.attachmentUrl && (
  <>
    {m.attachmentType?.startsWith("image/") ? (
      <img
        src={m.attachmentUrl}
        alt={m.attachmentName || "attachment"}
        className="mt-2 max-h-60 rounded-md border"
      />
    ) : (
      <a
        href={m.attachmentUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block text-xs underline"
      >
        📎 {m.attachmentName || "Open attachment"}
      </a>
    )}
  </>
)}
<p className="text-[10px] opacity-70 mt-1">
  {m.createdAt?.toDate
    ? format(m.createdAt.toDate(), "MMM d, h:mm a")
    : ""}
</p>
              {m.site && (
                <p className="text-xs opacity-80 mt-1">
                  Site: {m.site}
                </p>
              )}
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
  <Textarea
    value={employeeReplyText}
    onChange={(e) => setEmployeeReplyText(e.target.value)}
  
    rows={3}
    placeholder="Reply to manager..."
  />
  <Input
  type="file"
  accept="image/*,.pdf,.doc,.docx"
  onChange={(e) => setEmployeeReplyFile(e.target.files?.[0] ?? null)}
/>
  <Button
    onClick={sendEmployeeReply}
    disabled={!employeeReplyText.trim()}
  >
    <MessageSquare className="mr-2 h-4 w-4" />
    Send
  </Button>
</div>
    </CardContent>
  </Card>
</TabsContent>

        {/* ACTIVITY TAB */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Your Recent Activity</CardTitle>
              <CardDescription>Your last 20 clock-in/out events.</CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-4">
              <ScrollArea className="h-[500px]">
  <div className="w-full overflow-x-auto">
    <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead>Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {userEntries.length > 0 ? (
                      userEntries.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs">{formatDT(e.ts)}</TableCell>
                          <TableCell>
                            <Badge
                              variant={e.action === "in" ? "default" : "secondary"}
                              className={
                                e.action === "in"
                                  ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                                  : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                              }
                            >
                              {e.action.toUpperCase()}
                            </Badge>
                          </TableCell>
                          <TableCell>{e.site || "—"}</TableCell>
                          <TableCell>
                            {e.lat && e.lng ? (
                              <Button asChild variant="ghost" size="icon">
                                <a
                                  href={`https://maps.google.com/?q=${e.lat},${e.lng}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="View on map"
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="truncate max-w-[10rem]" title={asNoteText(e.note)}>
                            {asNoteText(e.note) || "—"}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                          {employee.name ? "No entries yet." : "Enter your name to see your activity."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                    </Table>
  </div>
</ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PAYROLL TAB */}
        <TabsContent value="payroll">
          <EmployeePayrollView
            employee={employee}
            payrollPeriods={payrollPeriods}
            confirmPayroll={confirmPayroll}
            payrollConfirmations={payrollConfirmations}
            companyName={settings.companyId}
              settings={settings}
            onViewTimesheet={handleViewTimesheet}
          />
        </TabsContent>
      </Tabs>

      {/* Profile */}
      <EmployeeProfileDialog
        isOpen={isProfileOpen}
        onOpenChange={setIsProfileOpen}
        employee={employee}
        updateEmployee={updateEmployee}
        mode="employeeSelf"
        onRequestUpdate={onRequestUpdate}
        
      />

      {/* Schedule Note Dialog */}
      <Dialog open={isNoteDialogOpen} onOpenChange={setIsNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Note for {editingNoteForSchedule?.siteName}</DialogTitle>
            <DialogDescription>
              This note is shared with your manager and other employees on this schedule.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={currentNote}
              onChange={(e) => setCurrentNote(e.target.value)}
              rows={6}
              placeholder="Add a note..."
            />
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleSaveNote}>Save Note</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Timesheet Dialog */}
      <Dialog open={isTimesheetDialogOpen} onOpenChange={setIsTimesheetDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Timesheet Details</DialogTitle>
            <DialogDescription>
              Work sessions for {employee.name} from{" "}
              {timesheetData.period ? format(parseISO(timesheetData.period.startDate), "MMM d") : ""} to{" "}
              {timesheetData.period ? format(parseISO(timesheetData.period.endDate), "MMM d, yyyy") : ""}.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {timesheetData.sessions.length > 0 ? (
                  timesheetData.sessions
                    .filter((s): s is Session & { in: NonNullable<Session["in"]> } => !!s.in)
                    .map((s) => (
                      <TableRow key={s.in.id}>
                        <TableCell className="font-medium">{s.in.site}</TableCell>
                        <TableCell>{format(s.in.ts, "MMM d, hh:mm a")}</TableCell>
                        <TableCell>
                          {s.out ? format(s.out.ts, "MMM d, hh:mm a") : <Badge variant="secondary">Active</Badge>}
                        </TableCell>
                        <TableCell className="text-right">{minutesToHHMM(s.minutes)}</TableCell>
                      </TableRow>
                    ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={4} className="h-24 text-center">
                      No work sessions recorded for this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>

<Dialog open={employeeNoteOpen} onOpenChange={setEmployeeNoteOpen}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Note to Manager</DialogTitle>

      <DialogDescription>
        Send a note about {employeeNoteSite || "this site"}.
      </DialogDescription>
    </DialogHeader>

    <Textarea
      value={employeeNoteText}
      onChange={(e) => setEmployeeNoteText(e.target.value)}
      rows={5}
      placeholder="Write your note to the manager..."
    />
<Input
  type="file"
  accept="image/*,.pdf,.doc,.docx"
  onChange={(e) => setEmployeeNoteFile(e.target.files?.[0] ?? null)}
/>
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setEmployeeNoteOpen(false)}
      >
        Cancel
      </Button>

      <Button
        onClick={sendEmployeeNoteToManager}
        disabled={!employeeNoteText.trim()}
      >
        Send Note
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>

</>
  );
}
