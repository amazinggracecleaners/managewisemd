import { addDoc, collection } from "firebase/firestore";
import { db } from "@/firebase/client";

export type NotificationType = "clock-in" | "clock-out" | "payroll-confirmed";

type CreateManagerNotificationInput = {
  companyId: string;
  type: NotificationType;
  employeeId: string;
  employeeName: string;
  siteId?: string;
  siteName?: string;
  deviceLabel: string;
  deviceDetails?: string;
  periodId?: string;
  payrollRevision?: number;
};

export async function createManagerNotification(
  input: CreateManagerNotificationInput
) {
  const createdAt = new Date().toISOString();

  let message = "";
  if (input.type === "clock-in") {
    message = `${input.employeeName} clocked in at ${input.siteName || "Unknown site"} using ${input.deviceLabel}.`;
  } else if (input.type === "clock-out") {
    message = `${input.employeeName} clocked out from ${input.siteName || "Unknown site"} using ${input.deviceLabel}.`;
  } else if (input.type === "payroll-confirmed") {
    message = `${input.employeeName} confirmed payroll${
      input.periodId ? ` for period ${input.periodId}` : ""
    } using ${input.deviceLabel}.`;
  }

  await addDoc(
    collection(db, "companies", input.companyId, "notifications"),
    {
      ...input,
      createdAt,
      read: false,
      message,
    }
  );
}