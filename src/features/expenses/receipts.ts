// src/features/expenses/receipts.ts
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { auth, storage } from "@/firebase/client";

 function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  return uid;
}


function safeName(name: string) {
  // avoids weird characters in filenames (optional but smart)
  return (name || "receipt").replace(/[^\w.\-]+/g, "_");
}

export async function uploadExpenseReceipt(args: {
  companyId: string;
  expenseId: string; // we’ll use this as the filename base
  file: File;
}) {
  const { companyId, expenseId, file } = args;
  const uid = requireUid();

  const fileName = `${expenseId}-${safeName(file.name)}`;
  const path = `companies/${companyId}/receipts/${uid}/${fileName}`;

  const objectRef = ref(storage, path);
  const snap = await uploadBytes(objectRef, file, { contentType: file.type });
  const url = await getDownloadURL(snap.ref);

  return { receiptUrl: url, receiptPath: path, receiptMime: file.type };
}

export async function deleteReceiptAtPath(path?: string) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (e: any) {
    if (e.code !== "storage/object-not-found") {
      console.warn("[deleteReceiptAtPath] failed", e);
    }
  }
}
