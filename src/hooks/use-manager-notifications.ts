"use client";

import { useEffect, useState } from "react";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import { useToast } from "@/hooks/use-toast";
type RawNotification = {
  type?: unknown;
  employeeId?: unknown;
  employeeName?: unknown;
  action?: unknown;
  site?: unknown;
  ts?: unknown;
   deviceLabel?: unknown;
  periodId?: unknown;
  revision?: unknown;
  createdAt?: unknown;
  read?: unknown;
};

type ClockNotificationShape = {
  id: string;
  type: "clock";
  employeeId: string;
  employeeName: string;
  action: "in" | "out";
  site: string;
  ts: number;
  deviceLabel?: string;
  createdAt?: unknown;
  read: boolean;
};

type PayrollNotificationShape = {
  id: string;
  type: "payroll";
  employeeId: string;
  employeeName: string;
  periodId: string;
  revision: number;
  createdAt?: unknown;
  read: boolean;
};

type ParsedNotification = ClockNotificationShape | PayrollNotificationShape;

export function useManagerNotifications(companyId?: string, max = 50) {
  const [notifications, setNotifications] = useState<ParsedNotification[]>([]);
  const [loading, setLoading] = useState(true);
const [prevCount, setPrevCount] = useState(0);
const { toast } = useToast();
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = async () => {
    if (!companyId) return;

    const batch = writeBatch(db);

    notifications.forEach((n) => {
      if (!n.read) {
        const ref = doc(db, "companies", companyId, "notifications", n.id);
        batch.update(ref, {
          read: true,
          readAt: new Date().toISOString(),
        });
      }
    });

    await batch.commit();
  };

  const markOneAsRead = async (id: string) => {
    if (!companyId) return;

    await updateDoc(doc(db, "companies", companyId, "notifications", id), {
      read: true,
      readAt: new Date().toISOString(),
    });
  };

  useEffect(() => {
    if (!companyId) {
      setNotifications([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "companies", companyId, "notifications"),
      orderBy("createdAt", "desc"),
      limit(max)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const mapped = snap.docs.map((doc): ParsedNotification | null => {
          const data = doc.data() as RawNotification;

          if (data.type === "clock") {
            return {
              id: doc.id,
              type: "clock" as const,
              employeeId:
                typeof data.employeeId === "string" ? data.employeeId : "",
              employeeName:
                typeof data.employeeName === "string"
                  ? data.employeeName
                  : "Unknown",
              action: data.action === "out" ? "out" : "in",
              site: typeof data.site === "string" ? data.site : "",
              ts: typeof data.ts === "number" ? data.ts : 0,
              deviceLabel:
  typeof data.deviceLabel === "string" ? data.deviceLabel : undefined,
              createdAt: data.createdAt,
              read: !!data.read,
            };
          }

          if (data.type === "payroll") {
            return {
              id: doc.id,
              type: "payroll" as const,
              employeeId:
                typeof data.employeeId === "string" ? data.employeeId : "",
              employeeName:
                typeof data.employeeName === "string"
                  ? data.employeeName
                  : "Unknown",
              periodId:
                typeof data.periodId === "string" ? data.periodId : "",
              revision:
                typeof data.revision === "number" ? data.revision : 0,
              createdAt: data.createdAt,
              read: !!data.read,
            };
          }

          return null;
        });

        const next: ParsedNotification[] = mapped.filter(
          (item): item is ParsedNotification => item !== null
        );

        setNotifications(next);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load notifications:", error);
        setNotifications([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [companyId, max]);
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
    console.warn("Notification sound failed:", error);
  }
};
const vibrateNotification = () => {
  if (typeof navigator === "undefined") return;
  if (!("vibrate" in navigator)) return;

  try {
    navigator.vibrate?.([120, 60, 120]);
  } catch (error) {
    console.warn("Vibration failed:", error);
  }
};
useEffect(() => {
  if (!loading && notifications.length > prevCount) {
    const newest = notifications[0];

    if (newest && !newest.read) {
      toast({
        title: "New activity",
        description:
          newest.type === "clock"
            ? newest.action === "in"
              ? `${newest.employeeName} clocked in`
              : `${newest.employeeName} clocked out`
            : `${newest.employeeName} confirmed payroll`,
      });

      playNotificationSound();
      vibrateNotification();
    }

    setPrevCount(notifications.length);
  }
}, [notifications, loading, prevCount, toast]);
  return {
    notifications,
    loading,
    unreadCount,
    markAllAsRead,
    markOneAsRead,
  };
}