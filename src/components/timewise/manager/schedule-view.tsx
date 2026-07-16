// src/components/timewise/manager/schedule-view.tsx
"use client";

import React, { useMemo, useEffect, useState, useCallback } from "react";
import type {
  Site,
  CleaningSchedule,
  DayOfWeek,
  Employee,
  BillingFrequency,
  RepeatFrequency,
  SiteStatus,
  Entry,
} from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  PlusCircle,
  Trash2,
  Edit,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  LogIn,
  LogOut,
  MessageSquare,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  format,
  add,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isToday,
  getDay,
  isSameDay,
  parseISO,
  isYesterday,
  isTomorrow,
  differenceInCalendarWeeks,
  getDate,
  getMonth,
  getYear,
  startOfDay,
  addDays,
} from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cleanForFirestore } from "@/lib/firestore-utils";
import { cn}from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { collection } from "firebase/firestore";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db } from "@/firebase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useEngine } from "@/providers/EngineProvider";
import { useSettings } from "@/features/settings/hooks/useSettings";
import {
  buildDailyRoutePlan,
  formatClockTime,
  formatMinutes,
  subtractMinutesFromTime,
} from "@/lib/route-planning";


interface Team {
  id: string;
  name: string;
}

interface ScheduleViewProps {
  sites: Site[];
  employees: Employee[];
  schedules: CleaningSchedule[];
  addSchedule: (schedule: Omit<CleaningSchedule, "id">) => void;
  updateSchedule: (id: string, updates: Partial<CleaningSchedule>) => void;
  deleteSchedule: (id: string) => void;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  getSiteStatuses: (forDate: Date) => Map<string, SiteStatus>;
  recordEntry: (
    action: "in" | "out",
    site: Site,
    forDate: Date,
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
  ) => Promise<void>;
  isClockedIn: (siteName?: string, employeeId?: string) => boolean;
  getDurationsBySite: (
    forDate: Date
  ) => Map<string, { minutes: number; byEmployee: Record<string, number> }>;
  teams: Team[];
  entries: Entry[];
updateEntry: (id: string, updates: Partial<Entry>) => Promise<void>;
}



const billingFrequencies: BillingFrequency[] = [
  "One-Time",
  "Daily",
  "Weekly",
  "Bi-Weekly",
  "Monthly",
  "Quarterly",
  "Yearly",
];

const repeatFrequencies: RepeatFrequency[] = [
  "does-not-repeat",
  "weekly",
  "every-2-weeks",
  "every-3-weeks",
  "monthly",
  "every-2-months",
  "quarterly",
  "yearly",
];


const getStatusIndicator = (
  status: SiteStatus | undefined,
  view: "daily" | "weekly" | "monthly"
) => {
  if (!status) return null;

  const statusConfig = {
    incomplete: { color: "bg-red-500", label: "Incomplete" },
    "in-process": { color: "bg-lime-400", label: "In Process" },
    complete: { color: "bg-green-500", label: "Complete" },
  } as const;

  if (view === "daily") {
    return (
      <Badge
        variant="outline"
        className={cn("capitalize text-white", statusConfig[status].color)}
      >
        {statusConfig[status].label}
      </Badge>
    );
  }

  return (
    <div
      className={cn("h-2.5 w-2.5 rounded-full", statusConfig[status].color)}
      title={statusConfig[status].label}
    />
  );
};

const formatDateHeader = (date: Date): string => {
  const fullDate = format(date, "eeee, MMMM d, yyyy");

  if (isToday(date)) return `Today, ${fullDate}`;
  if (isYesterday(date)) return `Yesterday, ${fullDate}`;
  if (isTomorrow(date)) return `Tomorrow, ${fullDate}`;

  return fullDate;
};

