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
} from "firebase/firestore";
import { db } from "@/firebase/client";
import type { Employee } from "@/shared/types/domain";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export function EmployeeNotifications({
  employee,
  companyId,
}: EmployeeNotificationsProps) {
  const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
useEffect(() => {
  console.log("[EMPLOYEE NOTIFICATIONS]", {
    employeeId: employee?.id,
    companyId,
  });
}, [employee?.id, companyId]);

  useEffect(() => {
    if (!employee?.id || !companyId) return;

    const q = query(
      collection(db, "companies", companyId, "employee_notifications"),
      where("employeeId", "==", employee.id),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      console.log("[EMPLOYEE NOTIFICATIONS SNAPSHOT]", snap.size);
      const items = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as EmployeeNotification[];

      setNotifications(items);
    });

    return () => unsub();
  }, [employee?.id, companyId]);

  const markRead = async (notificationId: string) => {
    await updateDoc(
      doc(db, "companies", companyId, "employee_notifications", notificationId),
      {
        read: true,
        readAt: new Date().toISOString(),
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No notifications.</p>
        ) : (
          <div className="space-y-3">
            {notifications.map((n) => (
              <div key={n.id} className="rounded border p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{n.title}</p>
                  {!n.read && <Badge>New</Badge>}
                </div>

                <p className="mt-1 text-sm text-muted-foreground">
                  {n.message}
                </p>

                {!n.read && n.id && (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markRead(n.id!)}
                    >
                      Mark as read
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}