"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import type { Settings } from "@/shared/types/domain";
import { loadSettings as loadLocalSettings, saveSettings as saveLocalSettings } from "@/lib/storage";
import { useEngine } from "@/providers/EngineProvider";
import { db, auth } from "@/firebase/client";
import { writeCloudSettings, subscribeCloudSettings, ensureCloudSettings } from "@/lib/cloud-settings";
import { useToast } from "@/hooks/use-toast";
import { onAuthStateChanged, type User } from "firebase/auth";
import { ensureAuthedUser } from "@/firebase/ensureAuth";

const FALLBACK_COMPANY_ID = process.env.NEXT_PUBLIC_COMPANY_ID || "amazing-grace-cleaners";

// Prefer env in cloud mode if present. Otherwise fall back to settings/companyId, then fallback.
function resolveCompanyId(engine: "cloud" | "local", s: Settings) {
  const envId = process.env.NEXT_PUBLIC_COMPANY_ID?.trim();
  if (engine === "cloud" && envId) return envId;
  return s.companyId?.trim() || envId || FALLBACK_COMPANY_ID;
}

export function useSettings() {
  const { engine } = useEngine();
  const { toast } = useToast();

  const [settings, setSettings] = useState<Settings>(() => loadLocalSettings());
  const [user, setUser] = useState<User | null>(auth.currentUser);
  const [authReady, setAuthReady] = useState(false);

  // Gate UI + writes until first snapshot for the ACTIVE company arrives
  const [cloudReady, setCloudReady] = useState(engine !== "cloud");
  const [cloudError, setCloudError] = useState<string | null>(null);

  // Track the active subscription so we can resubscribe if companyId changes
  const subRef = useRef<{ companyId: string; unsub: (() => void) | null }>({
    companyId: "",
    unsub: null,
  });

  // 1) Track auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // 2) Load local settings immediately (always)
  useEffect(() => {
    setSettings(loadLocalSettings());
  }, []);

  // Derive the companyId we SHOULD be using right now
  const activeCompanyId = useMemo(() => resolveCompanyId(engine, settings), [engine, settings]);

  // 3) Cloud bootstrap + subscribe (resubscribes if companyId changes)
  useEffect(() => {
    let cancelled = false;

    async function startCloudFor(companyId: string) {
      setCloudError(null);

      if (engine !== "cloud") {
        // Local mode: instantly ready
        setCloudReady(true);
        // Clean up any existing cloud subscription
        subRef.current.unsub?.();
        subRef.current = { companyId: "", unsub: null };
        return;
      }

      const cId = (companyId || "").trim();
      if (!cId) {
        setCloudReady(false);
        setCloudError("Missing companyId");
        return;
      }

      // If already subscribed to this companyId, do nothing
      if (subRef.current.companyId === cId && subRef.current.unsub) return;

      // Switching companyId: unsubscribe old, mark not ready until first snapshot arrives
      subRef.current.unsub?.();
      subRef.current = { companyId: cId, unsub: null };
      setCloudReady(false);

      try {
        const authed = await ensureAuthedUser();
        if (cancelled) return;

        // Use local as a seed ONLY for ensuring doc exists (not for overwriting)
        const seedLocal = loadLocalSettings();

        await ensureCloudSettings(db, cId, seedLocal, authed.uid);
        if (cancelled) return;

        const unsub = subscribeCloudSettings(
          db,
          cId,
          (cloudSettings) => {
            setSettings((current) => {
              const merged = { ...current, ...cloudSettings };
              saveLocalSettings(merged);
              return merged;
            });
          },
          {
            uid: authed.uid,
            onReady: () => setCloudReady(true),
            onError: (error) => {
              console.error("[CloudSettings] subscribe error", error?.code, error?.message);
              setCloudError(`${error?.code || "error"}: ${error?.message || "subscribe failed"}`);
              setCloudReady(false);
            },
          }
        );

        subRef.current = { companyId: cId, unsub };
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

    startCloudFor(activeCompanyId);

    return () => {
      cancelled = true;
    };
  }, [engine, activeCompanyId, toast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      subRef.current.unsub?.();
      subRef.current = { companyId: "", unsub: null };
    };
  }, []);

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
          if (!uid || !cloudReady) return next;

          const cId = resolveCompanyId(engine, next);

          writeCloudSettings(db, cId, next, uid).catch((error: any) => {
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