"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/client";
import type {
  AppNotification,
  Employee,
  PayrollPeriod,
} from "@/shared/types/domain";

export async function createPayrollConfirmationNotifications(args: {
  companyId: string;
  period: PayrollPeriod;
  employees: Employee[];
}) {
  const { companyId, period, employees } = args;

  const employeeIds = Array.from(
    new Set((period.lineItems ?? []).map((li) => li.employeeId).filter(Boolean))
  );

  const targetEmployees = employees.filter((e) => employeeIds.includes(e.id));

  await Promise.all(
    targetEmployees.map((employee) => {
      const payload: AppNotification = {
        type: "payroll_confirmation",
        employeeId: employee.id,
        employeeName: employee.name,
        title: "Payroll confirmation requested",
        message: `Your payroll for ${String(period.startDate).slice(0, 10)} to ${String(period.endDate).slice(0, 10)} is ready for review.`,
        read: false,
        periodId: period.id,
        revision: period.revision ?? 1,
        createdAt: serverTimestamp(),
      };

      return addDoc(
        collection(db, "companies", companyId, "notifications"),
        payload as any
      );
    })
  );
}