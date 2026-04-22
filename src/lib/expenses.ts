// src/lib/expenses.ts
"use client";

import { collection, doc, setDoc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

import { db,storage , auth } from "@/firebase/client"; // <-- include auth
import type { OtherExpense } from "@/shared/types/domain";

function safeExtFromFileName(name: string) {
  const clean = (name || "").trim();
  const idx = clean.lastIndexOf(".");
  const ext = idx >= 0 ? clean.slice(idx + 1).toLowerCase() : "";
  if (!ext || !/^[a-z0-9]+$/.test(ext)) return "bin";
  return ext;
}

/**
 * REQUIRED upload path (matches your storage.rules):
 * companies/{companyId}/receipts/{uid}/{expenseId}.{ext}
 */
function receiptPath(companyId: string, uid: string, expenseId: string, receiptFile: File) {
  const ext = safeExtFromFileName(receiptFile.name);
  return `companies/${companyId}/receipts/${uid}/${expenseId}.${ext}`;
}

function requireUid() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Not signed in (auth.currentUser is null)");
  return uid;
}

export async function addOtherExpenseFS(
  companyId: string,
  expenseData: Omit<OtherExpense, "id" | "receiptUrl" | "receiptPath">,
  receiptFile?: File
) {
  const uid = requireUid();
console.log("[EXPENSE DEBUG] companyId param =", companyId);
  console.log("[addOtherExpenseFS] uid =", auth.currentUser?.uid);
  console.log("[addOtherExpenseFS] companyId =", companyId);
  console.log(
    "[addOtherExpenseFS] receiptFile =",
    receiptFile?.name,
    receiptFile?.type,
    receiptFile?.size
  );

  const colRef = collection(db, "companies", companyId, "other_expenses");
  const docRef = doc(colRef);
  const expenseId = docRef.id;

  let receiptUrl: string | undefined;
  let storedPath: string | undefined;

 if (receiptFile) {
  storedPath = receiptPath(companyId, uid, expenseId, receiptFile);
  console.log("[addOtherExpenseFS] upload path =", storedPath);

  try {
    const fileRef = ref(storage, storedPath);
    await uploadBytes(fileRef, receiptFile);
    receiptUrl = await getDownloadURL(fileRef);
    console.log("[addOtherExpenseFS] upload success", { receiptUrl, storedPath });
  } catch (e: any) {
    console.error("[addOtherExpenseFS] upload failed", {
      code: e?.code,
      message: e?.message,
      storedPath,
      companyId,
      uid,
    });
    throw e;
  }
}

  const payload: OtherExpense = {
    id: expenseId,
    ...expenseData,
    ...(receiptUrl ? { receiptUrl } : {}),
    ...(storedPath ? { receiptPath: storedPath } : {}),
  };
console.log("[addOtherExpenseFS] writing Firestore doc", {
  path: docRef.path,
  payload,
});
  await setDoc(docRef, payload);
  return payload;
}

export async function updateOtherExpenseFS(
  companyId: string,
  expenseId: string,
  updates: Partial<OtherExpense>,
  receiptFile?: File
) {
  

  const docRef = doc(db, "companies", companyId, "other_expenses", expenseId);
  const snap = await getDoc(docRef);
  const existing = snap.exists() ? (snap.data() as OtherExpense) : null;
const uid = requireUid();
  let newReceiptUrl: string | undefined;
  let newReceiptPath: string | undefined;

 if (receiptFile) {
    if (existing?.receiptPath) {
      try {
        await deleteObject(ref(storage, existing.receiptPath));
      } catch (e) {
        console.warn("[updateOtherExpenseFS] failed to delete old receipt", e);
      }
    }

    newReceiptPath = receiptPath(companyId, uid, expenseId, receiptFile);
    console.log("[updateOtherExpenseFS] companyId =", companyId);
console.log("[updateOtherExpenseFS] uid =", uid);
console.log("[updateOtherExpenseFS] upload path =", newReceiptPath);
    const fileRef = ref(storage, newReceiptPath);

    await uploadBytes(fileRef, receiptFile);
    newReceiptUrl = await getDownloadURL(fileRef);
  }

  await updateDoc(docRef, {
    ...updates,
    ...(receiptFile ? { receiptUrl: newReceiptUrl, receiptPath: newReceiptPath } : {}),
  });
}
 

export async function deleteOtherExpenseFS(
  companyId: string,
  expenseId: string,
  existing?: OtherExpense
) {
  const docRef = doc(db, "companies", companyId, "other_expenses", expenseId);

  const data =
    existing ||
    (await (async () => {
      const snap = await getDoc(docRef);
      return snap.exists() ? (snap.data() as OtherExpense) : null;
    })());

  if (data?.receiptPath) {
    try {
      await deleteObject(ref(storage, data.receiptPath));
    } catch (e) {
      console.warn("[deleteOtherExpenseFS] failed to delete receipt", e);
    }
  }

  await deleteDoc(docRef);
}
