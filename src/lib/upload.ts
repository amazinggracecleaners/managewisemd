
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "@/firebase";

export async function uploadExpenseReceipt({
  companyId,
  expenseId,
  file,
}: {
  companyId: string;
  expenseId: string;
  file: File;
}) {
  const path = `companies/${companyId}/receipts/${expenseId}/${file.name}`;
  const objectRef = ref(storage, path);
  const snap = await uploadBytes(objectRef, file, { contentType: file.type });
  const url = await getDownloadURL(snap.ref);
  return {
    receiptUrl: url,
    receiptPath: path,
    receiptMime: file.type,
  };
}

export async function deleteReceiptAtPath(path?: string) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (e: any) {
    // Non-fatal; log and continue
    if (e.code !== 'storage/object-not-found') {
      console.warn("[deleteReceiptAtPath] failed", e);
    }
  }
}
