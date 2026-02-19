"use client";

import React, { useMemo, useState, useCallback } from "react";
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
  Power,
  User,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  FilePenLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

interface EmployeeViewProps {
  employee: Employee;
  onLogout: () => void;
  settings: Settings;
  recordEntry: (
    action: "in" | "out",
    site: Site,
    entryTime: Date,
    note: string,
    employeeId?: string,
    isManagerOverride?: boolean
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

  if (diff === 0) return "Today";
  if (diff === -1) return "Yesterday";
  if (diff === 1) return "Tomorrow";

  return format(date, "EEEE, MMMM d, yyyy");
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

  const [isNoteDialogOpen, setIsNoteDialogOpen] = useState(false);
  const [editingNoteForSchedule, setEditingNoteForSchedule] = useState<CleaningSchedule | null>(null);
  const [currentNote, setCurrentNote] = useState("");

  const [isTimesheetDialogOpen, setIsTimesheetDialogOpen] = useState(false);
  const [timesheetData, setTimesheetData] = useState<{
    period?: PayrollPeriod;
    sessions: Session[];
  }>({ sessions: [] });

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
  s.assignedTo?.includes(employee.name) ?? false;

const employeeTeamId =
  (employee as any).teamId as string | undefined;

const isAssignedViaTeam =
  !!s.assignedTeamId &&
  !!employeeTeamId &&
  s.assignedTeamId === employeeTeamId;

const isAssigned = isAssignedDirect || isAssignedViaTeam;

if (!isAssigned) return false;

      const schStart = parseISO(s.startDate);
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

  // Off-schedule active shifts (for today only)
  const offScheduleActiveShifts = useMemo(() => {
    if (!isSameDay(currentDate, new Date())) return [];

    const scheduledSiteNames = new Set(scheduleForDay(currentDate).map((s) => s.siteName));

    return sessionsForEmployee.filter((s) => s.active && s.in?.site && !scheduledSiteNames.has(s.in.site));
  }, [sessionsForEmployee, currentDate, schedules]);

  const weeklySchedule = useMemo(() => {
    const startOfUserWeek = startOfWeek(today, { weekStartsOn: settings.weekStartsOn });
    const week: Array<{ date: Date; schedules: CleaningSchedule[] }> = [];

    for (let i = 0; i < 7; i++) {
      const day = add(startOfUserWeek, { days: i });
      week.push({ date: day, schedules: scheduleForDay(day) });
    }
    return week;
  }, [schedules, employee.name, today, settings.weekStartsOn]);

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
      return sessionsForEmployee.some((s) => {
        if (!s.active || !s.in) return false;
        if ((s.in.site || "") !== siteName) return false;

        // If it overlaps the day, it's open "for that day"
        return sessionMinutesOnDay(s, forDate, Date.now()) > 0;
      });
    },
    [sessionsForEmployee]
  );

  const handleClockInOut = useCallback(
    (action: "in" | "out", siteName: string) => {
      const site = settings.sites.find((s) => s.name === siteName);
      if (!site) {
        toast({ variant: "destructive", title: "Site not found." });
        return;
      }

      const isPastDay = isBefore(startOfDay(currentDate), startOfToday());
      const isFutureDay = isBefore(startOfToday(), startOfDay(currentDate));

      if (action === "in") {
        // Always enforce no overlapping shifts
        const activeSomewhere = isClockedIn(undefined, employee.id);
        const activeHere = isClockedIn(siteName, employee.id);

        if (!isManagerPreview && activeSomewhere && !activeHere) {
          toast({
            variant: "destructive",
            title: "You are already clocked in.",
            description: "Please clock out from your current job before starting another.",
          });
          return;
        }

        const isOverrideForIn = isPastDay || isFutureDay || isManagerPreview;

        recordEntry("in", site, currentDate, "", employee.id, isOverrideForIn);
        return;
      }

      // action === "out"
      const isOverrideForOut = isPastDay || isFutureDay || isManagerPreview;
      recordEntry("out", site, currentDate, "", employee.id, isOverrideForOut);
    },
    [settings.sites, isClockedIn, employee.id, currentDate, recordEntry, toast, isManagerPreview]
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

  const currentSiteStatuses = useMemo(() => getSiteStatuses(currentDate), [getSiteStatuses, currentDate]);

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


  return (
    <>
      <Card className="mb-6">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Welcome, {employee.name}</CardTitle>
            {!isManagerPreview && (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsProfileOpen(true)}>
                  <User className="mr-2" /> My Profile
                </Button>
                <Button variant="ghost" size="sm" onClick={onLogout}>
                  <Power className="mr-2" /> Logout
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

      <Tabs defaultValue="schedule" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="schedule">Schedule & Actions</TabsTrigger>
          <TabsTrigger value="activity">Recent Activity</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
        </TabsList>

        {/* SCHEDULE TAB */}
        <TabsContent value="schedule" className="mt-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hours Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-medium">Your Hours Worked</CardTitle>
                <CardDescription>Based on your completed shifts.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="week">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="today">Today</TabsTrigger>
                    <TabsTrigger value="week">This Week</TabsTrigger>
                    <TabsTrigger value="month">This Month</TabsTrigger>
                  </TabsList>
                  <TabsContent value="today" className="pt-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{totalHoursToday.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">hours today</p>
                    </div>
                  </TabsContent>
                  <TabsContent value="week" className="pt-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{totalHoursThisWeek.toFixed(2)}</p>
                      <p className="text-sm text-muted-foreground">hours this week</p>
                    </div>
                  </TabsContent>
                  <TabsContent value="month" className="pt-4">
                    <div className="text-center">
                      <p className="text-3xl font-bold">{totalHoursThisMonth.toFixed(2)}</p>
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
                <CardContent>
                  <Tabs defaultValue="daily">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="daily">Daily</TabsTrigger>
                      <TabsTrigger value="weekly">Weekly</TabsTrigger>
                    </TabsList>

                    {/* DAILY VIEW */}
                    <TabsContent value="daily">
                      <div className="flex justify-between items-center my-2">
                        <h3 className="font-semibold flex items-center gap-2">{formatDateHeader(currentDate)}</h3>
                        <div className="flex gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeDay(-1)}>
                            <ChevronLeft />
                          </Button>
                          <Button
                            variant={isSameDay(currentDate, startOfDay(new Date())) ? "default" : "outline"}
                            className="h-7"
                            onClick={() => setCurrentDate(startOfDay(new Date()))}
                          >
                            Today
                          </Button>
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => changeDay(1)}>
                            <ChevronRight />
                          </Button>
                        </div>
                      </div>

                      <ScrollArea className="h-72">
                        {scheduleForDay(currentDate).length > 0 ||
                        (isCurrentDayToday && offScheduleActiveShifts.length > 0) ? (
                          <ul className="space-y-4">
                            {scheduleForDay(currentDate).map((schedule) => {
                              const scheduleSite = settings.sites.find((s) => s.name === schedule.siteName);

                              const clockedInAtThisSite = hasOpenShiftForSiteOnDate(schedule.siteName, currentDate);

                              const siteBonus =
                                scheduleSite?.bonusType && scheduleSite.bonusAmount
                                  ? scheduleSite.bonusType === "hourly"
                                    ? ` (+$${scheduleSite.bonusAmount.toFixed(2)}/hr)`
                                    : ` (+$${scheduleSite.bonusAmount.toFixed(2)} flat)`
                                  : "";

                              const status = currentSiteStatuses.get(schedule.siteName);
                              const clockInDisabled = status === "complete";

                              const hoursSpent =
                                status === "complete" ? getHoursForSiteDay(schedule.siteName, currentDate) : undefined;

                              return (
                                <li
                                  key={schedule.id}
                                  className="p-3 rounded-md border bg-muted/20"
                                  style={{
                                    borderLeftColor: scheduleSite?.color,
                                    borderLeftWidth: "4px",
                                  }}
                                >
                                  <div className="flex justify-between items-start">
                                    <p className="font-semibold" style={{ color: scheduleSite?.color }}>
                                      {schedule.siteName}
                                      {siteBonus && <span className="text-xs font-normal text-green-600">{siteBonus}</span>}
                                    </p>
                                    {getStatusIndicator(status, hoursSpent)}
                                  </div>

                                  <p className="text-sm text-muted-foreground my-1">{schedule.tasks}</p>

                                  {asNoteText(schedule.note) && (
                                    <p className="text-sm my-2 p-2 bg-amber-100 dark:bg-amber-900/50 border-l-4 border-amber-500 rounded-r-md">
                                      {asNoteText(schedule.note)}
                                    </p>
                                  )}

                                  <div className="flex gap-2 mt-2 flex-wrap">
                                    {clockedInAtThisSite ? (
                                      <Button
                                        size="sm"
                                        variant="destructive"
                                        onClick={() => handleClockInOut("out", schedule.siteName)}
                                        disabled={isManagerPreview}
                                      >
                                        <LogOut className="mr-2 h-4 w-4" />
                                        Clock Out
                                      </Button>
                                    ) : (
                                      <Button
                                        size="sm"
                                        onClick={() => handleClockInOut("in", schedule.siteName)}
                                        disabled={isManagerPreview || clockInDisabled}
                                      >
                                        <LogIn className="mr-2 h-4 w-4" />
                                        Clock In
                                      </Button>
                                    )}

                                    {scheduleSite?.address && (
                                      <Button asChild size="sm" variant="outline">
                                        <a
                                          href={`https://maps.google.com/?q=${encodeURIComponent(scheduleSite.address)}`}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <ExternalLink className="mr-2 h-4 w-4" /> Map
                                        </a>
                                      </Button>
                                    )}

                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleOpenNoteDialog(schedule)}
                                      disabled={isManagerPreview}
                                    >
                                      <FilePenLine className="mr-2 h-4 w-4" />
                                      Note
                                    </Button>
                                  </div>
                                </li>
                              );
                            })}
                          </ul>
                        ) : (
                          <div className="flex items-center justify-center h-24 text-muted-foreground">
                            You have no scheduled tasks for this day.
                          </div>
                        )}
                      </ScrollArea>
                    </TabsContent>

                    {/* WEEKLY VIEW */}
                    <TabsContent value="weekly">
                      <ScrollArea className="h-60">
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

        {/* ACTIVITY TAB */}
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Your Recent Activity</CardTitle>
              <CardDescription>Your last 20 clock-in/out events.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
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
         teams={teams}
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
    </>
  );
}
