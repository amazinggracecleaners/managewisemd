// src/lib/cloud-settings.ts
import { doc, getDoc, onSnapshot, setDoc, type Firestore } from "firebase/firestore";
import type { Settings } from "@/shared/types/domain";

/**
 * Ensures the settings doc exists.
 * IMPORTANT: requires uid so Firestore rules allow it.
 */
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
    const settingsToSave: Settings = { ...defaults, companyId };
    await setDoc(ref, settingsToSave as any, { merge: true });
  }
}

/**
 * Subscribes to cloud settings.
 * - Calls onChange when data arrives
 * - Calls onReady the FIRST time we get a snapshot (exists or not)
 * - Calls onError if listener fails (permission-denied, etc)
 */
export function subscribeCloudSettings(
  db: Firestore,
  companyId: string,
  onChange: (s: Settings) => void,
  opts?: {
    uid?: string | null;
    onReady?: () => void;
    onError?: (error: any) => void;
  }
) {
  // ✅ If you don't have uid yet, do NOT attach listener.
  // Return a no-op unsubscribe.
  if (!opts?.uid) return () => {};

  const ref = doc(db, "companies", companyId, "settings", "main");

  let didReady = false;

  return onSnapshot(
    ref,
    (snap) => {
      // mark ready on first snapshot (even if doc doesn't exist yet)
      if (!didReady) {
        didReady = true;
        opts?.onReady?.();
      }

      if (snap.exists()) {
        onChange(snap.data() as Settings);
      }
    },
    (error) => {
      opts?.onError?.(error);
    }
  );
}

/**
 * Writes settings to cloud.
 * IMPORTANT: requires uid so Firestore rules allow it.
 */
export async function writeCloudSettings(
  db: Firestore,
  companyId: string,
  s: Settings,
  uid: string | null | undefined
) {
  if (!uid) return;

  const ref = doc(db, "companies", companyId, "settings", "main");
  const settingsToSave: Settings = { ...s, companyId };
  await setDoc(ref, settingsToSave as any, { merge: true });
}