// minutes -> "HH:MM" (rounded up)
const formatHHMM = (totalMinutes: number) => {
  if (!totalMinutes || totalMinutes <= 0) return "00:00";
  const twoDecUp = Math.ceil(totalMinutes * 100) / 100;
  const wholeMinutes = Math.ceil(twoDecUp);
  const hours = Math.floor(wholeMinutes / 60);
  const minutes = wholeMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}`;
};

type AssignMode = "employees" | "team";

export function ScheduleView({
  sites,
  employees,
  schedules,
  addSchedule,
  updateSchedule,
  deleteSchedule,
  weekStartsOn,
  getSiteStatuses,
  recordEntry,
  isClockedIn,
  getDurationsBySite,
  teams,
  entries,
updateEntry,
}: ScheduleViewProps) {
  const { engine } = useEngine();
  const { settings } = useSettings();
 const cId =
  settings.companyId?.trim() ||
  process.env.NEXT_PUBLIC_COMPANY_ID ||
  "amazing-grace-cleaners";
const { cloudReady } = useSettings();
const activeEmployees = useMemo(
  () =>
    (employees ?? []).filter(
      (emp: Employee) => (emp.status || "active") !== "inactive"
    ),
  [employees]
); 
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<CleaningSchedule | null>(null);
const [deleteTarget, setDeleteTarget] = useState<{
  open: boolean;
  schedule?: CleaningSchedule;
  occurrenceDate?: Date;
}>({ open: false });
  // form fields
  const [siteName, setSiteName] = useState("");
  const [tasks, setTasks] = useState("");
  const [note, setNote] = useState("");

  // ✅ assignment
  const [assignMode, setAssignMode] = useState<AssignMode>("employees");
  const [assignedTo, setAssignedTo] = useState<string[]>([]);
  const [assignedTeamId, setAssignedTeamId] = useState<string>("");

  // recurrence
  const [startDate, setStartDate] = useState<Date | undefined>(new Date());
  const [repeatFrequency, setRepeatFrequency] =
    useState<RepeatFrequency>("weekly");
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>([]);
  const [repeatUntil, setRepeatUntil] = useState<Date | undefined>();

  const [servicePrice, setServicePrice] = useState<number | undefined>();
  const [billingFrequency, setBillingFrequency] =
    useState<BillingFrequency | undefined>();

  const [currentDate, setCurrentDate] = useState(startOfDay(new Date()));
const [activeTab, setActiveTab] = useState("list");

/*
 * Employee selected for manager route planning.
 * This is separate from the search and status filters.
 */
const [planningEmployeeId, setPlanningEmployeeId] =
  useState<string>("");
const [fixModal, setFixModal] = useState<{
  open: boolean;
  employeeId?: string;
  employeeName?: string;
  site?: Site;
  date?: Date;
  inEntryId?: string;
  outEntryId?: string;
}>({ open: false });

const [fixIn, setFixIn] = useState("");
const [fixOut, setFixOut] = useState("");
  // editing scope + occurrence (for “edit single day of series”)
  const [applyScope, setApplyScope] = useState<"single" | "series">("series");
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState<
    Date | undefined
  >(undefined);

  const goPrev = () => setCurrentDate((d) => addDays(d, -1));
  const goNext = () => setCurrentDate((d) => addDays(d, 1));
  const goToday = () => setCurrentDate(startOfDay(new Date()));
  const jumpToShiftDay = (date: Date) => {
  setCurrentDate(startOfDay(date));
  setActiveTab("daily");
};

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const employeeMap = useMemo(
    () => new Map(employees.map((e) => [e.name, e])),
    [employees]
  );
const employeeById = useMemo(
  () => new Map(employees.map((e) => [e.id, e])),
  [employees]
);

const resolveAssignedEmployeeIds = (names: string[]): string[] => {
  const ids = names
    .map((name) => employeeMap.get(name)?.id)
    .filter((id): id is string => !!id);

  return Array.from(new Set(ids));
};
  const weekDays: DayOfWeek[] = useMemo(() => {
    const start = startOfWeek(new Date(), { weekStartsOn });
    return Array.from({ length: 7 }).map(
      (_, i) => format(add(start, { days: i }), "EEEE") as DayOfWeek
    );
  }, [weekStartsOn]);

  const durationsForCurrentDate = useMemo(
    () => getDurationsBySite(currentDate),
    [getDurationsBySite, currentDate]
  );

  // include any “deleted” site names that exist in schedules
  const sitesForDropdown = useMemo(() => {
    const siteNames = new Set(sites.map((s) => s.name));
    schedules.forEach((s) => siteNames.add(s.siteName));
    return Array.from(siteNames).sort();
  }, [sites, schedules]);

  const allDaysSelected = daysOfWeek.length === 7;

  const handleDayToggle = (day: DayOfWeek, checked: boolean) => {
    setDaysOfWeek((prev) =>
      checked ? [...prev, day] : prev.filter((d) => d !== day)
    );
  };

  const handleSelectAllDays = (checked: boolean) => {
    setDaysOfWeek(checked ? weekDays : []);
  };

  const handleEmployeeToggle = (employeeName: string, checked: boolean) => {
    setAssignedTo((prev) =>
      checked ? [...prev, employeeName] : prev.filter((n) => n !== employeeName)
    );
  };

  const validateAssignment = () => {
    if (assignMode === "team") return !!assignedTeamId;
    return assignedTo.length > 0;
  };
const openFixShiftModal = (data: {
  employeeId: string;
  employeeName: string;
  site: Site;
  date: Date;
}) => {
  const dayEntries = entries
    .filter(
      (e) =>
        e.employeeId === data.employeeId &&
        e.site === data.site.name &&
        isSameDay(new Date(e.ts), data.date)
    )
    .sort((a, b) => a.ts - b.ts);

  const inEntry = dayEntries.find((e) => e.action === "in");
  const outEntry = dayEntries.find((e) => e.action === "out");

  const toInput = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  setFixModal({
    open: true,
    ...data,
    inEntryId: inEntry?.id,
    outEntryId: outEntry?.id,
  });

  setFixIn(toInput(inEntry?.ts));
  setFixOut(toInput(outEntry?.ts));
};
  const handleOpenDialog = (
    schedule: CleaningSchedule | null = null,
    occurrenceDate?: Date
  ) => {
    setEditingSchedule(schedule);

    if (schedule) {
      setSiteName(schedule.siteName);
      setTasks(schedule.tasks);
      setNote(schedule.note || "");

      const mode: AssignMode = schedule.assignedTeamId ? "team" : "employees";
      setAssignMode(mode);

      setAssignedTo(
        (schedule.assignedTo || []).map((e) =>
          typeof e === "string" ? e : (e as any).name
        )
      );
      setAssignedTeamId(schedule.assignedTeamId || "");

      setStartDate(schedule.startDate ? parseISO(schedule.startDate) : new Date());
      setRepeatFrequency(schedule.repeatFrequency || "does-not-repeat");
      setDaysOfWeek(schedule.daysOfWeek || []);
      setRepeatUntil(schedule.repeatUntil ? parseISO(schedule.repeatUntil) : undefined);

      setServicePrice(schedule.servicePrice);
      setBillingFrequency(schedule.billingFrequency);

      setEditingOccurrenceDate(occurrenceDate);
      setApplyScope("single");
    } else {
      setSiteName("");
      setTasks("");
      setNote("");

      setAssignMode("employees");
      setAssignedTo([]);
      setAssignedTeamId("");

      setStartDate(new Date());
      setRepeatFrequency("weekly");
      setDaysOfWeek([]);
      setRepeatUntil(undefined);

      setServicePrice(undefined);
      setBillingFrequency(undefined);

      setEditingOccurrenceDate(undefined);
      setApplyScope("series");
    }

    setIsDialogOpen(true);
  };

 
 const handleSubmit = async () => {
  if (!siteName || !tasks || !startDate || !validateAssignment()) {
    alert(
      "Please fill out required fields: Site, Start Date, Tasks, and Assignment."
    );
    return;
  }

  if (
    (repeatFrequency === "weekly" ||
      repeatFrequency === "every-2-weeks" ||
      repeatFrequency === "every-3-weeks") &&
    daysOfWeek.length === 0
  ) {
    alert(
      "Please select at least one day of the week for weekly repeating schedules."
    );
    return;
  }

  const assignedEmployeeIds =
    assignMode === "team"
      ? []
      : resolveAssignedEmployeeIds(assignedTo);

  const baseData: Omit<CleaningSchedule, "id"> = {
    siteName,
    tasks,
    note,

    assignedTeamId:
      assignMode === "team" ? assignedTeamId : undefined,

    assignedTo:
      assignMode === "team" ? [] : assignedTo,

    assignedEmployeeIds,

    startDate: format(startDate, "yyyy-MM-dd"),
    repeatFrequency,

    daysOfWeek: repeatFrequency.includes("week")
      ? daysOfWeek
      : undefined,

    repeatUntil: repeatUntil
      ? format(repeatUntil, "yyyy-MM-dd")
      : undefined,

    servicePrice,
    billingFrequency,
  };

  const cleanedData = cleanForFirestore(
    baseData
  ) as Omit<CleaningSchedule, "id">;

  /*
   * Creating a completely new schedule
   */
  if (!editingSchedule) {
    await Promise.resolve(addSchedule(cleanedData));

    setIsDialogOpen(false);
    setEditingOccurrenceDate(undefined);
    setApplyScope("series");
    return;
  }

  const isRecurring =
    editingSchedule.repeatFrequency !== "does-not-repeat";

  const hasOccurrenceContext =
    isRecurring && !!editingOccurrenceDate;

  /*
   * Editing from the List tab:
   * There is no selected occurrence date.
   * This continues to edit the entire schedule.
   */
  if (!hasOccurrenceContext) {
    await Promise.resolve(
      updateSchedule(editingSchedule.id, cleanedData)
    );

    setIsDialogOpen(false);
    setEditingOccurrenceDate(undefined);
    setApplyScope("series");
    return;
  }

  const selectedDate = startOfDay(editingOccurrenceDate!);
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");

  /*
   * OPTION 1:
   * Change only the selected scheduled day.
   *
   * The original recurring schedule remains unchanged for
   * past and future dates, except that this date becomes
   * an exception.
   */
  if (applyScope === "single") {
    const existingExceptions =
      editingSchedule.exceptionDates || [];

    const updatedExceptions = Array.from(
      new Set([...existingExceptions, selectedDateStr])
    );

    await Promise.resolve(
      updateSchedule(editingSchedule.id, {
        exceptionDates: updatedExceptions,
      })
    );

    const singleDaySchedule: Omit<CleaningSchedule, "id"> = {
      ...baseData,

      startDate: selectedDateStr,
      repeatFrequency: "does-not-repeat",
      daysOfWeek: undefined,
      repeatUntil: undefined,
      exceptionDates: undefined,
    };

    await Promise.resolve(
      addSchedule(
        cleanForFirestore(
          singleDaySchedule
        ) as Omit<CleaningSchedule, "id">
      )
    );

    setIsDialogOpen(false);
    setEditingOccurrenceDate(undefined);
    setApplyScope("series");
    return;
  }

  /*
   * OPTION 2:
   * Change the selected day and all future occurrences.
   *
   * We split the recurring schedule into:
   *
   * 1. Historical schedule ending one day before selected date.
   * 2. New schedule beginning on selected date.
   *
   * This preserves past schedule assignments.
   */
  const originalStartDate = startOfDay(
    parseISO(editingSchedule.startDate)
  );

  /*
   * When editing from the first date of the schedule,
   * there is no historical portion to preserve.
   */
  if (
    selectedDate.getTime() <= originalStartDate.getTime()
  ) {
    await Promise.resolve(
      updateSchedule(editingSchedule.id, {
        ...cleanedData,
        startDate: selectedDateStr,
      })
    );

    setIsDialogOpen(false);
    setEditingOccurrenceDate(undefined);
    setApplyScope("series");
    return;
  }

  const historicalEndDate = format(
    addDays(selectedDate, -1),
    "yyyy-MM-dd"
  );

  /*
   * Keep the original schedule and its original employee
   * assignments for all past dates.
   */
  await Promise.resolve(
    updateSchedule(editingSchedule.id, {
      repeatUntil: historicalEndDate,
    })
  );

  /*
   * Only future exception dates should move to the new series.
   */
  const futureExceptionDates = (
    editingSchedule.exceptionDates || []
  ).filter((date) => date >= selectedDateStr);

  /*
   * Create the new future series using the edited information.
   */
  const futureSchedule: Omit<CleaningSchedule, "id"> = {
    ...baseData,

    startDate: selectedDateStr,

    exceptionDates:
      futureExceptionDates.length > 0
        ? futureExceptionDates
        : undefined,
  };

  await Promise.resolve(
    addSchedule(
      cleanForFirestore(
        futureSchedule
      ) as Omit<CleaningSchedule, "id">
    )
  );

  setIsDialogOpen(false);
  setEditingOccurrenceDate(undefined);
  setApplyScope("series");
};

  const getSchedulesForDate = (date: Date) => {
  const dateStr = format(date, "yyyy-MM-dd");

  // 1. overrides (single-day)
  const overrides = schedules.filter(
    (s) =>
      s.repeatFrequency === "does-not-repeat" &&
      s.startDate === dateStr
  );

  // 2. recurring
  const recurring = schedules.filter(
    (s) => s.repeatFrequency !== "does-not-repeat"
  );

  const resolvedRecurring = recurring.filter((s) => {
    if (!s.startDate) return false;

    const schStart = parseISO(s.startDate);

    // ❌ skip exception
    if (s.exceptionDates?.includes(dateStr)) return false;

    if (date < startOfDay(schStart)) return false;
    if (s.repeatUntil && date > parseISO(s.repeatUntil)) return false;

    const monthDiff =
      (getYear(date) - getYear(schStart)) * 12 +
      (getMonth(date) - getMonth(schStart));

    switch (s.repeatFrequency) {
      case "weekly":
      case "every-2-weeks":
      case "every-3-weeks": {
        const dayName = format(date, "EEEE") as DayOfWeek;
        if (!s.daysOfWeek?.includes(dayName)) return false;

        const weekDiff = differenceInCalendarWeeks(date, schStart, {
          weekStartsOn,
        });

        if (s.repeatFrequency === "weekly") return weekDiff >= 0;
        if (s.repeatFrequency === "every-2-weeks")
          return weekDiff >= 0 && weekDiff % 2 === 0;
        if (s.repeatFrequency === "every-3-weeks")
          return weekDiff >= 0 && weekDiff % 3 === 0;
        return false;
      }

      case "monthly":
        return getDate(date) === getDate(schStart) && monthDiff >= 0;

      case "every-2-months":
        return getDate(date) === getDate(schStart) && monthDiff >= 0 && monthDiff % 2 === 0;

      case "quarterly":
        return getDate(date) === getDate(schStart) && monthDiff >= 0 && monthDiff % 3 === 0;

      case "yearly":
        return (
          getDate(date) === getDate(schStart) &&
          getMonth(date) === getMonth(schStart) &&
          monthDiff >= 0
        );

      default:
        return false;
    }
  });

  // 🚨 KEY: override wins over recurring
  const filteredRecurring = resolvedRecurring.filter((base) => {
    const hasOverride = overrides.some(
      (o) => o.siteName === base.siteName
    );
    return !hasOverride;
  });

  return [...filteredRecurring, ...overrides];
};

  // calendar view
  const startOfCurrentMonth = startOfMonth(currentDate);
  const endOfCurrentMonth = endOfMonth(currentDate);
  const daysInMonth = eachDayOfInterval({
    start: startOfCurrentMonth,
    end: endOfCurrentMonth,
  });
  const firstDayOfMonthIndex = getDay(startOfCurrentMonth);
  const startingBlankDays =
    (firstDayOfMonthIndex - weekStartsOn + 7) % 7;

  // weekly view
  const startOfCurrentWeek = startOfWeek(currentDate, { weekStartsOn });
  const daysInWeek = Array.from({ length: 7 }, (_, i) =>
    add(startOfCurrentWeek, { days: i })
  );

  const changeDate = (amount: number, unit: "week" | "month") => {
    setCurrentDate((prev) => add(prev, { [unit + "s"]: amount } as any));
  };

 
const handleManagerClock = useCallback(
  async (
    action: "in" | "out",
    site: Site,
    employee: Employee,
    scheduleId?: string,
    scheduleDate?: string
  ) => {
  if (action === "in") {
    const alreadyClockedInSite = sites.find((s) =>
      isClockedIn(s.name, employee.id)
    );

    if (alreadyClockedInSite) {
      alert(
        `${employee.name} is already clocked in at ${alreadyClockedInSite.name}. Please clock them out first before starting another shift.`
      );
      return;
    }
  }

  if (action === "out") {
    const confirmed = window.confirm(
      `Confirm clock out for ${employee.name} from ${site.name}?`
    );

    if (!confirmed) return;
  }

  await recordEntry(
  action,
  site,
  currentDate,
  scheduleId,
  scheduleDate,
  undefined,
  employee.id,
  true,
  {
    source: "manager-schedule-view",
    initiatedBy: "manager",
  }
);
},
[
  currentDate,
  isClockedIn,
  recordEntry,
  sites,
]
);

const handleFixShift = async () => {
  if (!fixModal.employeeId || !fixModal.site) return;

  const inTs = new Date(fixIn).getTime();
  const outTs = new Date(fixOut).getTime();

  if (!fixIn || !fixOut || isNaN(inTs) || isNaN(outTs)) {
    alert("Enter valid clock-in and clock-out times");
    return;
  }

  if (outTs <= inTs) {
    alert("Clock-out must be after clock-in");
    return;
  }

  if (!fixModal.inEntryId || !fixModal.outEntryId) {
    alert("No existing shift found to edit.");
    return;
  }

  await updateEntry(fixModal.inEntryId, {
    ts: inTs,
    note: "Manager edited clock-in",
  });

  await updateEntry(fixModal.outEntryId, {
    ts: outTs,
    note: "Manager edited clock-out",
  });

  setFixModal({ open: false });
};
const [dailySearch, setDailySearch] = useState("");
const [statusFilter, setStatusFilter] = useState<
  "all" | "complete" | "in-process" | "incomplete"
>("all");

useEffect(() => {
  setDailySearch("");
  setStatusFilter("all");
}, [currentDate]);

const dailySchedules = useMemo(() => {
  return getSchedulesForDate(currentDate);
}, [currentDate, schedules]);

const dailyStatuses = useMemo(
    () => getSiteStatuses(currentDate),
    [getSiteStatuses, currentDate]
  );
const filteredDailySchedules = useMemo(() => {
  const q = dailySearch.trim().toLowerCase();

  return dailySchedules.filter((s) => {
    const assignedEmployeeNames =
      s.assignedEmployeeIds?.length
        ? s.assignedEmployeeIds
            .map((id) => employeeById.get(id)?.name ?? "")
            .filter(Boolean)
        : s.assignedTo ?? [];

    const teamName = s.assignedTeamId
      ? teamsById.get(s.assignedTeamId)?.name ?? ""
      : "";

    const matchesSearch =
      !q ||
      s.siteName.toLowerCase().includes(q) ||
      s.tasks.toLowerCase().includes(q) ||
      (s.note ?? "").toLowerCase().includes(q) ||
      assignedEmployeeNames.some((name) => name.toLowerCase().includes(q)) ||
      teamName.toLowerCase().includes(q);

    const status = dailyStatuses.get(s.siteName);
    const matchesStatus =
      statusFilter === "all" ? true : status === statusFilter;

    return matchesSearch && matchesStatus;
  });
}, [
  dailySchedules,
  dailySearch,
  statusFilter,
  employeeById,
  teamsById,
  dailyStatuses,
]);

/*
 * Manager-only route planning schedules for the selected employee.
 *
 * A schedule is included when:
 * 1. The employee is assigned directly by ID.
 * 2. The employee is assigned through the legacy assignedTo name list.
 * 3. The employee belongs to the team assigned to the schedule.
 */
const planningSchedules = useMemo(() => {
  if (!planningEmployeeId) {
    return [];
  }

  const planningEmployee =
    employeeById.get(planningEmployeeId);

  if (!planningEmployee) {
    return [];
  }

  return dailySchedules.filter((schedule) => {
    const assignedById =
      schedule.assignedEmployeeIds?.includes(
        planningEmployee.id
      ) ?? false;

    const assignedByLegacyName =
      schedule.assignedTo?.includes(
        planningEmployee.name
      ) ?? false;

    const assignedByTeam =
      Boolean(schedule.assignedTeamId) &&
      schedule.assignedTeamId === planningEmployee.teamId;

    return (
      assignedById ||
      assignedByLegacyName ||
      assignedByTeam
    );
  });
}, [
  planningEmployeeId,
  dailySchedules,
  employeeById,
]);

/*
 * Uses the suggested route order, then calculates:
 * - estimated cleaning time
 * - estimated travel time
 * - total estimated time
 */
const planningRoutePlan = useMemo(() => {
  return buildDailyRoutePlan({
    schedules: planningSchedules,
    sites,

    /*
     * No starting location is available in ScheduleView yet.
     * Therefore, travel to the first site is currently zero.
     * Travel between sites is still calculated automatically.
     */
    startingLocation: null,
  });
}, [
  planningSchedules,
  sites,
]);

/*
 * For this first implementation, the finish time is stored on
 * the first schedule in the employee's route.
 */
const routeFinishByTime =
  planningSchedules.find(
    (schedule) => Boolean(schedule.finishByTime)
  )?.finishByTime ?? "";

const recommendedStartTime = useMemo(() => {
  if (
    !routeFinishByTime ||
    planningRoutePlan.totalEstimatedMinutes <= 0
  ) {
    return null;
  }

  return subtractMinutesFromTime(
    routeFinishByTime,
    planningRoutePlan.totalEstimatedMinutes
  );
}, [
  routeFinishByTime,
  planningRoutePlan.totalEstimatedMinutes,
]);

const handleFinishByTimeChange = (
  value: string
) => {
  const firstSchedule = planningSchedules[0];

  if (!firstSchedule) {
    return;
  }

  updateSchedule(firstSchedule.id, {
    finishByTime: value || undefined,
  });
};

const dailySiteCount = new Set(
  filteredDailySchedules.map((s) => s.siteName)
).size;

  

  const { completeCount, incompleteCount, inProcessCount } = useMemo(() => {
    const siteNamesForToday = new Set(filteredDailySchedules.map((s) => s.siteName));

    let complete = 0;
    let incomplete = 0;
    let inProcess = 0;

    siteNamesForToday.forEach((name) => {
      const status = dailyStatuses.get(name);
      if (status === "complete") complete++;
      else if (status === "incomplete") incomplete++;
      else if (status === "in-process") inProcess++;
    });

    return {
      completeCount: complete,
      incompleteCount: incomplete,
      inProcessCount: inProcess,
    };
  }, [filteredDailySchedules, dailyStatuses]);
  const listSchedules = useMemo(() => {
  return schedules.filter((s) => {
    // hide one-off overrides from the main list
    if (s.repeatFrequency === "does-not-repeat" && s.startDate) {
      const isOverride = schedules.some(
        (base) =>
          base.repeatFrequency !== "does-not-repeat" &&
          base.exceptionDates?.includes(s.startDate) &&
          base.siteName === s.siteName
      );

      if (isOverride) return false;
    }

    return true;
  });
}, [schedules]);

const getScheduleHours = useCallback(
  (
    siteName: string,
    employeeId: string,
    scheduleId: string,
    scheduleDate: string
  ) => {
    let employeeEntries = entries
      .filter(
        (e) =>
          e.employeeId === employeeId &&
          e.site === siteName &&
          e.scheduleId === scheduleId &&
          e.scheduleDate === scheduleDate
      )
      .slice()
      .sort((a, b) => a.ts - b.ts);

    // Fallback for older entries
    if (employeeEntries.length === 0) {
      employeeEntries = entries
        .filter((e) => {
          if (e.employeeId !== employeeId) return false;
          if (e.site !== siteName) return false;

          return (
            format(startOfDay(new Date(e.ts)), "yyyy-MM-dd") ===
            scheduleDate
          );
        })
        .slice()
        .sort((a, b) => a.ts - b.ts);
    }

    let totalMinutes = 0;
    let activeIn: Entry | null = null;

    for (const entry of employeeEntries) {
      if (entry.action === "in") {
        activeIn = entry;
      }

      if (entry.action === "out" && activeIn) {
        totalMinutes += Math.max(
          0,
          Math.round((entry.ts - activeIn.ts) / 60000)
        );

        activeIn = null;
      }
    }

    return formatHHMM(totalMinutes);
  },
  [entries]
);

 const handleDeleteScheduleChoice = (
  scope: "single" | "future" | "series"
) => {
  const schedule = deleteTarget.schedule;
  const occurrenceDate = deleteTarget.occurrenceDate;

  if (!schedule) return;

  if (scope === "series") {
    deleteSchedule(schedule.id);
  }

  if (scope === "single" && occurrenceDate) {
    const dateStr = format(occurrenceDate, "yyyy-MM-dd");

    const existingExceptions =
      (schedule.exceptionDates as string[] | undefined) || [];

    updateSchedule(schedule.id, {
      exceptionDates: Array.from(new Set([...existingExceptions, dateStr])),
    });
  }

  if (scope === "future" && occurrenceDate) {
    const dayBefore = format(addDays(occurrenceDate, -1), "yyyy-MM-dd");

    updateSchedule(schedule.id, {
      repeatUntil: dayBefore,
    });
  }

  setDeleteTarget({ open: false });
};

  const renderAssignmentBadges = (s: CleaningSchedule) => {
  if (s.assignedTeamId) {
    const team = teamsById.get(s.assignedTeamId);
    return (
      <Badge variant="secondary" className="text-xs">
        Team: {team?.name ?? s.assignedTeamId}
      </Badge>
    );
  }
  

  return (
    <div className="flex flex-wrap gap-1">
      {(s.assignedEmployeeIds?.length
        ? s.assignedEmployeeIds
            .map((id) => employeeById.get(id))
            .filter((emp): emp is Employee => !!emp)
        : (s.assignedTo || []).map((name) =>
            employees.find((e) => e.name === name)
          ).filter((emp): emp is Employee => !!emp)
      ).map((emp) => (
        <Badge
          key={emp.id}
          variant="secondary"
          className="text-xs"
          style={
            emp.color
              ? { backgroundColor: emp.color, color: "white" }
              : {}
          }
        >
          {emp.name}
        </Badge>
      ))}
    </div>
  );
};
  return (
    <TooltipProvider>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button disabled={engine === "cloud" && !cloudReady}
              onClick={() => handleOpenDialog()}>
                <PlusCircle className="mr-2 h-4 w-4" /> 
  Add Schedule
</Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>
                  {editingSchedule ? "Edit" : "Add"} Schedule
                </DialogTitle>
              </DialogHeader>

              <ScrollArea className="max-h-[70vh]">
                <div className="grid gap-4 py-4 px-1">
                  {/* Site */}
                  <div className="space-y-2">
                    <Label htmlFor="siteName">Site</Label>
                    <Select value={siteName} onValueChange={setSiteName}>
                      <SelectTrigger id="siteName">
                        <SelectValue placeholder="Select a site" />
                      </SelectTrigger>
                      <SelectContent>
                        {sitesForDropdown.map((sName) => (
                          <SelectItem key={sName} value={sName}>
                            <span className="flex items-center gap-2">
                              {!sites.find((s) => s.name === sName) && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertCircle className="h-4 w-4 text-destructive" />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>This site is not in your site directory.</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {sName}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Price/Frequency */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="servicePrice">Service Price ($)</Label>
                      <Input
                        id="servicePrice"
                        type="number"
                        value={servicePrice ?? ""}
                        onChange={(e) =>
                          setServicePrice(
                            parseFloat(e.target.value) || undefined
                          )
                        }
                        placeholder="e.g., 150"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="billingFrequency">Billing Frequency</Label>
                      <Select
                        value={billingFrequency}
                        onValueChange={(v: BillingFrequency) =>
                          setBillingFrequency(v)
                        }
                      >
                        <SelectTrigger id="billingFrequency">
                          <SelectValue placeholder="Select frequency" />
                        </SelectTrigger>
                        <SelectContent>
                          {billingFrequencies.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Start date / Repeat */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !startDate && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {startDate ? (
                              format(startDate, "yyyy-MM-dd")
                            ) : (
                              <span>Pick a date</span>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={startDate}
                            onSelect={setStartDate}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Repeat Frequency</Label>
                      <Select
                        value={repeatFrequency}
                        onValueChange={(v: RepeatFrequency) =>
                          setRepeatFrequency(v)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {repeatFrequencies.map((f) => (
                            <SelectItem key={f} value={f}>
                              {f.replace(/-/g, " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Days of week */}
                  {(repeatFrequency === "weekly" ||
                    repeatFrequency === "every-2-weeks" ||
                    repeatFrequency === "every-3-weeks") && (
                    <div className="space-y-2">
                      <Label>Days of Week</Label>
                      <div className="space-y-2 rounded-md border p-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="all-days"
                            checked={allDaysSelected}
                            onCheckedChange={(c) =>
                              handleSelectAllDays(!!c)
                            }
                          />
                          <Label htmlFor="all-days" className="font-medium">
                            Every Day
                          </Label>
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          {weekDays.map((day) => (
                            <div
                              key={day}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`day-${day}`}
                                checked={daysOfWeek.includes(day)}
                                onCheckedChange={(checked) =>
                                  handleDayToggle(day, !!checked)
                                }
                              />
                              <Label
                                htmlFor={`day-${day}`}
                                className="text-sm font-normal"
                              >
                                {day.substring(0, 3)}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Repeat until */}
                  <div className="space-y-2">
                    <Label>Repeat Until (Optional)</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !repeatUntil && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {repeatUntil ? (
                            format(repeatUntil, "yyyy-MM-dd")
                          ) : (
                            <span>No end date</span>
                          )}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={repeatUntil}
                          onSelect={setRepeatUntil}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* ✅ Assignment */}
                  <div className="space-y-2">
                    <Label>Assign By</Label>

                    <RadioGroup
                      value={assignMode}
                      onValueChange={(v) => {
                        const next = v as AssignMode;
                        setAssignMode(next);

                        // keep mutually exclusive
                        if (next === "team") setAssignedTo([]);
                        else setAssignedTeamId("");
                      }}
                      className="flex gap-2 flex-wrap"
                    >
                      <Label
                        htmlFor="assign-employees"
                        className="flex items-center space-x-2 rounded-md border px-3 py-2 cursor-pointer"
                      >
                        <RadioGroupItem
                          id="assign-employees"
                          value="employees"
                        />
                        <span className="text-sm">Employees</span>
                      </Label>

                      <Label
                        htmlFor="assign-team"
                        className="flex items-center space-x-2 rounded-md border px-3 py-2 cursor-pointer"
                      >
                        <RadioGroupItem id="assign-team" value="team" />
                        <span className="text-sm">Team</span>
                      </Label>
                    </RadioGroup>

                    {assignMode === "team" ? (
                      <div className="space-y-2">
                        <Label>Team</Label>
                        <Select
                          value={assignedTeamId}
                          onValueChange={setAssignedTeamId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a team..." />
                          </SelectTrigger>
                          <SelectContent>
                            {teams.length === 0 ? (
                              <SelectItem value="__none__" disabled>
                                No teams yet (create in Settings)
                              </SelectItem>
                            ) : (
                              teams.map((t) => (
                                <SelectItem key={t.id} value={t.id}>
                                  {t.name}
                                </SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <Label>Employees</Label>
                        <ScrollArea className="h-32 rounded-md border p-2">
                          <div className="space-y-2">
                            {activeEmployees.map((emp) => (
                              <div
                                key={emp.id}
                                className="flex items-center space-x-2"
                              >
                                <Checkbox
                                  id={`emp-${emp.id}`}
                                  checked={assignedTo.includes(emp.name)}
                                  onCheckedChange={(checked) =>
                                    handleEmployeeToggle(emp.name, !!checked)
                                  }
                                />
                                <Label
                                  htmlFor={`emp-${emp.id}`}
                                  className="text-sm font-normal flex items-center gap-2"
                                >
                                  {emp.color && (
                                    <span
                                      className="w-3 h-3 rounded-full"
                                      style={{ backgroundColor: emp.color }}
                                    />
                                  )}
                                  {emp.name}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      </div>
                    )}
                  </div>

                  {/* Tasks */}
                  <div className="space-y-2">
                    <Label htmlFor="tasks">Tasks</Label>
                    <Textarea
                      id="tasks"
                      value={tasks}
                      onChange={(e) => setTasks(e.target.value)}
                      placeholder="e.g., Mop floors, clean windows..."
                    />
                  </div>

                  {/* Note */}
                  <div className="space-y-2">
                    <Label htmlFor="note">
                      Note (optional, visible to employees)
                    </Label>
                    <Textarea
                      id="note"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g., Use the back entrance after 5 PM."
                    />
                   </div>
                  {editingSchedule &&
  editingOccurrenceDate &&
  editingSchedule.repeatFrequency !== "does-not-repeat" && (
    <div className="space-y-2 border rounded-md p-3">
      <Label>Apply changes to:</Label>

      <RadioGroup
        value={applyScope}
        onValueChange={(v) =>
          setApplyScope(v as "single" | "series")
        }
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="single" id="single-day" />
          <Label htmlFor="single-day">
            Only this day ({format(editingOccurrenceDate, "MMM d, yyyy")})
          </Label>
        </div>

        <div className="flex items-center space-x-2">
          <RadioGroupItem value="series" id="future-series" />
          <Label htmlFor="future-series">
  This and all future occurrences
</Label>
        </div>
      </RadioGroup>
    </div>
)}   
                </div>
              </ScrollArea>

              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="outline">Cancel</Button>
                </DialogClose>
                <Button onClick={handleSubmit}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* LIST */}
        <TabsContent value="list">
          <Card>
            <CardHeader>
              <CardTitle>Cleaning Schedules</CardTitle>
              <CardDescription>
                Manage recurring cleaning tasks for each site.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead>Repeats</TableHead>
                      <TableHead>Starts</TableHead>
                      <TableHead>Repeat Until</TableHead>
                      <TableHead>Assigned</TableHead>
                      <TableHead>Tasks</TableHead>
                      <TableHead>Note</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Frequency</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
  {listSchedules.length > 0 ? (
    listSchedules
      .slice()
      .sort((a, b) => a.siteName.localeCompare(b.siteName))
      .map((schedule) => {
        const repeatFreq =
          schedule.repeatFrequency || "does-not-repeat";

        return (
          <TableRow key={schedule.id}>
            <TableCell>{schedule.siteName}</TableCell>
            <TableCell className="capitalize">
              {repeatFreq.replace(/-/g, " ")}
              {repeatFreq.includes("week")
                ? ` on ${schedule.daysOfWeek
                    ?.map((d) => d.substring(0, 3))
                    .join(", ")}`
                : ""}
            </TableCell>
            <TableCell>{schedule.startDate}</TableCell>
            <TableCell>
              {schedule.repeatUntil ? schedule.repeatUntil : "Ongoing"}
            </TableCell>
            <TableCell className="max-w-[14rem]">
              {renderAssignmentBadges(schedule)}
            </TableCell>
            <TableCell className="max-w-sm truncate">
              {schedule.tasks}
            </TableCell>
            <TableCell
              className="max-w-xs truncate"
              title={schedule.note}
            >
              {schedule.note || "-"}
            </TableCell>
            <TableCell>
              {schedule.servicePrice
                ? `$${schedule.servicePrice.toFixed(2)}`
                : "-"}
            </TableCell>
            <TableCell>
              {schedule.billingFrequency || "-"}
            </TableCell>
            <TableCell className="text-right">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleOpenDialog(schedule)}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
               onClick={() => {
  if (schedule.repeatFrequency === "does-not-repeat") {
    deleteSchedule(schedule.id);
  } else {
    setDeleteTarget({
      open: true,
      schedule,
      occurrenceDate: schedule.startDate
        ? parseISO(schedule.startDate)
        : new Date(),
    });
  }
}}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </TableCell>
          </TableRow>
        );
      })
  ) : (
    <TableRow>
      <TableCell colSpan={10} className="h-24 text-center">
        No schedules yet.
      </TableCell>
    </TableRow>
  )}
</TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* DAILY */}
        <TabsContent value="daily">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle>Daily Schedule</CardTitle>
                  <CardDescription>
                    {formatDateHeader(currentDate)} • {dailySiteCount} site
                    {dailySiteCount === 1 ? "" : "s"} scheduled
                  </CardDescription>

                  {(completeCount + incompleteCount + inProcessCount > 0) && (
                    <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        {completeCount} complete
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-lime-400" />
                        {inProcessCount} in process
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        {incompleteCount} incomplete
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {(() => {
                    const siteNames = new Set(
                      filteredDailySchedules.map((s) => s.siteName)
                    );
                    let total = 0;
                    siteNames.forEach((name) => {
                      total += durationsForCurrentDate.get(name)?.minutes ?? 0;
                    });

                    return total > 0 ? (
                      <span
                        className="text-xs px-2 py-1 rounded-full bg-muted font-medium"
                        title="Total recorded time for this day"
                      >
                        {formatHHMM(total)}
                      </span>
                    ) : null;
                  })()}

                  <Button variant="outline" size="icon" onClick={goPrev}>
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant={
                      isSameDay(currentDate, new Date()) ? "default" : "outline"
                    }
                    onClick={goToday}
                  >
                    Today
                  </Button>
                  <Button variant="outline" size="icon" onClick={goNext}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
  <div className="w-full sm:w-72">
    <Input
      placeholder="Search site, employee, team..."
      value={dailySearch}
      onChange={(e) => setDailySearch(e.target.value)}
    />
  </div>

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

{/* Manager-only estimated workload planner */}
<div className="mb-4 rounded-lg border p-4 space-y-4">
  <div>
    <h3 className="font-semibold">
      Estimated Workload
    </h3>

    <p className="text-sm text-muted-foreground">
      Select an employee to calculate cleaning time,
      automatic travel time, and the recommended start time.
    </p>
  </div>

  <div className="space-y-2">
    <Label htmlFor="planningEmployee">
      Employee
    </Label>

    <Select
      value={planningEmployeeId}
      onValueChange={setPlanningEmployeeId}
    >
      <SelectTrigger id="planningEmployee">
        <SelectValue placeholder="Select an employee..." />
      </SelectTrigger>

      <SelectContent>
        {activeEmployees.map((employee) => (
          <SelectItem
            key={employee.id}
            value={employee.id}
          >
            {employee.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>

  {planningEmployeeId ? (
    planningSchedules.length > 0 ? (
      <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Cleaning time
            </p>

            <p className="text-lg font-semibold">
              {formatMinutes(
                planningRoutePlan.totalCleaningMinutes
              )}
            </p>
          </div>

          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Travel time
            </p>

            <p className="text-lg font-semibold">
              {formatMinutes(
                planningRoutePlan.totalTravelMinutes
              )}
            </p>
          </div>

          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Total estimated time
            </p>

            <p className="text-lg font-semibold">
              {formatMinutes(
                planningRoutePlan.totalEstimatedMinutes
              )}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="finishByTime">
              Finish by
            </Label>

            <Input
              id="finishByTime"
              type="time"
              value={routeFinishByTime}
              onChange={(event) =>
                handleFinishByTimeChange(
                  event.target.value
                )
              }
            />

            <p className="text-xs text-muted-foreground">
              ManageWiseMD works backward using
              estimated cleaning and travel time.
            </p>
          </div>

          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">
              Recommended start time
            </p>

            <p className="text-xl font-semibold">
              {recommendedStartTime
                ? formatClockTime(
                    recommendedStartTime
                  )
                : "Set a finish time"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">
            Suggested route order
          </p>

          {planningRoutePlan.stops.map(
            (stop, index) => {
              const usesCustomTravel =
                stop.schedule.travelTimeMode ===
                "custom";

              return (
                <div
                  key={`${stop.schedule.id}-${index}`}
                  className="rounded-md border p-3 space-y-3"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-medium">
                        {index + 1}.{" "}
                        {stop.schedule.siteName}
                      </p>

                      <p className="text-xs text-muted-foreground">
                        Cleaning:{" "}
                        {formatMinutes(
                          stop.cleaningMinutes
                        )}
                      </p>
                    </div>

                    <div className="sm:text-right">
                      <p className="text-sm">
                        Travel:{" "}
                        {formatMinutes(
                          stop.effectiveTravelMinutes
                        )}
                      </p>

                      {stop.distanceMiles > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Approximately{" "}
                          {stop.distanceMiles.toFixed(1)}{" "}
                          miles
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        Travel time source
                      </Label>

                      <Select
                        value={
                          stop.schedule.travelTimeMode ??
                          "automatic"
                        }
                        onValueChange={(
                          value:
                            | "automatic"
                            | "custom"
                        ) =>
                          updateSchedule(
                            stop.schedule.id,
                            {
                              travelTimeMode: value,
                            }
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                          <SelectItem value="automatic">
                            Automatic — recommended
                          </SelectItem>

                          <SelectItem value="custom">
                            Custom
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {usesCustomTravel && (
                      <div className="space-y-2">
                        <Label>
                          Custom travel minutes
                        </Label>

                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={
                            stop.schedule
                              .customTravelMinutes ?? ""
                          }
                          onChange={(event) =>
                            updateSchedule(
                              stop.schedule.id,
                              {
                                customTravelMinutes:
                                  event.target.value === ""
                                    ? undefined
                                    : Math.max(
                                        0,
                                        Number(
                                          event.target
                                            .value
                                        ) || 0
                                      ),
                              }
                            )
                          }
                        />
                      </div>
                    )}
                  </div>

                  {index === 0 &&
                    stop.automaticTravelMinutes ===
                      0 && (
                      <p className="text-xs text-muted-foreground">
                        Travel to the first site is not
                        included because no starting
                        location has been selected.
                      </p>
                    )}
                </div>
              );
            }
          )}
        </div>
      </>
    ) : (
      <p className="text-sm text-muted-foreground">
        This employee has no schedules for{" "}
        {format(currentDate, "MMMM d, yyyy")}.
      </p>
    )
  ) : (
    <p className="text-sm text-muted-foreground">
      Select an employee to view the estimated
      workload.
    </p>
  )}
</div>

              <ScrollArea className="h-[60vh]">
      
                     {filteredDailySchedules.length > 0 ? (
          
                  <div className="space-y-4">
        
                    {filteredDailySchedules.map((s) => {
                      const site = sites.find((x) => x.name === s.siteName);
                      const status = dailyStatuses.get(s.siteName);

                      const siteBonus =
                        site?.bonusType && site.bonusAmount
                          ? site.bonusType === "hourly"
                            ? ` (+$${site.bonusAmount.toFixed(2)}/hr)`
                            : ` (+$${site.bonusAmount.toFixed(2)} flat)`
                          : "";

                      return (
                        <Card key={s.id}>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <CardTitle className="text-lg flex items-center gap-2">
                                  <span
                                    className="w-3 h-3 rounded-full"
                                    style={{
                                      backgroundColor: site?.color || "#ccc",
                                    }}
                                  />
                                  {s.siteName}
                                  {siteBonus && (
                                    <span className="text-xs font-normal text-green-600">
                                      {siteBonus}
                                    </span>
                                  )}
                                </CardTitle>

                                <CardDescription className="text-xs">
                                  {s.tasks}
                                </CardDescription>

                                <div className="mt-2">
                                  {renderAssignmentBadges(s)}
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {status && getStatusIndicator(status, "daily")}
                                {(() => {
  const scheduleDateKey = format(currentDate, "yyyy-MM-dd");

  const assignedEmployees = (s.assignedTo || [])
    .map((empName) => employeeMap.get(empName))
    .filter((emp): emp is Employee => !!emp);

  const totalScheduleMinutes = assignedEmployees.reduce((sum, emp) => {
    const time = getScheduleHours(
      s.siteName,
      emp.id,
      s.id,
      scheduleDateKey
    );

    const [h, m] = time.split(":").map(Number);
    return sum + h * 60 + m;
  }, 0);

  return totalScheduleMinutes > 0 ? (
    <span className="text-xs text-muted-foreground">
      • {formatHHMM(totalScheduleMinutes)}
    </span>
  ) : null;
})()}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleOpenDialog(s, currentDate)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
  variant="ghost"
  size="icon"
  className="h-7 w-7"
  onClick={() => {
    if (s.repeatFrequency === "does-not-repeat") {
      deleteSchedule(s.id);
    } else {
      setDeleteTarget({
        open: true,
        schedule: s,
        occurrenceDate: currentDate,
      });
    }
  }}
>
  <Trash2 className="h-4 w-4 text-destructive" />
</Button>
                              </div>
                            </div>
                          </CardHeader>

                          <CardContent>
                            {s.note && (
                              <p className="text-sm my-2 p-2 bg-amber-100 dark:bg-amber-900/50 border-l-4 border-amber-500 rounded-r-md">
                                {s.note}
                              </p>
                            )}

                            {/* ✅ Only show employee rows if this schedule is assigned to employees */}
                            {!s.assignedTeamId &&
  (
    s.assignedEmployeeIds?.length
      ? s.assignedEmployeeIds
          .map((id) => employeeById.get(id))
          .filter((emp): emp is Employee => !!emp)
      : (s.assignedTo || [])
          .map((name) => employeeMap.get(name))
          .filter((emp): emp is Employee => !!emp)
  ).map((emp) => {
if (!site) return null;
                                const scheduleDateKey = format(currentDate, "yyyy-MM-dd");

const formattedEmpTime = getScheduleHours(
  s.siteName,
  emp.id,
  s.id,
  scheduleDateKey
);

const displayTime =
  formattedEmpTime !== "00:00" ? formattedEmpTime : null;

                                const clocked = entries.some((entry) => {
  if (entry.employeeId !== emp.id) return false;
  if (entry.action !== "in") return false;

  return (
    entry.scheduleId === s.id &&
    entry.scheduleDate === scheduleDateKey &&
    !entries.some(
      (out) =>
        out.employeeId === emp.id &&
        out.action === "out" &&
        out.scheduleId === s.id &&
        out.scheduleDate === scheduleDateKey &&
        out.ts > entry.ts
    )
  );
});
                                

const employeeCompletedThisSite = entries.some((e) => {
  if (e.employeeId !== emp.id) return false;
  if (e.action !== "out") return false;

  return (
    e.scheduleId === s.id &&
    e.scheduleDate === scheduleDateKey
  );
});

const siteScheduleCompleted = entries.some((e) => {
  if (e.action !== "out") return false;

  return (
    e.scheduleId === s.id &&
    e.scheduleDate === scheduleDateKey
  );
});

                                return (
                                  <div
                                    key={emp.id}
                                    className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50 group"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="w-2 h-2 rounded-full"
                                        style={{ backgroundColor: emp.color }}
                                      />
                                      <span className="font-medium text-sm">
                                        {emp.name}
                                      </span>
                                      {displayTime && (
  <span className="text-xs text-muted-foreground">
    • {displayTime}
  </span>
)}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                        onClick={() => handleOpenDialog(s, currentDate)}
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>

                                      {clocked ? (
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() =>
  handleManagerClock(
    "out",
    site,
    emp,
    s.id,
    format(currentDate, "yyyy-MM-dd")
  )
}
 
                                        >
                                          <LogOut className="mr-1 h-4 w-4" />
                                          Clock Out
                                        </Button>
                                      ) : (
                                        <Button
                                          variant="default"
                                          size="sm"
                                         onClick={() => handleManagerClock(
  "in",
  site,
  emp,
  s.id,
  format(currentDate, "yyyy-MM-dd")
)}
   
                                         disabled={employeeCompletedThisSite || siteScheduleCompleted}
                                        >
                                          <LogIn className="mr-1 h-4 w-4" />
                                          Clock In
                                        </Button>
                                       
                                      )}
                                       <Button
  variant="outline"
  size="sm"
  onClick={() =>
    openFixShiftModal({
      employeeId: emp.id,
      employeeName: emp.name,
      site,
      date: currentDate,
    })
  }
>
  Fix
</Button>
                                    </div>
                                  </div>
                                );
                              })}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-48 text-muted-foreground">
                    No tasks scheduled for this day.
                  </div>
             
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* WEEKLY */}
        <TabsContent value="weekly">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Weekly Schedule</CardTitle>
                  <CardDescription>
                    {format(startOfCurrentWeek, "MMM d")} -{" "}
                    {format(add(startOfCurrentWeek, { days: 6 }), "MMM d, yyyy")}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => changeDate(-1, "week")}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentDate(new Date())}
                  >
                    This Week
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => changeDate(1, "week")}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <ScrollArea className="h-[60vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {daysInWeek.map((day) => {
                    const statuses = getSiteStatuses(day);

                    return (
                      <div key={day.toString()} className="border rounded-lg p-3">
                        <h3 className="font-semibold text-center mb-2">
                          {format(day, "eee, MMM d")}
                        </h3>

                        {getSchedulesForDate(day).length > 0 ? (
                          <ul className="space-y-2">
                            {getSchedulesForDate(day).map((s) => {
                              const site = sites.find((x) => x.name === s.siteName);
                              const status = statuses.get(s.siteName);
                              const siteColor = site?.color || "#888888";

                              return (
                                <li
  key={s.id}
  onClick={() => jumpToShiftDay(day)}
  className="bg-muted/50 rounded-md p-2 text-xs relative group cursor-pointer hover:bg-muted"
                                  style={{
                                    borderLeftColor: siteColor,
                                    borderLeftWidth: "2px",
                                  }}
                                >
                                  <div className="flex items-center gap-1">
  {status && getStatusIndicator(status, "weekly")}

  <Button
    variant="ghost"
    size="icon"
    className="h-6 w-6"
    onClick={(e) => {
      e.stopPropagation();
      handleOpenDialog(s, day);
    }}
  >
    <Edit className="h-3 w-3" />
  </Button>

  <Button
    variant="ghost"
    size="icon"
    className="h-6 w-6"
    onClick={(e) => {
      e.stopPropagation();

      if (s.repeatFrequency === "does-not-repeat") {
        deleteSchedule(s.id);
      } else {
        setDeleteTarget({
          open: true,
          schedule: s,
          occurrenceDate: day,
        });
      }
    }}
  >
    <Trash2 className="h-3 w-3 text-destructive" />
  </Button>
</div>

                                  <p className="my-1 text-muted-foreground truncate">{s.tasks}</p>

                                  {s.note && (
                                    <p
                                      className="text-xs my-1 italic text-amber-700 truncate"
                                      title={s.note}
                                    >
                                      <MessageSquare className="inline h-3 w-3 mr-1" />
                                      {s.note}
                                    </p>
                                  )}

                                  <div className="mt-1">{renderAssignmentBadges(s)}</div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <p className="text-xs text-center text-muted-foreground mt-4">
                            No tasks.
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* MONTHLY */}
        <TabsContent value="monthly">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle>Monthly Schedule</CardTitle>
                  <CardDescription>{format(currentDate, "MMMM yyyy")}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => changeDate(-1, "month")}
                  >
                    <ChevronLeft />
                  </Button>
                  <Button variant="outline" onClick={() => setCurrentDate(new Date())}>
                    This Month
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => changeDate(1, "month")}
                  >
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <ScrollArea className="h-[60vh]">
                <div className="grid grid-cols-7 border-t border-l">
                  {weekDays.map((day) => (
                    <div
                      key={day}
                      className="text-center font-bold p-2 border-b border-r text-sm"
                    >
                      {day.substring(0, 3)}
                    </div>
                  ))}

                  {Array.from({ length: startingBlankDays }).map((_, i) => (
                    <div key={`empty-${i}`} className="border-b border-r" />
                  ))}

                  {daysInMonth.map((day) => {
                    const statuses = getSiteStatuses(day);

                    return (
                      <div
                        key={day.toString()}
                        className="relative p-2 h-32 border-b border-r flex flex-col"
                      >
                        <span className={cn("font-semibold", isToday(day) && "text-blue-600")}>
                          {format(day, "d")}
                        </span>

                        <div className="flex-grow overflow-y-auto text-xs space-y-1 mt-1">
                          {getSchedulesForDate(day).map((s) => {
                            const site = sites.find((x) => x.name === s.siteName);
                            const status = statuses.get(s.siteName);
                            const siteColor = site?.color || "#888888";

                            const team = s.assignedTeamId
                              ? teamsById.get(s.assignedTeamId)
                              : null;
                            const assignedLabel = team
                              ? `Team: ${team.name}`
                              : (s.assignedTo || []).join(", ");

                            return (
                           
                                <div
  key={s.id}
  onClick={() => jumpToShiftDay(day)}
  className="rounded p-1 truncate flex items-center gap-1.5 relative group cursor-pointer hover:ring-1 hover:ring-primary"
                                style={{
                                  backgroundColor: site ? `${siteColor}33` : "var(--muted)",
                                }}
                                title={`${s.siteName}: ${s.tasks}\nAssigned: ${assignedLabel}`}
                              >
                                {status && getStatusIndicator(status, "monthly")}
                                <span
                                  className="font-semibold truncate flex-grow"
                                  style={{ color: siteColor }}
                                >
                                  {s.siteName}
                                </span>
                                <div className="absolute right-0 top-0.5 flex opacity-0 group-hover:opacity-100">
  <Button
    variant="ghost"
    size="icon"
    className="h-5 w-5"
    onClick={(e) => {
      e.stopPropagation();
      handleOpenDialog(s, day);
    }}
  >
    <Edit className="h-3 w-3" />
  </Button>

  <Button
    variant="ghost"
    size="icon"
    className="h-5 w-5"
    onClick={(e) => {
      e.stopPropagation();

      if (s.repeatFrequency === "does-not-repeat") {
        deleteSchedule(s.id);
      } else {
        setDeleteTarget({
          open: true,
          schedule: s,
          occurrenceDate: day,
        });
      }
    }}
  >
    <Trash2 className="h-3 w-3 text-destructive" />
  </Button>
</div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
        <Dialog
  open={fixModal.open}
  onOpenChange={(open) =>
    setFixModal((prev) => ({ ...prev, open }))
  }
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>
        Fix Shift — {fixModal.employeeName}
      </DialogTitle>
    </DialogHeader>

    <div className="space-y-4">
      <div>
        <Label>Clock In</Label>
        <Input
          type="datetime-local"
          value={fixIn}
          onChange={(e) => setFixIn(e.target.value)}
        />
      </div>

      <div>
        <Label>Clock Out</Label>
        <Input
          type="datetime-local"
          value={fixOut}
          onChange={(e) => setFixOut(e.target.value)}
        />
      </div>
    </div>

    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setFixModal({ open: false })}
      >
        Cancel
      </Button>
      <Button onClick={handleFixShift}>Save Fix</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
<Dialog
  open={deleteTarget.open}
  onOpenChange={(open) =>
    setDeleteTarget((prev) => ({ ...prev, open }))
  }
>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Delete Schedule</DialogTitle>
    </DialogHeader>

    <div className="space-y-3 text-sm">
      <p>
        What do you want to delete for{" "}
        <strong>{deleteTarget.schedule?.siteName}</strong>?
      </p>

      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => handleDeleteScheduleChoice("single")}
        disabled={!deleteTarget.occurrenceDate}
      >
        This occurrence only
      </Button>

      <Button
        variant="outline"
        className="w-full justify-start"
        onClick={() => handleDeleteScheduleChoice("future")}
        disabled={!deleteTarget.occurrenceDate}
      >
        This and future occurrences
      </Button>

      <Button
        variant="destructive"
        className="w-full justify-start"
        onClick={() => handleDeleteScheduleChoice("series")}
      >
        Entire series
      </Button>
    </div>

    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => setDeleteTarget({ open: false })}
      >
        Cancel
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
      </Tabs>
    </TooltipProvider>
  );
}
