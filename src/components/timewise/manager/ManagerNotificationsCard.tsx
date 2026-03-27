"use client";

import React from "react";
import { format, parseISO, isValid } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, LogIn, LogOut } from "lucide-react";
import { useManagerNotifications } from "@/hooks/use-manager-notifications";
import { Button } from "@/components/ui/button";
interface ManagerNotificationsCardProps {
  companyId?: string;
}

function getTypeIcon(n: { type: "clock" | "payroll"; action?: "in" | "out" }) {
  if (n.type === "clock" && n.action === "in") {
    return <LogIn className="h-4 w-4" />;
  }
  if (n.type === "clock" && n.action === "out") {
    return <LogOut className="h-4 w-4" />;
  }
  return <CheckCircle2 className="h-4 w-4" />;
}

function formatStamp(value: unknown) {
  if (!value) return "—";

  if (typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy • h:mm a");
  }

  if (typeof value === "string") {
    const d = parseISO(value);
    if (isValid(d)) return format(d, "MMM d, yyyy • h:mm a");

    const fallback = new Date(value);
    return isNaN(fallback.getTime())
      ? value
      : format(fallback, "MMM d, yyyy • h:mm a");
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? "—" : format(d, "MMM d, yyyy • h:mm a");
  }

  return "—";
}

export function ManagerNotificationsCard({
  companyId,
}: ManagerNotificationsCardProps) {
  const {
  notifications,
  loading,
  unreadCount,
  markAllAsRead,
  markOneAsRead,
} = useManagerNotifications(companyId, 50);

  return (
  <Card className="h-full flex flex-col">
    <CardHeader className="sticky top-0 bg-background z-10 flex flex-row items-center justify-between">
  <div>
    <CardTitle className="flex items-center gap-2">
      Manager Notifications

      {unreadCount > 0 && (
        <Badge variant="destructive" className="text-xs">
          {unreadCount}
        </Badge>
      )}
    </CardTitle>

    <CardDescription>
      Employee clock activity and payroll confirmations
    </CardDescription>
  </div>

  {unreadCount > 0 && (
    <Button size="sm" variant="outline" onClick={markAllAsRead}>
      Mark all as read
    </Button>
  )}
</CardHeader>

    <CardContent className="flex-1 overflow-y-auto space-y-3 max-h-[400px]">
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notifications yet.</p>
      ) : (
        notifications.map((n) => {
          if (n.type === "clock") {
            return (
              <div
  key={n.id}
  onClick={() => !n.read && markOneAsRead(n.id)}
  className={`rounded-xl border p-3 flex items-start justify-between gap-3 cursor-pointer transition hover:bg-muted ${
  !n.read ? "bg-muted/40" : ""
}`}
>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 font-medium">
                    {getTypeIcon(n)}
                    <span className="truncate">
                      {n.action === "in"
                        ? `${n.employeeName} clocked in at ${n.site}`
                        : `${n.employeeName} clocked out from ${n.site}`}
                    </span>
                  </div>

                  <div className="mt-2 text-sm text-muted-foreground space-y-1">
                    <div>
                      <span className="font-medium text-foreground">Employee:</span>{" "}
                      {n.employeeName}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Site:</span>{" "}
                      {n.site || "—"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Action:</span>{" "}
                      {n.action === "in" ? "Clock In" : "Clock Out"}
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Time:</span>{" "}
                      {formatStamp(n.ts)}
                    </div>
                  </div>
                </div>

                <Badge variant={n.read ? "secondary" : "default"}>
                  {n.read ? "Read" : "New"}
                </Badge>
              </div>
            );
          }

        return (
  <div
    key={n.id}
    onClick={() => !n.read && markOneAsRead(n.id)}
    className={`rounded-xl border p-3 flex items-start justify-between gap-3 cursor-pointer transition hover:bg-muted ${
  !n.read ? "bg-muted/40" : ""
}`}
  >
    <div className="min-w-0">
      <div className="flex items-center gap-2 font-medium">
        {getTypeIcon(n)}
        <span className="truncate">
          {n.employeeName} confirmed payroll
        </span>
      </div>

      <div className="mt-2 text-sm text-muted-foreground space-y-1">
        <div>
          <span className="font-medium text-foreground">Employee:</span>{" "}
          {n.employeeName}
        </div>
        <div>
          <span className="font-medium text-foreground">Period:</span>{" "}
          {n.periodId}
        </div>
        <div>
          <span className="font-medium text-foreground">Revision:</span>{" "}
          {n.revision}
        </div>
        <div>
          <span className="font-medium text-foreground">Confirmed:</span>{" "}
          {formatStamp(n.createdAt)}
        </div>
      </div>
    </div>

    <Badge variant={n.read ? "secondary" : "default"}>
      {n.read ? "Read" : "New"}
    </Badge>
  </div>
);
        })
      )}
    </CardContent>
  </Card>
);
}