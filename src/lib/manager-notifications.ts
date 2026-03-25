import { addDoc, collection } from "firebase/firestore";
import { db } from "@/firebase/client";
import type { ManagerNotificationType } from "@/shared/types/domain";

type CreateManagerNotificationInput = {
  companyId: string;
  type: ManagerNotificationType;
  employeeId: string;
  employeeName: string;
  siteId?: string;
  siteName?: string;
  deviceLabel: string;
  deviceDetails?: string;
  periodId?: string;
  payrollRevision?: number;
};

function buildMessage(input: CreateManagerNotificationInput) {
  switch (input.type) {
    case "clock-in":
      return `${input.employeeName} clocked in at ${input.siteName || "Unknown site"} using ${input.deviceLabel}.`;
    case "clock-out":
      return `${input.employeeName} clocked out from ${input.siteName || "Unknown site"} using ${input.deviceLabel}.`;
    case "payroll-confirmed":
      return `${input.employeeName} confirmed payroll${input.periodId ? ` for period ${input.periodId}` : ""} using ${input.deviceLabel}.`;
    default:
      return `${input.employeeName} completed an action using ${input.deviceLabel}.`;
  }
}

export async function createManagerNotification(
  input: CreateManagerNotificationInput
) {
  const createdAt = new Date().toISOString();

  await addDoc(collection(db, "companies", input.companyId, "notifications"), {
    ...input,
    createdAt,
    read: false,
    message: buildMessage(input),
  });
}