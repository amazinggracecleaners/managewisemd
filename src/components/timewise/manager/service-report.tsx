"use client";

import React, { useMemo, useState } from "react";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfDay,
  endOfDay,
  differenceInCalendarWeeks,
  getDate,
  getMonth,
  getYear,
  subMonths,
} from "date-fns";

import type {
  CleaningSchedule,
  Employee,
  Entry,
  Site,
  DayOfWeek,
} from "@/shared/types/domain";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  schedules: CleaningSchedule[];
  entries: Entry[];
  employees: Employee[];
  sites: Site[];
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

type ScheduleOccurrence = {
  scheduleId: string;
  scheduleDate: string;
  siteName: string;
  assignedEmployeeIds: string[];
};

function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows
    .map((row) =>
      row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

function scheduleOccursOnDate(
  schedule: CleaningSchedule,
  date: Date,
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6
) {
  if (!schedule.startDate) return false;

  const dateStr = format(date, "yyyy-MM-dd");
  const schStart = parseISO(schedule.startDate);

  if (schedule.exceptionDates?.includes(dateStr)) return false;
  if (date < startOfDay(schStart)) return false;
  if (schedule.repeatUntil && date > endOfDay(parseISO(schedule.repeatUntil))) {
    return false;
  }

  const monthDiff =
    (getYear(date) - getYear(schStart)) * 12 +
    (getMonth(date) - getMonth(schStart));

  switch (schedule.repeatFrequency) {
    case "does-not-repeat":
      return dateStr === schedule.startDate;

    case "weekly":
    case "every-2-weeks":
    case "every-3-weeks": {
      const dayName = format(date, "EEEE") as DayOfWeek;
      if (!schedule.daysOfWeek?.includes(dayName)) return false;

      const weekDiff = differenceInCalendarWeeks(date, schStart, {
        weekStartsOn,
      });

      if (weekDiff < 0) return false;
      if (schedule.repeatFrequency === "weekly") return true;
      if (schedule.repeatFrequency === "every-2-weeks") return weekDiff % 2 === 0;
      if (schedule.repeatFrequency === "every-3-weeks") return weekDiff % 3 === 0;

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
}

function isOccurrenceCompleted(
  occurrence: ScheduleOccurrence,
  entries: Entry[]
) {
  return entries.some((e) => {
    if (e.action !== "out") return false;

    // New accurate logic
    if (e.scheduleId && e.scheduleDate) {
      return (
        e.scheduleId === occurrence.scheduleId &&
        e.scheduleDate === occurrence.scheduleDate
      );
    }

    // Backward compatibility for old entries
    const entryDate = format(new Date(e.ts), "yyyy-MM-dd");

    return (
      e.site === occurrence.siteName &&
      entryDate === occurrence.scheduleDate
    );
  });
}

export function ServiceReport({
  schedules,
  entries,
  employees,
  sites,
  weekStartsOn,
}: Props) {
  const today = new Date();

  const [fromDate, setFromDate] = useState(
    format(startOfMonth(today), "yyyy-MM-dd")
  );

  const [toDate, setToDate] = useState(
    format(endOfMonth(today), "yyyy-MM-dd")
  );
const [selectedSiteName, setSelectedSiteName] = useState<string | null>(null);

  const report = useMemo(() => {
    const from = parseISO(fromDate);
    const to = parseISO(toDate);

    const days = eachDayOfInterval({
      start: startOfDay(from),
      end: startOfDay(to),
    });

    

    const occurrences: ScheduleOccurrence[] = [];

    for (const day of days) {
      const scheduleDate = format(day, "yyyy-MM-dd");

      for (const schedule of schedules) {
        if (!scheduleOccursOnDate(schedule, day, weekStartsOn)) continue;

        occurrences.push({
          scheduleId: schedule.id,
          scheduleDate,
          siteName: schedule.siteName,
          assignedEmployeeIds: schedule.assignedEmployeeIds ?? [],
        });
      }
    }

    
    const siteRows = sites.map((site) => {
      const siteOccurrences = occurrences.filter(
        (o) => o.siteName === site.name
      );

      const scheduled = siteOccurrences.length;

      const completed = siteOccurrences.filter((o) =>
  isOccurrenceCompleted(o, entries)
).length;

      const missed = Math.max(0, scheduled - completed);
      const rate = scheduled > 0 ? (completed / scheduled) * 100 : 0;

      return {
        siteName: site.name,
        scheduled,
        completed,
        missed,
        rate,
      };
    });

    const employeeRows = employees.map((employee) => {
      const employeeOccurrences = occurrences.filter((o) =>
        o.assignedEmployeeIds.includes(employee.id)
      );

      const assigned = employeeOccurrences.length;

      const completed = employeeOccurrences.filter((o) =>
  entries.some((e) => {
    if (e.employeeId !== employee.id) return false;
    if (e.action !== "out") return false;

    if (e.scheduleId && e.scheduleDate) {
      return e.scheduleId === o.scheduleId && e.scheduleDate === o.scheduleDate;
    }

    const entryDate = format(new Date(e.ts), "yyyy-MM-dd");

    return e.site === o.siteName && entryDate === o.scheduleDate;
  })
).length;

      const missed = Math.max(0, assigned - completed);
      const rate = assigned > 0 ? (completed / assigned) * 100 : 0;

      return {
        employeeName: employee.name,
        assigned,
        completed,
        missed,
        rate,
      };
    });

    const totalScheduled = siteRows.reduce((sum, r) => sum + r.scheduled, 0);
    const totalCompleted = siteRows.reduce((sum, r) => sum + r.completed, 0);
    const totalMissed = siteRows.reduce((sum, r) => sum + r.missed, 0);
    const completionRate =
      totalScheduled > 0 ? (totalCompleted / totalScheduled) * 100 : 0;

    return {
      occurrences,
      siteRows,
      employeeRows,
      totalScheduled,
      totalCompleted,
      totalMissed,
      completionRate,
    };
  }, [fromDate, toDate, schedules, entries, employees, sites, weekStartsOn]);

  const selectedSiteOccurrences = selectedSiteName
  ? report.occurrences
      .filter((o) => o.siteName === selectedSiteName)
      .sort((a, b) =>
        a.scheduleDate.localeCompare(b.scheduleDate)
      )
  : [];

  const setThisMonth = () => {
    setFromDate(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    setToDate(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  };

  const setLastMonth = () => {
    const lastMonth = subMonths(new Date(), 1);
    setFromDate(format(startOfMonth(lastMonth), "yyyy-MM-dd"));
    setToDate(format(endOfMonth(lastMonth), "yyyy-MM-dd"));
  };

  const exportSiteCSV = () => {
    downloadCSV("service-report-sites.csv", [
      ["Period", `${fromDate} to ${toDate}`],
      [],
      ["Site", "Scheduled Visits", "Completed Visits", "Missed Visits", "Completion Rate"],
      ...report.siteRows.map((r) => [
        r.siteName,
        String(r.scheduled),
        String(r.completed),
        String(r.missed),
        `${r.rate.toFixed(2)}%`,
      ]),
    ]);
  };

  const exportEmployeeCSV = () => {
    downloadCSV("service-report-employees.csv", [
      ["Period", `${fromDate} to ${toDate}`],
      [],
      ["Employee", "Assigned Shifts", "Completed Shifts", "Missed Shifts", "Completion Rate"],
      ...report.employeeRows.map((r) => [
        r.employeeName,
        String(r.assigned),
        String(r.completed),
        String(r.missed),
        `${r.rate.toFixed(2)}%`,
      ]),
    ]);
  };

  const exportDetailCSV = () => {
    downloadCSV("service-report-details.csv", [
      ["Period", `${fromDate} to ${toDate}`],
      [],
      ["Date", "Site", "Schedule ID", "Status"],
      ...report.occurrences.map((o) => {
        const completed = isOccurrenceCompleted(o, entries);

        return [
          o.scheduleDate,
          o.siteName,
          o.scheduleId,
          completed ? "Complete" : "Missed",
        ];
      }),
    ]);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Service Report</CardTitle>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-medium">From</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs font-medium">To</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>

            <Button variant="outline" onClick={setThisMonth}>
              This Month
            </Button>

            <Button variant="outline" onClick={setLastMonth}>
              Last Month
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button onClick={exportSiteCSV}>Download Site CSV</Button>
            <Button variant="outline" onClick={exportEmployeeCSV}>
              Download Employee CSV
            </Button>
            <Button variant="outline" onClick={exportDetailCSV}>
              Download Detail CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Scheduled Visits</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {report.totalScheduled}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Completed Visits</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {report.totalCompleted}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Missed Visits</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {report.totalMissed}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">
            {report.completionRate.toFixed(2)}%
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Site Performance</CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Scheduled</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Missed</TableHead>
                <TableHead>Rate</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {report.siteRows.map((row) => (
                <TableRow
  key={row.siteName}
  className="cursor-pointer"
  onClick={() => setSelectedSiteName(row.siteName)}
>
                  <TableCell>{row.siteName}</TableCell>
                  <TableCell>{row.scheduled}</TableCell>
                  <TableCell>{row.completed}</TableCell>
                  <TableCell>{row.missed}</TableCell>
                  <TableCell>{row.rate.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

 {selectedSiteName && (
  <Card>
    <CardHeader>
      <CardTitle>{selectedSiteName}</CardTitle>
    </CardHeader>

    <CardContent>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {selectedSiteOccurrences.map((o) => {
            const completed = isOccurrenceCompleted(o, entries);

            return (
              <TableRow key={`${o.scheduleId}-${o.scheduleDate}`}>
                <TableCell>{o.scheduleDate}</TableCell>
                <TableCell>
                  {completed ? "Complete" : "Missed"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
)}

      <Card>
        <CardHeader>
          <CardTitle>Employee Performance</CardTitle>
        </CardHeader>

        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Missed</TableHead>
                <TableHead>Rate</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {report.employeeRows.map((row) => (
                <TableRow key={row.employeeName}>
                  <TableCell>{row.employeeName}</TableCell>
                  <TableCell>{row.assigned}</TableCell>
                  <TableCell>{row.completed}</TableCell>
                  <TableCell>{row.missed}</TableCell>
                  <TableCell>{row.rate.toFixed(2)}%</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}