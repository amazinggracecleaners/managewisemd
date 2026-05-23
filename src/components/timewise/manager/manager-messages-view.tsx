"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebase/client";
import { format } from "date-fns";
import { MessageSquare, Send } from "lucide-react";
import { uploadMessageAttachment } from "@/features/messages/message-attachments";
import type { Employee } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
type Message = {
  id: string;
  employeeId: string;
  employeeName: string;
  site?: string;
  message: string;
  sender: "employee" | "manager";

  readByManager?: boolean;
  readByEmployee?: boolean;

  createdAt?: any;

  attachmentUrl?: string;
  attachmentName?: string;
  attachmentPath?: string;
  attachmentType?: string;
};

export function ManagerMessagesView({
  companyId,
  employees,
}: {
  companyId: string;
  employees: Employee[];
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [selectedSite, setSelectedSite] = useState<string>("all");
  const [replyText, setReplyText] = useState("");
  const [replyFile, setReplyFile] = useState<File | null>(null);

const totalUnreadMessages = useMemo(() => {
  return messages.filter(
    (m) => m.sender === "employee" && !m.readByManager
  ).length;
}, [messages]);
  useEffect(() => {
    if (!companyId) return;

    const q = collection(db, "companies", companyId, "messages");

    return onSnapshot(q, (snap) => {
      const items = snap.docs
  .map((d) => ({
    id: d.id,
    ...(d.data() as Omit<Message, "id">),
  }))
  .sort((a, b) => {
    const aTime = a.createdAt?.toMillis?.() ?? 0;
    const bTime = b.createdAt?.toMillis?.() ?? 0;
    return aTime - bTime;
  });

setMessages(items);
    });
  }, [companyId]);

  const employeeList = useMemo(() => {
    return employees.map((emp) => {
      const empMessages = messages.filter((m) => m.employeeId === emp.id);
      const unread = empMessages.filter(
        (m) => m.sender === "employee" && !m.readByManager
      ).length;

      return {
        ...emp,
        unread,
        lastMessage: empMessages[empMessages.length - 1],
      };
    });
  }, [employees, messages]);

  const selectedEmployee =
    employees.find((e) => e.id === selectedEmployeeId) || null;

  const thread = messages.filter((m) => {
  const matchesEmployee = m.employeeId === selectedEmployeeId;
  const matchesSite = selectedSite === "all" || m.site === selectedSite;

  return matchesEmployee && matchesSite;
});

  useEffect(() => {
    if (!companyId || !selectedEmployeeId) return;

    const unread = messages.filter((m) => {
  const matchesEmployee =
    m.employeeId === selectedEmployeeId;

  const matchesSite =
    selectedSite === "all" ||
    m.site === selectedSite;

  return (
    matchesEmployee &&
    matchesSite &&
    m.sender === "employee" &&
    !m.readByManager
  );
});

    unread.forEach((m) => {
      updateDoc(doc(db, "companies", companyId, "messages", m.id), {
        readByManager: true,
      });
    });
  }, [companyId, selectedEmployeeId, messages]);

  const sendReply = async () => {
    if (!selectedEmployee || !replyText.trim()) return;
const attachment = replyFile
  ? await uploadMessageAttachment({
      companyId,
      employeeId: selectedEmployee.id,
      file: replyFile,
    })
  : {};
    await addDoc(collection(db, "companies", companyId, "messages"), {
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.name,
      site: selectedSite === "all" ? "" : selectedSite,
      message: replyText.trim(),
      sender: "manager",
      readByManager: true,
      readByEmployee: false,
      createdAt: serverTimestamp(),
      ...attachment,
    });

    await addDoc(collection(db, "companies", companyId, "employee_notifications"), {
  employeeId: selectedEmployee.id,
  type: "manager-message",
  title: "New message from manager",
  message: replyText.trim(),
  site: selectedSite === "all" ? "" : selectedSite,
  read: false,
  createdAt: serverTimestamp(),
});

    setReplyText("");
    setReplyFile(null);
  };

  const formatTime = (value: any) => {
    const date = value?.toDate ? value.toDate() : null;
    return date ? format(date, "MMM d, h:mm a") : "";
  };

  const siteList = useMemo(() => {
  const sites = new Set<string>();

  messages.forEach((m) => {
    if (m.site && m.site.trim()) sites.add(m.site);
  });

  return Array.from(sites).sort();
}, [messages]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
  <MessageSquare className="h-5 w-5" />
  Employee Messages

  {totalUnreadMessages > 0 && (
    <Badge variant="destructive">
      {totalUnreadMessages}
    </Badge>
  )}
</CardTitle>
        </CardHeader>

        <CardContent className="space-y-2">
          {employeeList.map((emp) => (
            <button
              key={emp.id}
              onClick={() => setSelectedEmployeeId(emp.id)}
              className={`w-full rounded-lg border p-3 text-left hover:bg-muted ${
                selectedEmployeeId === emp.id ? "bg-muted" : ""
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-medium">{emp.name}</span>

                {emp.unread > 0 && (
                  <Badge variant="destructive">{emp.unread}</Badge>
                )}
              </div>

              <p className="text-xs text-muted-foreground truncate mt-1">
                {emp.lastMessage?.message || "No messages yet"}
              </p>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>
            {selectedEmployee ? selectedEmployee.name : "Select an employee"}
          </CardTitle>
        </CardHeader>

        <CardContent>
          {!selectedEmployee ? (
            <p className="text-sm text-muted-foreground">
              Choose an employee to view or send messages.
            </p>
          ) : (
            <div className="space-y-4">
                <div className="flex gap-2 items-center">
  <label className="text-sm font-medium">Site:</label>

  <select
    value={selectedSite}
    onChange={(e) => setSelectedSite(e.target.value)}
    className="rounded-md border bg-background px-3 py-2 text-sm"
  >
    <option value="all">All sites</option>

    {siteList.map((site) => (
      <option key={site} value={site}>
        {site}
      </option>
    ))}
  </select>
</div>
              <div className="h-[420px] overflow-y-auto rounded-lg border p-3 space-y-3">
                {thread.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No messages yet.
                  </p>
                ) : (
                  thread.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[80%] rounded-lg p-3 ${
                        m.sender === "manager"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "mr-auto bg-muted"
                      }`}
                    >
                      <p className="text-sm">{m.message}</p>
{m.attachmentUrl && (
  <>
    {m.attachmentType?.startsWith("image/") ? (
      <img
        src={m.attachmentUrl}
        alt={m.attachmentName || "attachment"}
        className="mt-2 max-h-60 rounded-md border"
      />
    ) : (
      <a
        href={m.attachmentUrl}
        target="_blank"
        rel="noreferrer"
        className="mt-2 block text-xs underline"
      >
        📎 {m.attachmentName || "Open attachment"}
      </a>
    )}
  </>
)}
                      {m.site && (
                        <p className="text-xs mt-1 opacity-80">
                          Site: {m.site}
                        </p>
                      )}

                      <p className="text-xs mt-1 opacity-70">
                        {formatTime(m.createdAt)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <Textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Reply to ${selectedEmployee.name}...`}
                  rows={3}
                />
<Input
  type="file"
  accept="image/*,.pdf,.doc,.docx"
  onChange={(e) => setReplyFile(e.target.files?.[0] ?? null)}
/>
                <Button onClick={sendReply} disabled={!replyText.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  Send
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}