"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Settings } from "@/shared/types/domain";
import {
  loadSettings as loadLocalSettings,
  saveSettings as saveLocalSettings,
} from "@/lib/storage";
import { useEngine } from "@/providers/EngineProvider";
import { db, auth } from "@/firebase/client";
import {
  writeCloudSettings,
  subscribeCloudSettings,
  ensureCloudSettings,
} from "@/lib/cloud-settings";
import { useToast } from "@/hooks/use-toast";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ensureAuthedUser } from "@/firebase/ensureAuth";

const FALLBACK_COMPANY_ID =
  process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners";

function getCompanyIdFromSettings(s: Settings) {
  return s.companyId?.trim() || FALLBACK_COMPANY_ID;
}

export function useSettings() {
  const { engine } = useEngine();
  const { toast } = useToast();

  const [settings, setSettings] = useState<Settings>(() => loadLocalSettings());
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);

  // ✅ Gate UI + writes until first snapshot arrives
  const [cloudReady, setCloudReady] = useState(engine !== "cloud");
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Helps prevent double subscribe in React Strict Mode
  const subscribedRef = useRef(false);

  // 1) Track auth state (single source of truth)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2) Load local settings immediately (always)
  useEffect(() => {
    const local = loadLocalSettings();
    setSettings(local);
  }, []);

  // 3) Cloud bootstrap + subscribe (ONLY after ensureAuthedUser)
  useEffect(() => {
    let unsub: (() => void) | null = null;
    let cancelled = false;

    async function startCloud() {
      setCloudError(null);

      // default cloudReady depends on engine
      if (engine !== "cloud") {
        setCloudReady(true);
        return;
      }

      // Cloud mode: NOT ready until first snapshot arrives
      setCloudReady(false);

      // Reset strict-mode guard when switching engines
      subscribedRef.current = false;

      try {
        // ✅ Ensure we have a signed-in user BEFORE touching Firestore
        const authed = await ensureAuthedUser();
        if (cancelled) return;

        const baseLocal = loadLocalSettings();
        const companyId = getCompanyIdFromSettings(baseLocal);

        // ✅ Ensure settings doc exists AFTER auth
        await ensureCloudSettings(db, companyId, baseLocal, authed.uid);
        if (cancelled) return;

        // ✅ Subscribe only once
        if (subscribedRef.current) return;
        subscribedRef.current = true;

        unsub = subscribeCloudSettings(
          db,
          companyId,
          (cloudSettings) => {
            setSettings((current) => {
              const merged = { ...current, ...cloudSettings };
              saveLocalSettings(merged);
              return merged;
            });
          },
          {
            uid: authed.uid,
            onReady: () => setCloudReady(true), // ✅ only after first snapshot
            onError: (error) => {
              console.error("[CloudSettings] subscribe error", error?.code, error?.message);
              setCloudError(`${error?.code || "error"}: ${error?.message || "subscribe failed"}`);
              setCloudReady(false);
            },
          }
        );
      } catch (e: any) {
        const msg = e?.message || "Failed to initialize cloud settings.";
        setCloudError(msg);
        setCloudReady(false);

        toast({
          variant: "destructive",
          title: "Cloud settings not ready",
          description: msg,
          duration: 8000,
        });
      }
    }

    startCloud();

    return () => {
      cancelled = true;
      subscribedRef.current = false;
      if (unsub) unsub();
    };
  }, [engine, toast]);

  // 4) Update settings (local always; cloud ONLY when ready)
  const updateSettings = useCallback(
    (updater: (s: Settings) => Settings) => {
      setSettings((prev) => {
        const next = updater(prev);

        // Always save locally
        saveLocalSettings(next);

        // Cloud write guarded
        if (engine === "cloud") {
          const uid = auth.currentUser?.uid;

          if (!uid || !cloudReady) {
            // Don’t write yet — avoids permission-denied + mismatched state
            return next;
          }

          const companyId = getCompanyIdFromSettings(next);

          writeCloudSettings(db, companyId, next, uid).catch((error: any) => {
            if (error?.code === "permission-denied") {
              console.warn("[Settings] Cloud save blocked by rules", error);
              return;
            }
            toast({
              variant: "destructive",
              title: "Failed to save settings to cloud",
              description: error?.message || "Please try again.",
            });
          });
        }

        return next;
      });
    },
    [engine, cloudReady, toast]
  );

  return { settings, updateSettings, cloudReady, cloudError, authReady, user };
}