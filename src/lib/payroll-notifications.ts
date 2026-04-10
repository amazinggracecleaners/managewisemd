"use client";

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase/client";
import type { Employee, PayrollPeriod } from "@/shared/types/domain";

export async function createPayrollConfirmationNotifications(args: {
  companyId: string;
  period: PayrollPeriod;
  employees: Employee[];
}) {
  const { companyId, period, employees } = args;

  const employeeIds = Array.from(
    new Set(
      (period.lineItems ?? [])
        .map((li) => li.employeeId)
        .filter(Boolean)
    )
  );

  const targetEmployees = employees.filter((e) => employeeIds.includes(e.id));

  await Promise.all(
    targetEmployees.map((employee) =>
      addDoc(
        collection(db, "companies", companyId, "employee_notifications"),
        {
          type: "payroll-confirmation",
          employeeId: employee.id,
          employeeName: employee.name,
          title: "Payroll confirmation requested",
          message: `Your payroll for ${period.startDate} to ${period.endDate} is ready for review. Go to the payroll section to review it.`,
          periodId: period.id,
          revision: period.revision ?? 1,
          createdAt: serverTimestamp(),
          read: false,
        }
      )
    )
  );
}