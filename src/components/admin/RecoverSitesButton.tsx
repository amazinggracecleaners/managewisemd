"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/features/settings/hooks/useSettings";
import { useEngine } from "@/providers/EngineProvider";
import type { CleaningSchedule, Entry, Invoice, MileageLog, OtherExpense, Site } from "@/shared/types/domain";
import { db } from "@/firebase";
import { collection, getDocs } from "firebase/firestore";

/**
 * Recover site names from multiple collections and merge into Settings.sites.
 * - Preserves existing site objects and their details.
 * - Adds new minimal { name } entries for any found names.
 * - Cloud: reads Firestore; Local: reads localStorage caches where available.
 */
export function RecoverSitesButton() {
  const { settings, updateSettings } = useSettings();
  const { engine } = useEngine();
  const [busy, setBusy] = useState(false);

  const companyId =
    settings.companyId?.trim() ||
    process.env.NEXT_PUBLIC_COMPANY_ID ||
    "amazing-grace-cleaners";

  const normalizeName = (raw?: string) =>
    (raw || "")
      .replace(/\s+/g, " ")
      .trim();

  const readCloud = async <T,>(subpath: string): Promise<T[]> => {
    const snap = await getDocs(collection(db, "companies", companyId, subpath));
    return snap.docs.map((d) => d.data() as T);
  };

  const readLocalJSON = <T,>(key: string): T[] => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const run = async () => {
    if (!window.confirm("Recover site names from historical data and merge into your Site Directory? This won’t delete existing sites.")) {
      return;
    }
    setBusy(true);

    try {
      // 1) Always start with existing settings.sites so we don’t lose details
      const foundNames = new Set<string>();
      (settings.sites || []).forEach((s) => {
        const n = normalizeName(s.name);
        if (n) foundNames.add(n);
      });

      // 2) Pull data (cloud vs local)
      let schedules: CleaningSchedule[] = [];
      let entries: Entry[] = [];
      let invoices: Invoice[] = [];
      let mileageLogs: MileageLog[] = [];
      let otherExpenses: OtherExpense[] = [];

      if (engine === "cloud") {
        const [a, b, c, d, e] = await Promise.all([
          readCloud<CleaningSchedule>("schedules"),
          readCloud<Entry>("timeclock_entries"),
          readCloud<Invoice>("invoices"),
          readCloud<MileageLog>("mileage_logs"),
          readCloud<OtherExpense>("other_expenses"),
        ]);
        schedules = a;
        entries = b;
        invoices = c;
        mileageLogs = d;
        otherExpenses = e;
      } else {
        // Keys based on your existing local storage convention (adjust if needed)
        schedules = readLocalJSON<CleaningSchedule>("timewise.v1.schedules");
        entries = readLocalJSON<Entry>("timewise.v1.entries");
        invoices = readLocalJSON<Invoice>("timewise.v1.invoices");
        mileageLogs = readLocalJSON<MileageLog>("timewise.v1.mileage");
        otherExpenses = readLocalJSON<OtherExpense>("timewise.v1.other_expenses");
      }

      // 3) Harvest names across sources
      for (const s of schedules) {
        const n = normalizeName((s as any)?.siteName);
        if (n) foundNames.add(n);
      }
      for (const t of entries) {
        const n = normalizeName((t as any)?.site);
        if (n) foundNames.add(n);
      }
      for (const inv of invoices) {
        const n = normalizeName((inv as any)?.siteName);
        if (n) foundNames.add(n);
      }
      for (const m of mileageLogs) {
        const n = normalizeName((m as any)?.siteName || (m as any)?.site);
        if (n) foundNames.add(n);
      }
      for (const ox of otherExpenses) {
        const n = normalizeName((ox as any)?.siteName || (ox as any)?.site);
        if (n) foundNames.add(n);
      }

      // 4) Build new sites list, preserving existing details
      const existingByName = new Map<string, Site>(
        (settings.sites || []).map((s) => [normalizeName(s.name), s])
      );

      const mergedSites: Site[] = Array.from(foundNames)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b))
        .map((name) => existingByName.get(name) ?? ({ name } as Site));

      // 5) Save via updateSettings (your hook should persist w/ merge on Firestore)
      updateSettings((s) => ({ ...s, sites: mergedSites as any[] }));

      alert(
        `Recovered ${mergedSites.length} sites.\n` +
        `Open Settings → Sites to verify. Your previous site details (color, address, geofence, bonus, etc.) were preserved where available.`
      );
    } catch (err: any) {
      console.warn("[RecoverSites] failed:", err?.message || err);
      alert(`Recovery failed: ${err?.message || "Unknown error"}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={busy}>
      {busy ? "Recovering…" : "Recover Sites (from Data)"}
    </Button>
  );
}
