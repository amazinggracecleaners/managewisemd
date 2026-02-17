// src/components/timewise/manager/schedule-view.tsx
"use client";

import React, { useMemo, useState } from "react";
import type {
  Site,
  CleaningSchedule,
  DayOfWeek,
  Employee,
  BillingFrequency,
  RepeatFrequency,
  SiteStatus,
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
import { cn, cleanForFirestore } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

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
    note?: string,
    employeeId?: string,
    isManagerOverride?: boolean
  ) => Promise<void>;
  isClockedIn: (siteName?: string, employeeId?: string) => boolean;
  getDurationsBySite: (
    forDate: Date
  ) => Map<string, { minutes: number; byEmployee: Record<string, number> }>;

  // ✅ teams come from settings.teams (passed from ManagerView)
  teams: Team[];
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
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "eeee, MMMM d, yyyy");
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
}: ScheduleViewProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] =
    useState<CleaningSchedule | null>(null);

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

  // editing scope + occurrence (for “edit single day of series”)
  const [applyScope, setApplyScope] = useState<"single" | "series">("series");
  const [editingOccurrenceDate, setEditingOccurrenceDate] = useState<
    Date | undefined
  >(undefined);

  const goPrev = () => setCurrentDate((d) => addDays(d, -1));
  const goNext = () => setCurrentDate((d) => addDays(d, 1));
  const goToday = () => setCurrentDate(startOfDay(new Date()));

  const teamsById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const employeeMap = useMemo(
    () => new Map(employees.map((e) => [e.name, e])),
    [employees]
  );

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
      setApplyScope(occurrenceDate ? "single" : "series");
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

  const handleSubmit = () => {
    if (!siteName || !tasks || !startDate || !validateAssignment()) {
      alert(
        "Please fill out required fields: Site, Start Date, Tasks, and Assignment (Team or Employees)."
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

    const baseData: Omit<CleaningSchedule, "id"> = {
      siteName,
      tasks,
      note,

      // ✅ mutually exclusive assignment
      assignedTeamId: assignMode === "team" ? assignedTeamId : undefined,
      assignedTo: assignMode === "team" ? [] : assignedTo,

      startDate: format(startDate, "yyyy-MM-dd"),
      repeatFrequency,
      daysOfWeek: repeatFrequency.includes("week") ? daysOfWeek : undefined,
      repeatUntil: repeatUntil ? format(repeatUntil, "yyyy-MM-dd") : undefined,

      servicePrice,
      billingFrequency,
    };

    const cleanedData = cleanForFirestore(baseData) as Omit<
      CleaningSchedule,
      "id"
    >;

    if (editingSchedule) {
      const hasOccurrenceContext =
        !!editingOccurrenceDate &&
        editingSchedule.repeatFrequency !== "does-not-repeat";

      // 🧩 “This day only” = add exception + create one-off schedule
      if (hasOccurrenceContext && applyScope === "single") {
        const dateStr = format(editingOccurrenceDate!, "yyyy-MM-dd");

        const existingExceptions =
          (editingSchedule.exceptionDates as string[] | undefined) || [];
        const newExceptions = Array.from(
          new Set([...existingExceptions, dateStr])
        );

        updateSchedule(editingSchedule.id, { exceptionDates: newExceptions });

        const singleOccurrenceData: Omit<CleaningSchedule, "id"> = {
          ...baseData,
          startDate: dateStr,
          repeatFrequency: "does-not-repeat",
          daysOfWeek: undefined,
          repeatUntil: undefined,
        };

        addSchedule(
          cleanForFirestore(singleOccurrenceData) as Omit<CleaningSchedule, "id">
        );
      } else {
        // 🔁 entire series
        updateSchedule(editingSchedule.id, cleanedData);
      }
    } else {
      // ➕ new schedule
      addSchedule(cleanedData);
    }

    setIsDialogOpen(false);
    setEditingOccurrenceDate(undefined);
    setApplyScope("series");
  };

  const getSchedulesForDate = (date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd");

    return schedules.filter((s) => {
      if (!s.startDate) return false;
      const schStart = parseISO(s.startDate);

      // 🚫 skip exception dates
      if (s.exceptionDates?.includes(dateStr)) return false;

      if (date < startOfDay(schStart)) return false;
      if (s.repeatUntil && date > parseISO(s.repeatUntil)) return false;

      const monthDiff =
        (getYear(date) - getYear(schStart)) * 12 +
        (getMonth(date) - getMonth(schStart));

      switch (s.repeatFrequency) {
        case "does-not-repeat":
          return isSameDay(date, schStart);

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
          return (
            getDate(date) === getDate(schStart) &&
            monthDiff >= 0 &&
            monthDiff % 2 === 0
          );

        case "quarterly":
          return (
            getDate(date) === getDate(schStart) &&
            monthDiff >= 0 &&
            monthDiff % 3 === 0
          );

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

  const handleRemoveEmployeeFromSchedule = (
    scheduleId: string,
    employeeName: string
  ) => {
    if (
      !window.confirm(
        `Are you sure you want to remove ${employeeName} from this schedule?`
      )
    )
      return;

    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return;

    const updatedAssignedTo = (schedule.assignedTo || []).filter(
      (name) => name !== employeeName
    );
    updateSchedule(scheduleId, { assignedTo: updatedAssignedTo });
  };

  const dailySchedules = getSchedulesForDate(currentDate);
  const dailySiteCount = new Set(dailySchedules.map((s) => s.siteName)).size;

  const dailyStatuses = useMemo(
    () => getSiteStatuses(currentDate),
    [getSiteStatuses, currentDate]
  );

  const { completeCount, incompleteCount, inProcessCount } = useMemo(() => {
    const siteNamesForToday = new Set(dailySchedules.map((s) => s.siteName));

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
  }, [dailySchedules, dailyStatuses]);

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
        {(s.assignedTo || []).map((name) => {
          const emp = employeeMap.get(name);
          return (
            <Badge
              key={name}
              variant="secondary"
              className="text-xs"
              style={
                emp?.color
                  ? { backgroundColor: emp.color, color: "white" }
                  : {}
              }
            >
              {name}
            </Badge>
          );
        })}
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Tabs defaultValue="list" className="w-full">
        <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="list">List</TabsTrigger>
            <TabsTrigger value="daily">Daily</TabsTrigger>
            <TabsTrigger value="weekly">Weekly</TabsTrigger>
            <TabsTrigger value="monthly">Monthly</TabsTrigger>
          </TabsList>

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => handleOpenDialog()}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Schedule
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
                            {employees.map((emp) => (
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

                  {/* scope selector (only when editing a single occurrence of a repeating schedule) */}
                  {editingSchedule &&
                    editingOccurrenceDate &&
                    editingSchedule.repeatFrequency !== "does-not-repeat" && (
                      <div className="space-y-2">
                        <Label>Apply changes to</Label>
                        <RadioGroup
                          value={applyScope}
                          onValueChange={(v) =>
                            setApplyScope(v as "single" | "series")
                          }
                          className="flex flex-col gap-2 sm:flex-row"
                        >
                          <Label
                            htmlFor="scope-single"
                            className="flex items-center space-x-2 rounded-md border px-3 py-2 cursor-pointer"
                          >
                            <RadioGroupItem id="scope-single" value="single" />
                            <span className="text-sm">
                              This day only (
                              {format(editingOccurrenceDate, "yyyy-MM-dd")})
                            </span>
                          </Label>

                          <Label
                            htmlFor="scope-series"
                            className="flex items-center space-x-2 rounded-md border px-3 py-2 cursor-pointer"
                          >
                            <RadioGroupItem id="scope-series" value="series" />
                            <span className="text-sm">
                              All future days in this schedule
                            </span>
                          </Label>
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
                    {schedules.length > 0 ? (
                      schedules
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
                                {schedule.repeatUntil
                                  ? schedule.repeatUntil
                                  : "Ongoing"}
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
                                  onClick={() => deleteSchedule(schedule.id)}
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
                      dailySchedules.map((s) => s.siteName)
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
              <ScrollArea className="h-[60vh]">
                {dailySchedules.length > 0 ? (
                  <div className="space-y-4">
                    {dailySchedules.map((s) => {
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
                                  const mins =
                                    durationsForCurrentDate.get(s.siteName)
                                      ?.minutes ?? 0;
                                  return mins > 0 ? (
                                    <span className="text-xs text-muted-foreground">
                                      • {formatHHMM(mins)}
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
                              (s.assignedTo || []).map((empName) => {
                                const emp = employeeMap.get(empName);
                                if (!emp || !site) return null;

                                const siteDuration = durationsForCurrentDate.get(
                                  s.siteName
                                );
                                const empMinutes =
                                  siteDuration?.byEmployee?.[empName] ?? 0;
                                const formattedEmpTime =
                                  empMinutes > 0 ? formatHHMM(empMinutes) : null;

                                const clocked = isClockedIn(s.siteName, emp.id);

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
                                      {formattedEmpTime && (
                                        <span className="text-xs text-muted-foreground">
                                          • {formattedEmpTime}
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 opacity-0 group-hover:opacity-100"
                                        onClick={() =>
                                          handleRemoveEmployeeFromSchedule(
                                            s.id,
                                            empName
                                          )
                                        }
                                      >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                      </Button>

                                      {clocked ? (
                                        <Button
                                          variant="destructive"
                                          size="sm"
                                          onClick={() =>
                                            recordEntry(
                                              "out",
                                              site,
                                              currentDate,
                                              undefined,
                                              emp.id,
                                              true
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
                                          onClick={() =>
                                            recordEntry(
                                              "in",
                                              site,
                                              currentDate,
                                              undefined,
                                              emp.id,
                                              true
                                            )
                                          }
                                          disabled={status === "complete"}
                                        >
                                          <LogIn className="mr-1 h-4 w-4" />
                                          Clock In
                                        </Button>
                                      )}
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
                                  className="bg-muted/50 rounded-md p-2 text-xs relative group"
                                  style={{
                                    borderLeftColor: siteColor,
                                    borderLeftWidth: "2px",
                                  }}
                                >
                                  <div className="flex justify-between items-center">
                                    <p className="font-bold" style={{ color: siteColor }}>
                                      {s.siteName}
                                    </p>
                                    <div className="flex items-center">
                                      {status && getStatusIndicator(status, "weekly")}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => handleOpenDialog(s)}
                                      >
                                        <Edit className="h-3 w-3" />
                                      </Button>
                                    </div>
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
                                className="rounded p-1 truncate flex items-center gap-1.5 relative group"
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
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-5 w-5 absolute right-0 top-0.5 opacity-0 group-hover:opacity-100"
                                  onClick={() => handleOpenDialog(s)}
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
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
      </Tabs>
    </TooltipProvider>
  );
}
