import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/firebase/client";

function safeName(name: string) {
  return (name || "attachment").replace(/[^\w.\-]+/g, "_");
}

export async function uploadMessageAttachment(args: {
  companyId: string;
  employeeId: string;
  file: File;
}) {
  const { companyId, employeeId, file } = args;

  const fileName = `${Date.now()}-${safeName(file.name)}`;
  const path = `companies/${companyId}/messages/${employeeId}/${fileName}`;

  const fileRef = ref(storage, path);
  const snap = await uploadBytes(fileRef, file, {
    contentType: file.type || "application/octet-stream",
  });

  const url = await getDownloadURL(snap.ref);

  return {
    attachmentUrl: url,
    attachmentPath: path,
    attachmentName: file.name,
    attachmentType: file.type,
  };
}