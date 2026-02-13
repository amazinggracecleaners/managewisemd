// src/components/timewise/manager/ManagerSettingsView.tsx
"use client";

import React from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import type { Settings } from "@/shared/types/domain";

/**
 * OPTION 1:
 * UI shows FEET, but `settings.geofenceRadius` is STORED in METERS.
 * - When displaying: meters -> feet
 * - When saving: feet -> meters
 */

interface ManagerSettingsViewProps {
  settings: Settings;
  setSettings: (updater: (s: Settings) => Settings) => void;
  engine: "local" | "cloud";
  setEngine: (engine: "local" | "cloud") => void;
  onRecoverSites: () => Promise<void>;
  onExportSettings: () => void;
  onImportSettings: (data: Settings) => void;
}

const FT_PER_M = 3.28084;

const metersToFeet = (m: number) =>
  Number.isFinite(m) ? m * FT_PER_M : 0;

const feetToMeters = (ft: number) =>
  Number.isFinite(ft) ? ft / FT_PER_M : 0;

export function ManagerSettingsView(props: ManagerSettingsViewProps) {
  // ✅ Prevent runtime crash if settings is temporarily undefined during load
  const settings = (props.settings ?? ({} as Settings)) as Settings;
  const { setSettings, engine, setEngine } = props;

  const handleImportClick = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const ok = window.confirm(
      "Import settings from this file and replace your current settings?"
    );
    if (!ok) return;

    const text = await file.text();
    const parsed = JSON.parse(text);
    props.onImportSettings(parsed);
  };

  // ✅ Stored in METERS (Option 1). Display in FEET.
  const radiusMeters = Number(settings.geofenceRadius ?? 0) || 0;
  const radiusFeet =
    radiusMeters > 0
      ? Math.round(metersToFeet(radiusMeters))
      : 150;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Data Storage Mode</CardTitle>
          <CardDescription>
            Select where this device stores and syncs company data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label className="text-sm">Storage engine</Label>
            <Select
              value={engine}
              onValueChange={(next) => {
                if (next === engine) return;
                const ok = window.confirm(
                  `Switch storage to "${next}"?` +
                    (next === "cloud"
                      ? "\n\nMake sure your Firestore rules are set for ManageWiseMD."
                      : "\n\nLocal mode only saves data in this browser.")
                );
                if (!ok) return;
                setEngine(next as "local" | "cloud");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local (this device)</SelectItem>
                <SelectItem value="cloud">Cloud (Firestore)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              You can switch at any time, but make sure you understand where
              data is kept.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4 border-t pt-3 mt-2">
            <div>
              <p className="text-sm font-semibold">Read-only mode</p>
              <p className="text-xs text-muted-foreground">
                Temporarily block new clock-ins and changes until you turn this
                off.
              </p>
            </div>
            <Switch
              checked={!!settings.readOnlyMode}
              onCheckedChange={(checked) =>
                setSettings((s) => ({
                  ...(s as any),
                  readOnlyMode: checked,
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manager access</CardTitle>
          <CardDescription>
            Protect the Manager view with a simple PIN.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Lock Manager View</p>
              <p className="text-xs text-muted-foreground">
                When enabled, managers must enter a PIN to access admin features.
              </p>
            </div>
            <Switch
              checked={!!settings.managerPIN}
              onCheckedChange={(checked) => {
                if (!checked) {
                  setSettings((s) => ({ ...s, managerPIN: "" }));
                } else {
                  const pin = window.prompt(
                    "Set a new 4–6 digit manager PIN:"
                  );
                  if (pin) {
                    setSettings((s) => ({ ...s, managerPIN: pin }));
                  }
                }
              }}
            />
          </div>

          <div className="max-w-xs space-y-2">
            <Label className="text-sm">Manager PIN</Label>
            <Input
              type="password"
              value={settings.managerPIN ?? ""}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  managerPIN: e.target.value,
                }))
              }
              placeholder="Enter a 4–6 digit PIN"
            />
            <p className="text-xs text-muted-foreground">
              Required to unlock the Manager view. Share only with trusted staff.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clock-in rules</CardTitle>
          <CardDescription>
            Control how employees clock in and how strict location checks are.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">
                Require GPS to clock in/out
              </p>
              <p className="text-xs text-muted-foreground">
                Employees must share their location when starting or ending a
                shift.
              </p>
            </div>
            <Switch
              checked={!!settings.requireGPS}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, requireGPS: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4 border-t pt-3">
            <div>
              <p className="text-sm font-semibold">
                Require geofence for clock-in
              </p>
              <p className="text-xs text-muted-foreground">
                Only allow clock-in when the employee is close to the site.
              </p>
            </div>
            <Switch
              checked={!!settings.requireGeofence}
              onCheckedChange={(checked) =>
                setSettings((s) => ({ ...s, requireGeofence: checked }))
              }
            />
          </div>

          {settings.requireGeofence && (
            <div className="grid gap-2 max-w-xs">
              <Label className="text-sm">Geofence radius (feet)</Label>

              {/* ✅ FEET in UI, stored METERS in settings.geofenceRadius */}
              <Input
                type="number"
                min={25}
                step={25}
                value={radiusFeet}
                onChange={(e) => {
                  const rawFeet = Number(e.target.value);
                  const safeFeet =
                    Number.isFinite(rawFeet) && rawFeet > 0 ? rawFeet : 150;

                  const meters = feetToMeters(safeFeet);

                  setSettings((s) => ({
                    ...s,
                    geofenceRadius: meters, // stored in meters (Option 1)
                  }));
                }}
              />

              <p className="text-xs text-muted-foreground">
                This radius applies to all sites that have GPS coordinates.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>General</CardTitle>
          <CardDescription>General application settings.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Week Starts On</Label>
            <Select
              value={String(settings.weekStartsOn ?? 0)}
              onValueChange={(v) =>
                setSettings((s) => ({
                  ...s,
                  weekStartsOn: Number(v) as any,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Sunday</SelectItem>
                <SelectItem value="1">Monday</SelectItem>
                <SelectItem value="2">Tuesday</SelectItem>
                <SelectItem value="3">Wednesday</SelectItem>
                <SelectItem value="4">Thursday</SelectItem>
                <SelectItem value="5">Friday</SelectItem>
                <SelectItem value="6">Saturday</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Financials</CardTitle>
          <CardDescription>
            Settings related to payroll and expenses.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Mileage Rate ($/mile)</Label>
            <Input
              type="number"
              step="0.01"
              value={settings.mileageRate ?? 0}
              onChange={(e) =>
                setSettings((s) => ({
                  ...s,
                  mileageRate: Number(e.target.value) || 0,
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup & maintenance</CardTitle>
          <CardDescription>
            Save settings, restore them, or rebuild sites from existing data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Last backup:{" "}
            <span className="font-medium">
              {settings.lastBackupAt
                ? new Date(settings.lastBackupAt).toLocaleString()
                : "No backup recorded"}
            </span>
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const ok = window.confirm("Export current settings as a JSON file?");
                if (!ok) return;
                props.onExportSettings();
                setSettings((s) => ({
                  ...(s as any),
                  lastBackupAt: new Date().toISOString(),
                }));
              }}
            >
              Export settings (JSON)
            </Button>

            <label>
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportClick}
              />
              <Button asChild size="sm" variant="outline">
                <span>Import settings (JSON)</span>
              </Button>
            </label>
          </div>

          <div className="border-t pt-3 mt-2 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">Recover sites from data</p>
              <p className="text-xs text-muted-foreground">
                Try to rebuild the sites list using past entries and schedules.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                const ok = window.confirm(
                  "Recover sites from existing data? This may add or update site records."
                );
                if (!ok) return;
                await props.onRecoverSites();
              }}
            >
              Recover sites
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
