"use client";

import { auth } from "@/firebase/client";
import {
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence,
  type User,
} from "firebase/auth";

let inFlight: Promise<User> | null = null;

export async function ensureAuthedUser(): Promise<User> {
  await setPersistence(auth, browserLocalPersistence);

  if (auth.currentUser) return auth.currentUser;

  if (!inFlight) {
    inFlight = new Promise<User>((resolve, reject) => {
      const unsub = onAuthStateChanged(auth, async (u) => {
        try {
          if (u) {
            unsub();
            resolve(u);
            return;
          }
          const cred = await signInAnonymously(auth);
          unsub();
          resolve(cred.user);
        } catch (e) {
          unsub();
          reject(e);
        }
      });
    }).finally(() => {
      inFlight = null;
    });
  }

  return inFlight;
}