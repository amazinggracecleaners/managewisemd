"use client";

import React, { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import type { Employee } from "@/shared/types/domain";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type EmployeeNotification = {
  id: string;
  employeeId: string;
  type: "schedule-change";
  title: string;
  message: string;
  siteName?: string;
  scheduleId?: string;
  createdAt?: unknown;
  read: boolean;
  readAt?: string;
};

interface EmployeeNotificationsProps {
  employee: Employee;
  companyId: string;
}

function formatStamp(value: unknown) {
  if (!value) return "—";

  if (
    typeof value === "object" &&
    value !== null &&
    "toDate" in value &&
    typeof (value as { toDate: () => Date }).toDate === "function"
  ) {
    const d = (value as { toDate: () => Date }).toDate();
    return isNaN(d.getTime()) ? "—" : d.toLocaleString();
  }

  const d = new Date(value as string | number);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

export function EmployeeNotifications({
  employee,
  companyId,
}: EmployeeNotificationsProps) {
  const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [prevCount, setPrevCount] = useState(0);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const playNotificationSound = () => {
    if (typeof window === "undefined") return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }).webkitAudioContext;

      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(880, ctx.currentTime);

      gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);

      oscillator.onended = () => {
        void ctx.close();
      };
    } catch (error) {
      console.warn("Employee notification sound failed:", error);
    }
  };

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
    if (!employee?.id || !companyId) {
      setNotifications([]);
      setLoading(false);
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
        })) as EmployeeNotification[];

        setNotifications(items);
        setLoading(false);
      },
      (error) => {
        console.error("Employee notifications failed:", error);
        setNotifications([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [employee?.id, companyId]);

  useEffect(() => {
    if (!loading && notifications.length > prevCount) {
      const newest = notifications[0];

      if (newest && !newest.read) {
        playNotificationSound();
        vibrateNotification();
      }

      setPrevCount(notifications.length);
    }
  }, [notifications, loading, prevCount]);

  const markRead = async (notificationId: string) => {
    await updateDoc(
      doc(db, "companies", companyId, "employee_notifications", notificationId),
      {
        read: true,
        readAt: new Date().toISOString(),
      }
    );
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
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
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="sticky top-0 bg-background z-10 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <Badge
                variant="destructive"
                className={`text-xs ${unreadCount > 0 ? "animate-pulse" : ""}`}
              >
                {unreadCount}
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Schedule changes and employee updates
          </CardDescription>
        </div>

        {unreadCount > 0 && (
          <Button size="sm" variant="outline" onClick={markAllAsRead}>
            Mark all as read
          </Button>
        )}
      </CardHeader>

      <CardContent className="flex-1 overflow-y-auto space-y-3 max-h-[350px]">
        {loading ? (
          <p className="text-sm text-muted-foreground">
            Loading notifications...
          </p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications.</p>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.read && markRead(n.id)}
              className={`rounded-xl border p-3 flex items-start justify-between gap-3 cursor-pointer transition hover:bg-muted hover:shadow-sm ${
                !n.read ? "bg-muted/40" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <span className="truncate">{n.title}</span>
                </div>

                <div className="mt-2 text-sm text-muted-foreground space-y-1">
                  <div>{n.message}</div>

                  {n.siteName ? (
                    <div>
                      <span className="font-medium text-foreground">Site:</span>{" "}
                      {n.siteName}
                    </div>
                  ) : null}

                  <div>
                    <span className="font-medium text-foreground">Time:</span>{" "}
                    {formatStamp(n.createdAt)}
                  </div>
                </div>
              </div>

              <Badge variant={n.read ? "secondary" : "default"}>
                {n.read ? "Read" : "New"}
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}