"use client";

import React from "react";
import type { ManagerNotification } from "@/shared/types/domain";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, CheckCircle2, LogIn, LogOut } from "lucide-react";

interface ManagerNotificationsPanelProps {
  notifications: ManagerNotification[];
  unreadCount?: number;
  markNotificationRead?: (id: string) => Promise<void> | void;
  markAllNotificationsRead?: () => Promise<void> | void;
}

function formatWhen(value: any) {
  if (!value) return "—";

  try {
    if (typeof value?.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    if (typeof value === "number") {
      return new Date(value).toLocaleString();
    }
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}

function renderMessage(n: ManagerNotification) {
  if (n.type === "clock") {
    return n.action === "in"
      ? `${n.employeeName} clocked in at ${n.site}`
      : `${n.employeeName} clocked out from ${n.site}`;
  }

  return `${n.employeeName} confirmed payroll for period ${n.periodId}`;
}

function renderIcon(n: ManagerNotification) {
  if (n.type === "clock" && n.action === "in") {
    return <LogIn className="h-4 w-4" />;
  }
  if (n.type === "clock" && n.action === "out") {
    return <LogOut className="h-4 w-4" />;
  }
  if (n.type === "payroll") {
    return <CheckCircle2 className="h-4 w-4" />;
  }
  return <Bell className="h-4 w-4" />;
}

export function ManagerNotificationsPanel({
  notifications,
  unreadCount = 0,
  markNotificationRead,
  markAllNotificationsRead,
}: ManagerNotificationsPanelProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
            {unreadCount > 0 ? (
              <Badge variant="destructive">{unreadCount}</Badge>
            ) : null}
          </CardTitle>
          <CardDescription>
            Live clock activity and payroll confirmations
          </CardDescription>
        </div>

        {notifications.length > 0 && markAllNotificationsRead ? (
          <button
            type="button"
            onClick={() => markAllNotificationsRead()}
            className="text-sm underline underline-offset-4 text-muted-foreground hover:text-foreground"
          >
            Mark all read
          </button>
        ) : null}
      </CardHeader>

      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No notifications yet.
          </div>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className="rounded-lg border p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {renderIcon(n)}
                    <span>{renderMessage(n)}</span>
                  </div>

                  <div className="mt-1 text-xs text-muted-foreground space-y-1">
                    {n.type === "clock" ? (
                      <>
                        <div>Employee: {n.employeeName}</div>
                        <div>Site: {n.site}</div>
                        <div>Action: {n.action === "in" ? "Clock In" : "Clock Out"}</div>
                        <div>Time: {formatWhen(n.ts)}</div>
                      </>
                    ) : (
                      <>
                        <div>Employee: {n.employeeName}</div>
                        <div>Period: {n.periodId}</div>
                        <div>Revision: {n.revision}</div>
                        <div>Confirmed: {formatWhen(n.createdAt)}</div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <Badge variant={n.read ? "secondary" : "default"}>
                    {n.read ? "Read" : "New"}
                  </Badge>

                  {!n.read && markNotificationRead ? (
                    <button
                      type="button"
                      onClick={() => markNotificationRead(n.id)}
                      className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                    >
                      Mark read
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}