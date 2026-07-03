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
  ServiceFeedback,
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
  serviceFeedbacks: ServiceFeedback[];
  onAddServiceFeedbackAction: (
    feedback: Omit<ServiceFeedback, "id">
  ) => void;
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
  serviceFeedbacks,
   onAddServiceFeedbackAction,
}: Props) {
  const today = new Date();

  const [fromDate, setFromDate] = useState(
    format(startOfMonth(today), "yyyy-MM-dd")
  );

  const [toDate, setToDate] = useState(
    format(endOfMonth(today), "yyyy-MM-dd")
  );
const [selectedSiteName, setSelectedSiteName] = useState<string | null>(null);
const [feedbackFor, setFeedbackFor] = useState<ScheduleOccurrence | null>(null);
const [feedbackType, setFeedbackType] = useState<"complaint" | "compliment">("complaint");
const [feedbackCategory, setFeedbackCategory] = useState("Floors");
const [feedbackNotes, setFeedbackNotes] = useState("");
const [feedbackResolved, setFeedbackResolved] = useState(false);
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

  const feedbackInRange = useMemo(() => {
  return (serviceFeedbacks || []).filter((f) => {
    return f.scheduleDate >= fromDate && f.scheduleDate <= toDate;
  });
}, [serviceFeedbacks, fromDate, toDate]);

const complaints = feedbackInRange.filter((f) => f.type === "complaint");
const compliments = feedbackInRange.filter((f) => f.type === "compliment");
const complaintRate =
  report.totalScheduled > 0
    ? (complaints.length / report.totalScheduled) * 100
    : 0;

const topComplaintCategories = Object.entries(
  complaints.reduce((acc, f) => {
    const category = f.category || "Other";
    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>)
)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8);

const recentFeedback = feedbackInRange
  .slice()
  .sort((a, b) => b.scheduleDate.localeCompare(a.scheduleDate))
  .slice(0, 5);

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

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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

        <Card className="bg-gradient-to-br from-red-50 to-white shadow-sm">
  <CardHeader>
    <CardTitle className="text-sm text-red-700">Complaint Rate</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="text-2xl font-bold text-red-600">
      {complaintRate.toFixed(2)}%
    </div>
    <div className="text-xs text-muted-foreground">
      {complaints.length} of {report.totalScheduled} visits
    </div>
  </CardContent>
</Card>

            </div>

      <Card className="border-0 bg-gradient-to-br from-purple-50 via-white to-blue-50 shadow-lg">
  <CardHeader>
    <CardTitle className="text-2xl font-bold text-purple-800">
      Service Quality & Client Satisfaction
    </CardTitle>
  </CardHeader>

  <CardContent className="space-y-5">
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="rounded-xl border bg-gradient-to-br from-red-100 via-red-50 to-white p-4 shadow-md transition-all hover:shadow-xl">
        <div className="text-sm text-red-700">Complaints</div>
        <div className="text-3xl font-bold text-red-600">{complaints.length}</div>
      </div>

      <div className="rounded-xl border bg-gradient-to-br from-green-100 via-green-50 to-white p-4 shadow-md transition-all hover:shadow-xl">
        <div className="text-sm text-green-700">Compliments</div>
        <div className="text-3xl font-bold text-green-600">{compliments.length}</div>
      </div>

      <div className="rounded-xl border bg-gradient-to-br from-blue-100 via-blue-50 to-white p-4 shadow-md transition-all hover:shadow-xl">
        <div className="text-sm text-blue-700">Top Issue</div>
        <div className="text-xl font-bold text-blue-700">
          {topComplaintCategories[0]?.[0] || "No complaints"}
        </div>
      </div>

      <div className="rounded-xl border bg-gradient-to-br from-orange-100 via-orange-50 to-white p-4 shadow-md transition-all hover:shadow-xl">
        <div className="text-sm text-orange-700">Complaint Rate</div>
       <div
  className={
    complaintRate >= 10
      ? "text-3xl font-bold text-red-600"
      : complaintRate >= 5
      ? "text-3xl font-bold text-orange-600"
      : complaintRate >= 2
      ? "text-3xl font-bold text-yellow-600"
      : "text-3xl font-bold text-green-600"
  }
>
          {complaintRate.toFixed(2)}%
        </div>
        <div className="text-xs text-muted-foreground">
          {complaints.length} of {report.totalScheduled} visits
        </div>
      </div>
    </div>

    <div>
      <h4 className="font-semibold mb-3">Top Complaint Categories</h4>

      {topComplaintCategories.length ? (
        <div className="space-y-3">
          {topComplaintCategories.map(([category, count]) => {
            const percent =
              complaints.length > 0 ? (count / complaints.length) * 100 : 0;

            return (
              <div key={category} className="rounded-lg border bg-white p-3">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="flex items-center gap-2">
  <span
    className={
      count >= 10
        ? "h-3 w-3 rounded-full bg-red-500"
        : count >= 5
        ? "h-3 w-3 rounded-full bg-orange-500"
        : count >= 2
        ? "h-3 w-3 rounded-full bg-yellow-500"
        : "h-3 w-3 rounded-full bg-green-500"
    }
  />
  {category}
</span>
                  <span className="font-semibold">
                    {count} ({percent.toFixed(0)}%)
                  </span>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-red-500"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
        No complaints for this period.
        </p>
      )}
    </div>
    <div>
  <h4 className="font-semibold mb-3">Recent Feedback</h4>

  {recentFeedback.length ? (
    <div className="space-y-3">
      {recentFeedback.map((f) => (
        <div
          key={f.id}
          className="rounded-lg border bg-white p-3 text-sm shadow-sm"
        >
          <div className="flex justify-between gap-3">
            <div className="font-medium">
              {format(parseISO(f.scheduleDate), "MMM d, yyyy")} — {f.siteName}
            </div>

            <span
              className={
                f.type === "complaint"
                  ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700"
                  : "rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700"
              }
            >
              {f.type}
            </span>
          </div>

          <div className="mt-1 font-semibold">
            {f.category || "Other"}
          </div>

          {f.notes && (
            <div className="mt-1 text-muted-foreground">
              {f.notes}
            </div>
          )}

          <div className="mt-2">
  {f.resolved ? (
    <span className="rounded-full bg-green-100 px-2 py-1 text-xs text-green-700">
      Resolved
    </span>
  ) : (
    <span className="rounded-full bg-red-100 px-2 py-1 text-xs text-red-700">
      Open
    </span>
  )}
</div>

        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">
      No recent feedback for this period.
    </p>
  )}
</div>
  </CardContent>
</Card>

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
                <TableHead>Complaint Rate</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
             {report.siteRows.map((row) => {
  const siteComplaints = complaints.filter(
    (c) => c.siteName === row.siteName
  );

  const siteComplaintRate =
    row.scheduled > 0 ? (siteComplaints.length / row.scheduled) * 100 : 0;

  return (
    <TableRow
  key={row.siteName}
  className="cursor-pointer"
  onClick={() => setSelectedSiteName(row.siteName)}
>
                  <TableCell>{row.siteName}</TableCell>
                  <TableCell>{row.scheduled}</TableCell>
                  <TableCell>{row.completed}</TableCell>
                  <TableCell>{row.missed}</TableCell>
                  <TableCell
  className={
    row.rate >= 95
      ? "font-semibold text-green-600"
      : row.rate >= 85
      ? "font-semibold text-yellow-600"
      : row.rate >= 70
      ? "font-semibold text-orange-600"
      : "font-semibold text-red-600"
  }
>
  {row.rate.toFixed(2)}%
</TableCell>
                  <TableCell
  className={
  siteComplaintRate >= 10
    ? "font-semibold text-red-600"

    : siteComplaintRate >= 5
    ? "font-semibold text-orange-600"

    : siteComplaintRate >= 2
    ? "font-semibold text-yellow-600"

    : "font-semibold text-green-600"
}
>
  {siteComplaintRate.toFixed(2)}%
</TableCell>
                </TableRow>
                );
})}
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
            <TableHead>Feedback</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {selectedSiteOccurrences.map((o) => {
            const completed = isOccurrenceCompleted(o, entries);
const feedback = serviceFeedbacks.find(
    f =>
        f.scheduleId === o.scheduleId &&
        f.scheduleDate === o.scheduleDate
);
            return (
              <TableRow key={`${o.scheduleId}-${o.scheduleDate}`}>
                <TableCell>{o.scheduleDate}</TableCell>
                <TableCell>
                  {completed ? "Complete" : "Missed"}
                </TableCell>
                <TableCell>
  {feedback ? (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        setFeedbackFor(o);
        setFeedbackType(feedback.type as "complaint" | "compliment");
        setFeedbackCategory(feedback.category ?? "");
        setFeedbackNotes(feedback.notes ?? "");
        setFeedbackResolved(!!feedback.resolved);
      }}
      className={
        feedback.type === "complaint"
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
      }
    >
      {feedback.resolved
        ? "✔ Resolved"
        : feedback.type === "complaint"
        ? "⚠ Complaint"
        : "⭐ Compliment"}
    </Button>
  ) : (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        setFeedbackFor(o);
        setFeedbackType("complaint");
        setFeedbackCategory(completed ? "Floors" : "Missed Service");
        setFeedbackNotes("");
        setFeedbackResolved(false);
      }}
      className="border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
    >
      ✓ No Feedback
    </Button>
  )}
</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </CardContent>
  </Card>
)}

      

        {feedbackFor && (
  <Card>
    <CardHeader>
      <CardTitle>
        Record Feedback — {feedbackFor.siteName} / {feedbackFor.scheduleDate}
      </CardTitle>
    </CardHeader>

    <CardContent className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium">Type</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={feedbackType}
            onChange={(e) => {
              const value = e.target.value as "complaint" | "compliment";
              setFeedbackType(value);
              setFeedbackCategory(value === "complaint" ? "Floors" : "Excellent Cleaning");
            }}
          >
            <option value="complaint">Complaint</option>
            <option value="compliment">Compliment</option>
          </select>
        </div>

        <div>
          <label className="text-xs font-medium">Category</label>
          <select
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={feedbackCategory}
            onChange={(e) => setFeedbackCategory(e.target.value)}
          >
            {feedbackType === "complaint" ? (
              <>
                <option value="Floors">Floors</option>
                <option value="Restrooms">Restrooms</option>
                <option value="Trash Removal">Trash Removal</option>
                <option value="Dusting">Dusting</option>
                <option value="Windows">Windows</option>
                <option value="Kitchen / Break Room">Kitchen / Break Room</option>
                <option value="Supplies Not Refilled">Supplies Not Refilled</option>
                <option value="Missed Service">Missed Service</option>
                <option value="Incomplete Cleaning">Incomplete Cleaning</option>
                <option value="Poor Quality">Poor Quality</option>
                <option value="Equipment Left Behind">Equipment Left Behind</option>
                <option value="Door Left Unlocked">Door Left Unlocked</option>
                <option value="Safety Issue">Safety Issue</option>
                <option value="Communication">Communication</option>
                <option value="Late Arrival">Late Arrival</option>
                <option value="Other">Other</option>
              </>
            ) : (
              <>
                <option value="Excellent Cleaning">Excellent Cleaning</option>
                <option value="Attention to Detail">Attention to Detail</option>
                <option value="Professional Staff">Professional Staff</option>
                <option value="Fast Response">Fast Response</option>
                <option value="Great Communication">Great Communication</option>
                <option value="Above Expectations">Above Expectations</option>
                <option value="Customer Appreciation">Customer Appreciation</option>
                <option value="Other">Other</option>
              </>
            )}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium">Notes</label>
        <textarea
          className="w-full border rounded-md px-3 py-2 text-sm"
          rows={3}
          value={feedbackNotes}
          onChange={(e) => setFeedbackNotes(e.target.value)}
          placeholder="What did the client say?"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={feedbackResolved}
          onChange={(e) => setFeedbackResolved(e.target.checked)}
        />
        Mark as resolved
      </label>

      <div className="flex gap-2">
        <Button
          onClick={() => {
            onAddServiceFeedbackAction({
              siteId: feedbackFor.siteName,
              siteName: feedbackFor.siteName,
              scheduleId: feedbackFor.scheduleId,
              scheduleDate: feedbackFor.scheduleDate,
              type: feedbackType,
              category: feedbackCategory,
              notes: feedbackNotes,
              resolved: feedbackResolved,
              createdAt: new Date().toISOString(),
            });

            setFeedbackFor(null);
          }}
        >
          Save Feedback
        </Button>

        <Button variant="outline" onClick={() => setFeedbackFor(null)}>
          Cancel
        </Button>
      </div>
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
                  <TableCell
  className={
    row.rate >= 95
      ? "font-semibold text-green-600"
      : row.rate >= 85
      ? "font-semibold text-yellow-600"
      : row.rate >= 70
      ? "font-semibold text-orange-600"
      : "font-semibold text-red-600"
  }
>
  {row.rate.toFixed(2)}%
</TableCell>
                    
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}