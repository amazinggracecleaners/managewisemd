import { doc, getDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import type { Settings } from "@/shared/types/domain";
import { db } from "@/firebase/client";

export async function ensureCloudSettings(
  db: Firestore,
  companyId: string,
  defaults: Settings,
  uid: string | null | undefined
) {
  if (!uid) return;

  const ref = doc(db, "companies", companyId, "settings", "main");
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const settingsToSave = { ...defaults, companyId };
    await setDoc(ref, settingsToSave, { merge: true });
  }
}
console.log("[DEBUG] Firestore settings", (db as any)?._settings);

export function subscribeCloudSettings(
  db: Firestore,
  companyId: string,
  onChange: (s: Settings) => void
) {
  const ref = doc(db, "companies", companyId, "settings", "main");
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) onChange(snap.data() as Settings);
  });
}

export async function writeCloudSettings(db: Firestore, companyId: string, s: Settings) {
  const ref = doc(db, "companies", companyId, "settings", "main");
  const settingsToSave = { ...s, companyId };
  await setDoc(ref, settingsToSave, { merge: true });
}
