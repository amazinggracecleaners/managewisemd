"use client";

import React, { useMemo } from "react";
import { format, parseISO } from "date-fns";
import type {
  CleaningSchedule,
  Employee,
  Entry,
  Site,
} from "@/shared/types/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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

export function ServiceReport({
  schedules,
  entries,
  employees,
  sites,
}: Props) {
  const report = useMemo(() => {
    const siteRows = sites.map((site) => {
      const siteSchedules = schedules.filter((s) => s.siteName === site.name);

      const scheduled = siteSchedules.length;

      const completed = siteSchedules.filter((schedule) => {
        return entries.some(
          (e) =>
            e.action === "out" &&
            e.scheduleId === schedule.id
        );
      }).length;

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
      const assignedSchedules = schedules.filter((s) =>
        s.assignedEmployeeIds?.includes(employee.id)
      );

      const assigned = assignedSchedules.length;

      const completed = assignedSchedules.filter((schedule) => {
        return entries.some(
          (e) =>
            e.employeeId === employee.id &&
            e.action === "out" &&
            e.scheduleId === schedule.id
        );
      }).length;

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
      siteRows,
      employeeRows,
      totalScheduled,
      totalCompleted,
      totalMissed,
      completionRate,
    };
  }, [schedules, entries, employees, sites]);

  const exportSiteCSV = () => {
    downloadCSV("service-report-sites.csv", [
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

  return (
    <div className="space-y-4">
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

      <div className="flex gap-2 flex-wrap">
        <Button onClick={exportSiteCSV}>Download Site Report CSV</Button>
        <Button variant="outline" onClick={exportEmployeeCSV}>
          Download Employee Report CSV
        </Button>
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
                <TableRow key={row.siteName}>
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