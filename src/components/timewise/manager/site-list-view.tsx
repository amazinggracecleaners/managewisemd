"use client";

import React, { useState, useMemo, useEffect } from "react";
import type { Site, Settings } from "@/shared/types/domain";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  User,
  KeyRound,
  DollarSign,
  ExternalLink,
  PlusCircle,
  Edit,
  MapPin,
  Trash2,
  Building2,
  Search,
  Filter,
  Layers3,
  ContactRound,
  ShieldCheck,
  Clock3,
  WalletCards,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { uuid } from "@/lib/time-utils";


interface SiteListViewProps {
  sites: Site[];
  settings: Settings;
  setSettings: (updater: (s: Settings) => Settings) => void;
  deleteSite: (siteId: string) => Promise<void>;
  setSiteLocationFromHere: (siteId: string) => void;
  testGeofence: (site: Site) => Promise<void>;
}

const getCityFromAddress = (address?: string): string => {
  if (!address) return "Unknown city";
  const parts = address.split(",");
  if (parts.length > 1) {
    const cityState = parts[parts.length - 2] || "";
    return cityState.trim().split(" ")[0].trim() || "Unknown city";
  }
  return "Unknown city";
};

const getSiteRevenue = (site: Partial<Site>) =>
  Number(site.revenue ?? 0);

const calculateFee = (
  baseRevenue: number,
  type?: "none" | "percent" | "fixed",
  value?: number
) => {
  if (!type || type === "none") return 0;
  if (type === "percent") return baseRevenue * ((Number(value) || 0) / 100);
  if (type === "fixed") return Number(value) || 0;
  return 0;
};

const getPriceRange = (price?: number): string => {
  const p = price || 0;
  if (p === 0) return "No price";
  if (p <= 100) return "$0–$100";
  if (p <= 250) return "$101–$250";
  if (p <= 500) return "$251–$500";
  return "$501+";
};

const formatDuration = (minutes?: number): string => {
  const totalMinutes = Math.max(0, Number(minutes) || 0);

  if (totalMinutes === 0) {
    return "Not set";
  }

  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;

  if (hours === 0) {
    return `${remainingMinutes}m`;
  }

  if (remainingMinutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${remainingMinutes}m`;
};

export function SiteListView({
  sites,
  settings,
  setSettings,
  deleteSite,
  setSiteLocationFromHere,
  testGeofence,
}: SiteListViewProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [siteData, setSiteData] = useState<Partial<Site>>({});
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [groupBy, setGroupBy] = useState<"none" | "city" | "amount">("none");
  const [siteFilter, setSiteFilter] = useState<"active" | "inactive" | "all">("active");
const activeSites = useMemo(
  () =>
    (sites ?? []).filter(
      (site) => (site.status || "active").toLowerCase() !== "inactive"
    ),
  [sites]
);

const inactiveSitesCount = useMemo(
  () =>
    (sites ?? []).filter(
      (site) => (site.status || "active").toLowerCase() === "inactive"
    ).length,
  [sites]
);

const activeSitesCount = activeSites.length;
const allSitesCount = sites.length;
  // Ensure all sites have a stable ID
  useEffect(() => {
    const list = sites ?? [];
    if (list.some((s) => !s.id)) {
      const withIds = list.map((s) => (s.id ? s : { ...s, id: uuid() }));
      setSettings((prev) => ({
        ...prev,
        sites: withIds,
      }));
    }
  }, [sites, setSettings]);

  const sitesNeedingGPS = useMemo(
  () =>
    settings.requireGeofence
      ? activeSites.filter(
  (s) => s.lat === undefined || s.lng === undefined
).length
      : 0,
  [settings.requireGeofence, activeSites]
);

const filteredSites = useMemo(() => {
  let baseSites = sites ?? [];

  if (siteFilter === "active") {
    baseSites = activeSites;
  } else if (siteFilter === "inactive") {
    baseSites = baseSites.filter(
      (site) =>
        (site.status || "active").toLowerCase() === "inactive"
    );
  }

  if (!searchQuery.trim()) {
    return baseSites;
  }

  const query = searchQuery.toLowerCase();

  return baseSites.filter(
  (site) =>
    site.name.toLowerCase().includes(query) ||
    site.address?.toLowerCase().includes(query) ||
    site.contactName?.toLowerCase().includes(query) ||
    site.contactPhone?.toLowerCase().includes(query) ||
    site.contactEmail?.toLowerCase().includes(query) ||
    site.billingContactName?.toLowerCase().includes(query) ||
    site.billingContactPhone?.toLowerCase().includes(query) ||
    site.billingContactEmail?.toLowerCase().includes(query) ||
    site.emergencyContactName?.toLowerCase().includes(query) ||
    site.emergencyContactPhone?.toLowerCase().includes(query) ||
    site.emergencyContactEmail?.toLowerCase().includes(query)
);
}, [sites, activeSites, siteFilter, searchQuery]);
const groupedSites = useMemo(() => {
  if (groupBy === "none") {
    const title = searchQuery.trim()
      ? `Search Results (${filteredSites.length})`
      : siteFilter === "active"
      ? `Active Sites (${activeSitesCount})`
      : siteFilter === "inactive"
      ? `Inactive Sites (${inactiveSitesCount})`
      : `All Sites (${allSitesCount})`;

    return {
      [title]: [...filteredSites].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    };
  }
    const groups: Record<string, Site[]> = {};

    filteredSites.forEach((site) => {
      let key: string;
      if (groupBy === "city") {
        key = getCityFromAddress(site.address);
      } else {
        key = getPriceRange(getSiteRevenue(site));
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(site);
    });

    Object.values(groups).forEach((group) =>
      group.sort((a, b) => a.name.localeCompare(b.name))
    );

    return groups;
  }, [
  filteredSites,
  groupBy,
  searchQuery,
  siteFilter,
  activeSitesCount,
  inactiveSitesCount,
  allSitesCount,
]);

  const handleOpenDialog = (site: Site | null) => {
  setEditingSite(site);

  setSiteData(
    site
      ? {
          status: "active",
          billingFrequency: "Monthly",
          rsFeeType: "none",
          otherFeeType: "none",
          ...site,
        }
      : {
          name: "",
          color: "#333333",
          status: "active",
          billingFrequency: "Monthly",
          rsFeeType: "none",
          otherFeeType: "none",
        }
  );

  setIsDialogOpen(true);
};

  const handleDataChange = (field: keyof Site, value: any) => {
    setSiteData((prev) => ({ ...prev, [field]: value }));
  };

  const addLocationToSite = () => {
    if (!navigator.geolocation) {
      toast({
        variant: "destructive",
        title: "Geolocation is not supported in this browser.",
      });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        handleDataChange("lat", pos.coords.latitude);
        handleDataChange("lng", pos.coords.longitude);
        toast({ title: "Location captured successfully." });
      },
      () =>
        toast({
          variant: "destructive",
          title: "Unable to retrieve current location.",
        }),
      { enableHighAccuracy: true }
    );
  };

  const handleSubmit = () => {
    if (!siteData.name?.trim()) {
      toast({ variant: "destructive", title: "Site name is required." });
      return;
    }

    const cleanSiteData = { ...siteData };
    Object.keys(cleanSiteData).forEach((key) => {
      if (cleanSiteData[key as keyof Site] === undefined) {
        delete cleanSiteData[key as keyof Site];
      }
    });

    if (editingSite) {
      // Check for duplicate names when renaming
      if (
        editingSite.name !== cleanSiteData.name &&
        sites.some(
          (s) =>
            s.name.toLowerCase() === cleanSiteData.name?.toLowerCase()
        )
      ) {
        toast({
          variant: "destructive",
          title: "Another site already uses this name.",
        });
        return;
      }

      setSettings((s) => ({
        ...s,
        sites: (s.sites ?? []).map((site) =>
          site.id === editingSite.id
            ? ({ ...site, ...cleanSiteData } as Site)
            : site
        ),
      }));
    } else {
      if (
        sites.some(
          (s) =>
            s.name.toLowerCase() === cleanSiteData.name?.toLowerCase()
        )
      ) {
        toast({
          variant: "destructive",
          title: "A site with this name already exists.",
        });
        return;
      }
      const newSite = { ...cleanSiteData, id: uuid() } as Site;
      setSettings((s) => ({
        ...s,
        sites: [...(s.sites ?? []), newSite],
      }));
    }

    setIsDialogOpen(false);
  };

  return (
    <TooltipProvider>
      <Card className="overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-slate-50/70 to-blue-50/50 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-blue-950/20">
        <CardHeader className="border-b border-blue-100/80 bg-gradient-to-r from-blue-50 via-indigo-50/80 to-cyan-50/70 dark:border-blue-900/40 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-cyan-950/20">
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div className="flex-grow space-y-2">
  <CardTitle className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
      <Building2 className="h-5 w-5" />
    </span>
    Client Sites
  </CardTitle>

  <CardDescription>
    Maintain addresses, contacts, access details, and rates for each
    location.
  </CardDescription>

  <div className="flex flex-wrap gap-2">
    <Badge className="border border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300">
      Active Sites: {activeSitesCount}
    </Badge>

    <Badge className="border border-amber-200 bg-amber-100 text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/60 dark:text-amber-300">
      Inactive Sites: {inactiveSitesCount}
    </Badge>

    <Badge className="border border-blue-200 bg-blue-100 text-blue-800 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/60 dark:text-blue-300">
      All Sites: {allSitesCount}
    </Badge>
  </div>

  {settings.requireGeofence && sitesNeedingGPS > 0 && (
    <Badge variant="destructive">
      {sitesNeedingGPS} site
      {sitesNeedingGPS !== 1 && "s"} require GPS coordinates while
      geofencing is enabled.
    </Badge>
  )}
</div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search sites or contacts…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full border-blue-200 bg-white/90 pl-9 shadow-sm focus-visible:ring-blue-500 sm:w-64 dark:border-blue-900 dark:bg-slate-950/80"
              />
              </div>

              <div className="w-36">
  <Select
    value={siteFilter}
    onValueChange={(v: "active" | "inactive" | "all") => setSiteFilter(v)}
  >
    <SelectTrigger className="border-blue-200 bg-white/90 shadow-sm dark:border-blue-900 dark:bg-slate-950/80">
      <Filter className="mr-2 h-4 w-4 text-blue-600" />
      <SelectValue placeholder="Site filter" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="active">Active</SelectItem>
      <SelectItem value="inactive">Inactive</SelectItem>
      <SelectItem value="all">All Sites</SelectItem>
    </SelectContent>
  </Select>
</div>
              <div className="w-40">
                <Select
                  value={groupBy}
                  onValueChange={(v: "none" | "city" | "amount") => setGroupBy(v)}
                >
                  <SelectTrigger className="border-indigo-200 bg-white/90 shadow-sm dark:border-indigo-900 dark:bg-slate-950/80">
                    <Layers3 className="mr-2 h-4 w-4 text-indigo-600" />
                    <SelectValue placeholder="Grouping" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No grouping</SelectItem>
                    <SelectItem value="city">Group by city</SelectItem>
                    <SelectItem value="amount">
  Group by revenue range
</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenDialog(null)} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700">
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add site
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl overflow-hidden border-blue-100 p-0 shadow-2xl dark:border-blue-900">
                  <DialogHeader className="border-b border-blue-100 bg-gradient-to-r from-blue-50 via-indigo-50 to-cyan-50 px-6 py-5 dark:border-blue-900 dark:from-blue-950/60 dark:via-indigo-950/40 dark:to-cyan-950/30">
                    <DialogTitle className="flex items-center gap-2 text-xl text-slate-900 dark:text-slate-50">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      {editingSite ? "Edit site" : "New site"}
                    </DialogTitle>
                  </DialogHeader>
                 <ScrollArea className="max-h-[70vh] p-1">
  <div className="space-y-8 px-4 py-2">
    {/* =========================================================
        GENERAL
    ========================================================== */}
    <section className="space-y-4 rounded-2xl border border-blue-100 bg-blue-50/55 p-5 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/20">
      <div className="border-b pb-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-blue-900 dark:text-blue-200"><Building2 className="h-5 w-5" />General</h3>
        <p className="text-sm text-muted-foreground">
          Basic site information, address, status, and GPS location.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="siteName">Site name</Label>
          <Input
            id="siteName"
            value={siteData.name || ""}
            onChange={(e) =>
              handleDataChange("name", e.target.value)
            }
            placeholder="Enter the client site name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="status">Site status</Label>

          <Select
            value={siteData.status || "active"}
            onValueChange={(value) =>
              handleDataChange("status", value)
            }
          >
            <SelectTrigger id="status">
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr]">
        <div className="space-y-2">
          <Label htmlFor="siteColor">Color tag</Label>

          <Input
            id="siteColor"
            type="color"
            value={siteData.color || "#333333"}
            onChange={(e) =>
              handleDataChange("color", e.target.value)
            }
            className="h-10 p-1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="siteAddress">Address</Label>

          <div className="flex items-center gap-2">
            <Input
              id="siteAddress"
              value={siteData.address || ""}
              onChange={(e) =>
                handleDataChange("address", e.target.value)
              }
              placeholder="Enter the complete site address"
            />

            <Button
              asChild
              variant="outline"
              size="icon"
              disabled={!siteData.address}
            >
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  siteData.address || ""
                )}`}
                target="_blank"
                rel="noreferrer"
                title="Open in Google Maps"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>GPS location</Label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={
              siteData.lat !== undefined
                ? siteData.lat.toFixed(6)
                : ""
            }
            placeholder="Latitude"
            onChange={(e) =>
              handleDataChange(
                "lat",
                e.target.value
                  ? parseFloat(e.target.value)
                  : undefined
              )
            }
          />

          <Input
            value={
              siteData.lng !== undefined
                ? siteData.lng.toFixed(6)
                : ""
            }
            placeholder="Longitude"
            onChange={(e) =>
              handleDataChange(
                "lng",
                e.target.value
                  ? parseFloat(e.target.value)
                  : undefined
              )
            }
          />

          <Button
            type="button"
            variant="outline"
            onClick={addLocationToSite}
          >
            <MapPin className="mr-2 h-4 w-4" />
            Use current location
          </Button>
        </div>
      </div>
    </section>

    {/* =========================================================
        CONTACTS
    ========================================================== */}
    <section className="space-y-5 rounded-2xl border border-violet-100 bg-violet-50/55 p-5 shadow-sm dark:border-violet-900/50 dark:bg-violet-950/20">
      <div className="border-b pb-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-violet-900 dark:text-violet-200"><ContactRound className="h-5 w-5" />Contacts</h3>
        <p className="text-sm text-muted-foreground">
          Primary, billing, and emergency contacts for this site.
        </p>
      </div>

      {/* Primary contact */}
      <div className="space-y-3">
        <h4 className="font-medium">Primary contact</h4>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="contactName">Name</Label>

            <Input
              id="contactName"
              value={siteData.contactName || ""}
              onChange={(e) =>
                handleDataChange("contactName", e.target.value)
              }
              placeholder="Primary contact name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactPhone">Phone</Label>

            <Input
              id="contactPhone"
              type="tel"
              value={siteData.contactPhone || ""}
              onChange={(e) =>
                handleDataChange("contactPhone", e.target.value)
              }
              placeholder="Primary contact phone"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="contactEmail">Email</Label>

            <Input
              id="contactEmail"
              type="email"
              value={siteData.contactEmail || ""}
              onChange={(e) =>
                handleDataChange("contactEmail", e.target.value)
              }
              placeholder="Primary contact email"
            />
          </div>
        </div>
      </div>

      {/* Billing contact */}
      <div className="space-y-3 rounded-xl border border-violet-200/70 bg-white/75 p-4 shadow-sm dark:border-violet-900 dark:bg-slate-950/50">
        <div>
          <h4 className="font-medium">Billing contact</h4>
          <p className="text-xs text-muted-foreground">
            Person or department responsible for invoices and payments.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="billingContactName">Name</Label>

            <Input
              id="billingContactName"
              value={siteData.billingContactName || ""}
              onChange={(e) =>
                handleDataChange(
                  "billingContactName",
                  e.target.value
                )
              }
              placeholder="Billing contact name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="billingContactPhone">Phone</Label>

            <Input
              id="billingContactPhone"
              type="tel"
              value={siteData.billingContactPhone || ""}
              onChange={(e) =>
                handleDataChange(
                  "billingContactPhone",
                  e.target.value
                )
              }
              placeholder="Billing contact phone"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="billingContactEmail">Email</Label>

            <Input
              id="billingContactEmail"
              type="email"
              value={siteData.billingContactEmail || ""}
              onChange={(e) =>
                handleDataChange(
                  "billingContactEmail",
                  e.target.value
                )
              }
              placeholder="Billing contact email"
            />
          </div>
        </div>
      </div>

      {/* Emergency contact */}
      <div className="space-y-3 rounded-xl border border-violet-200/70 bg-white/75 p-4 shadow-sm dark:border-violet-900 dark:bg-slate-950/50">
        <div>
          <h4 className="font-medium">Emergency contact</h4>
          <p className="text-xs text-muted-foreground">
            Person to contact for urgent after-hours site issues.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="emergencyContactName">Name</Label>

            <Input
              id="emergencyContactName"
              value={siteData.emergencyContactName || ""}
              onChange={(e) =>
                handleDataChange(
                  "emergencyContactName",
                  e.target.value
                )
              }
              placeholder="Emergency contact name"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emergencyContactPhone">Phone</Label>

            <Input
              id="emergencyContactPhone"
              type="tel"
              value={siteData.emergencyContactPhone || ""}
              onChange={(e) =>
                handleDataChange(
                  "emergencyContactPhone",
                  e.target.value
                )
              }
              placeholder="Emergency contact phone"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="emergencyContactEmail">Email</Label>

            <Input
              id="emergencyContactEmail"
              type="email"
              value={siteData.emergencyContactEmail || ""}
              onChange={(e) =>
                handleDataChange(
                  "emergencyContactEmail",
                  e.target.value
                )
              }
              placeholder="Emergency contact email"
            />
          </div>
        </div>
      </div>
    </section>

    {/* =========================================================
        FINANCIAL
    ========================================================== */}
    <section className="space-y-5 rounded-2xl border border-emerald-100 bg-emerald-50/55 p-5 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/20">
      <div className="border-b pb-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-emerald-900 dark:text-emerald-200"><WalletCards className="h-5 w-5" />Financial</h3>
        <p className="text-sm text-muted-foreground">
          Revenue, billing frequency, fees, and bonuses.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="revenue">Revenue ($)</Label>

          <Input
            id="revenue"
            type="number"
            min="0"
            step="0.01"
            value={siteData.revenue ?? ""}
            onChange={(e) =>
              handleDataChange(
                "revenue",
                e.target.value
                  ? parseFloat(e.target.value)
                  : undefined
              )
            }
            placeholder="Example: 750"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="billingFrequency">
            Billing frequency
          </Label>

          <Select
            value={siteData.billingFrequency || "Monthly"}
            onValueChange={(value) =>
              handleDataChange("billingFrequency", value)
            }
          >
            <SelectTrigger id="billingFrequency">
              <SelectValue placeholder="Select billing frequency" />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="One-Time">One-Time</SelectItem>
              <SelectItem value="Daily">Daily</SelectItem>
              <SelectItem value="Weekly">Weekly</SelectItem>
              <SelectItem value="Bi-Weekly">Bi-Weekly</SelectItem>
              <SelectItem value="Monthly">Monthly</SelectItem>
              <SelectItem value="Quarterly">Quarterly</SelectItem>
              <SelectItem value="Yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* R/S fee */}
      <div className="space-y-3 rounded-xl border border-emerald-200/70 bg-white/75 p-4 shadow-sm dark:border-emerald-900 dark:bg-slate-950/50">
        <div>
          <h4 className="font-medium">R/S fee</h4>
          <p className="text-xs text-muted-foreground">
            Royalty and Support fee associated with this site.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="rsFeeType">Fee type</Label>

            <Select
              value={siteData.rsFeeType || "none"}
              onValueChange={(value) =>
                handleDataChange("rsFeeType", value)
              }
            >
              <SelectTrigger id="rsFeeType">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="percent">
                  % of Revenue
                </SelectItem>
                <SelectItem value="fixed">
                  Fixed Amount
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rsFeeValue">Fee value</Label>

            <Input
              id="rsFeeValue"
              type="number"
              min="0"
              step="0.01"
              value={siteData.rsFeeValue ?? ""}
              onChange={(e) =>
                handleDataChange(
                  "rsFeeValue",
                  e.target.value
                    ? parseFloat(e.target.value)
                    : undefined
                )
              }
              disabled={
                !siteData.rsFeeType ||
                siteData.rsFeeType === "none"
              }
              placeholder={
                siteData.rsFeeType === "percent"
                  ? "Example: 15"
                  : "Example: 113.10"
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rsFeeVendor">Vendor</Label>

            <Input
              id="rsFeeVendor"
              value={siteData.rsFeeVendor || ""}
              onChange={(e) =>
                handleDataChange("rsFeeVendor", e.target.value)
              }
              placeholder="Example: Coverall"
              disabled={
                !siteData.rsFeeType ||
                siteData.rsFeeType === "none"
              }
            />
          </div>
        </div>
      </div>

      {/* Other fee */}
      <div className="space-y-3 rounded-xl border border-emerald-200/70 bg-white/75 p-4 shadow-sm dark:border-emerald-900 dark:bg-slate-950/50">
        <h4 className="font-medium">Other fee</h4>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="otherFeeLabel">Fee name</Label>

            <Input
              id="otherFeeLabel"
              value={siteData.otherFeeLabel || ""}
              onChange={(e) =>
                handleDataChange(
                  "otherFeeLabel",
                  e.target.value
                )
              }
              placeholder="Example: Franchise fee"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="otherFeeType">Fee type</Label>

            <Select
              value={siteData.otherFeeType || "none"}
              onValueChange={(value) =>
                handleDataChange("otherFeeType", value)
              }
            >
              <SelectTrigger id="otherFeeType">
                <SelectValue />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="percent">
                  % of Revenue
                </SelectItem>
                <SelectItem value="fixed">
                  Fixed Amount
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="otherFeeValue">Fee value</Label>

            <Input
              id="otherFeeValue"
              type="number"
              min="0"
              step="0.01"
              value={siteData.otherFeeValue ?? ""}
              onChange={(e) =>
                handleDataChange(
                  "otherFeeValue",
                  e.target.value
                    ? parseFloat(e.target.value)
                    : undefined
                )
              }
              disabled={
                !siteData.otherFeeType ||
                siteData.otherFeeType === "none"
              }
              placeholder={
                siteData.otherFeeType === "percent"
                  ? "Example: 5"
                  : "Example: 25"
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="otherFeeVendor">Vendor</Label>

            <Input
              id="otherFeeVendor"
              value={siteData.otherFeeVendor || ""}
              onChange={(e) =>
                handleDataChange(
                  "otherFeeVendor",
                  e.target.value
                )
              }
              placeholder="Enter vendor name"
              disabled={
                !siteData.otherFeeType ||
                siteData.otherFeeType === "none"
              }
            />
          </div>
        </div>
      </div>

      {/* Bonus */}
      <div className="space-y-3 rounded-xl border border-emerald-200/70 bg-white/75 p-4 shadow-sm dark:border-emerald-900 dark:bg-slate-950/50">
        <h4 className="font-medium">Bonus</h4>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="bonusType">Bonus structure</Label>

            <Select
              value={siteData.bonusType || "none"}
              onValueChange={(value) =>
                handleDataChange(
                  "bonusType",
                  value === "none" ? undefined : value
                )
              }
            >
              <SelectTrigger id="bonusType">
                <SelectValue placeholder="No bonus" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="none">No bonus</SelectItem>
                <SelectItem value="hourly">
                  Hourly bonus
                </SelectItem>
                <SelectItem value="flat">
                  Flat amount bonus
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bonusAmount">
              Bonus amount ($)
            </Label>

            <Input
              id="bonusAmount"
              type="number"
              min="0"
              step="0.01"
              value={siteData.bonusAmount ?? ""}
              onChange={(e) =>
                handleDataChange(
                  "bonusAmount",
                  e.target.value
                    ? parseFloat(e.target.value)
                    : undefined
                )
              }
              disabled={!siteData.bonusType}
              placeholder="Enter bonus amount"
            />
          </div>
        </div>
      </div>
    </section>

    {/* =========================================================
        OPERATIONS
    ========================================================== */}
    <section className="space-y-5 rounded-2xl border border-amber-100 bg-amber-50/55 p-5 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/20">
      <div className="border-b pb-2">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-amber-900 dark:text-amber-200"><Clock3 className="h-5 w-5" />Operations</h3>
        <p className="text-sm text-muted-foreground">
          Work-time estimates and site access instructions.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Estimated work time</Label>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label
              htmlFor="estimatedWorkHours"
              className="text-xs text-muted-foreground"
            >
              Hours
            </Label>

            <Input
              id="estimatedWorkHours"
              type="number"
              min="0"
              step="1"
              value={Math.floor(
                (siteData.estimatedWorkMinutes ?? 0) / 60
              )}
              onChange={(e) => {
                const hours = Math.max(
                  0,
                  Math.floor(Number(e.target.value) || 0)
                );

                const currentMinutes =
                  (siteData.estimatedWorkMinutes ?? 0) % 60;

                handleDataChange(
                  "estimatedWorkMinutes",
                  hours * 60 + currentMinutes
                );
              }}
              placeholder="0"
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="estimatedWorkMinutes"
              className="text-xs text-muted-foreground"
            >
              Minutes
            </Label>

            <Input
              id="estimatedWorkMinutes"
              type="number"
              min="0"
              max="59"
              step="5"
              value={
                (siteData.estimatedWorkMinutes ?? 0) % 60
              }
              onChange={(e) => {
                const minutes = Math.min(
                  59,
                  Math.max(
                    0,
                    Math.floor(Number(e.target.value) || 0)
                  )
                );

                const currentHours = Math.floor(
                  (siteData.estimatedWorkMinutes ?? 0) / 60
                );

                handleDataChange(
                  "estimatedWorkMinutes",
                  currentHours * 60 + minutes
                );
              }}
              placeholder="0"
            />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Average active work time required to complete service at
          this site.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="entranceMethod">Access notes</Label>

          <Input
            id="entranceMethod"
            value={siteData.entranceMethod || ""}
            onChange={(e) =>
              handleDataChange(
                "entranceMethod",
                e.target.value
              )
            }
            placeholder="Gate code, lockbox, door, keys, etc."
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="alarmCode">Alarm information</Label>

          <Input
            id="alarmCode"
            value={siteData.alarmCode || ""}
            onChange={(e) =>
              handleDataChange("alarmCode", e.target.value)
            }
            placeholder="Alarm code or alarm instructions"
          />
        </div>
      </div>
    </section>
  </div>
</ScrollArea>
                  <DialogFooter className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleSubmit} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700">Save site</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent className="bg-gradient-to-b from-white/80 to-slate-50/80 p-4 sm:p-6 dark:from-slate-950/80 dark:to-slate-900/70">
          <ScrollArea className="h-[70vh] pr-2">
            {Object.keys(groupedSites).length > 0 ? (
              <Accordion
                type="multiple"
                defaultValue={Object.keys(groupedSites)}
              >
                {Object.entries(groupedSites)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([groupName, sitesInGroup]) => (
                    <AccordionItem value={groupName} key={groupName} className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white/80 px-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
                      <AccordionTrigger className="text-base font-semibold text-slate-800 hover:no-underline dark:text-slate-100">
  {groupBy === "none" ? groupName : `${groupName} (${sitesInGroup.length})`}
</AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-6 pl-4">
                          {sitesInGroup.map((site, idx) => {
                            const key =
                              site.id ??
                              (site.name
                                ? `site-${site.name}`
                                : `site-idx-${idx}`);
                            return (
                              <Card
                                key={key}
                                className="group overflow-hidden border-slate-200 bg-gradient-to-br from-white via-white to-slate-50 shadow-md transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900"
                                style={{
                                  borderTopColor: site.color,
                                  borderTopWidth: "4px",
                                }}
                              >
                                <CardHeader className="flex flex-row justify-between items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-blue-50/60 dark:border-slate-800 dark:from-slate-900/80 dark:to-blue-950/20">
                                  <div className="space-y-1">
                                    <CardTitle className="text-lg flex items-center gap-2 text-slate-900 dark:text-slate-50">
                                      <span className="h-3 w-3 rounded-full shadow-sm" style={{ backgroundColor: site.color || "#2563eb" }} />
                                      {site.name}
                                    </CardTitle>
                                    {site.address && (
                                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <span>{site.address}</span>
                                        <Button
                                          asChild
                                          variant="outline"
                                          size="icon"
                                          className="h-7 w-7"
                                        >
                                          <a
                                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                                              site.address
                                            )}`}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <ExternalLink className="h-4 w-4" />
                                          </a>
                                        </Button>
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => handleOpenDialog(site)}
                                      aria-label="Edit site"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteSite(site.id)}
                                      aria-label="Delete site"
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
                                    </Button>
                                  </div>
                                </CardHeader>
                                <CardContent className="pt-5">
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                                    <div className="space-y-2 rounded-xl border border-violet-100 bg-violet-50/50 p-4 dark:border-violet-900/50 dark:bg-violet-950/15">
                                      <h4 className="font-semibold text-violet-800 flex items-center gap-2 dark:text-violet-300">
                                        <User className="h-4 w-4" />
                                        Contact
                                      </h4>
                                      <p>
                                        <strong>Name:</strong>{" "}
                                        {site.contactName || "Not provided"}
                                      </p>
                                      <p>
                                        <strong>Phone:</strong>{" "}
                                        {site.contactPhone || "Not provided"}
                                      </p>
                                      <p>
                                        <strong>Email:</strong>{" "}
                                        {site.contactEmail || "Not provided"}
                                      </p>
                                      <div className="mt-3 border-t pt-3">
  <p className="font-medium">Billing contact</p>

  <p>
    <strong>Name:</strong>{" "}
    {site.billingContactName || "Not provided"}
  </p>

  <p>
    <strong>Phone:</strong>{" "}
    {site.billingContactPhone || "Not provided"}
  </p>

  <p>
    <strong>Email:</strong>{" "}
    {site.billingContactEmail || "Not provided"}
  </p>
</div>

<div className="mt-3 border-t pt-3">
  <p className="font-medium">Emergency contact</p>

  <p>
    <strong>Name:</strong>{" "}
    {site.emergencyContactName || "Not provided"}
  </p>

  <p>
    <strong>Phone:</strong>{" "}
    {site.emergencyContactPhone || "Not provided"}
  </p>

  <p>
    <strong>Email:</strong>{" "}
    {site.emergencyContactEmail || "Not provided"}
  </p>
</div>
                                    </div>

                                    <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-900/50 dark:bg-amber-950/15">
                                      <h4 className="font-semibold text-amber-800 flex items-center gap-2 dark:text-amber-300">
                                        <KeyRound className="h-4 w-4" />
                                        Access
                                      </h4>
                                      <p>
                                        <strong>Access notes:</strong>{" "}
                                        {site.entranceMethod || "Not provided"}
                                      </p>
                                      <p>
                                        <strong>Alarm:</strong>{" "}
                                        {site.alarmCode || "Not provided"}
                                      </p>
                                    </div>

                                    <div className="space-y-2 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/15">
                                      <h4 className="font-semibold text-emerald-800 flex items-center gap-2 dark:text-emerald-300">
                                        <DollarSign className="h-4 w-4" />
                                        Billing
                                      </h4>
                                      
                                       <div className="space-y-1">
 {(() => {
  const revenue = getSiteRevenue(site);
  const rsAmount = calculateFee(
    revenue,
    site.rsFeeType,
    site.rsFeeValue
  );
  const otherAmount = calculateFee(
    revenue,
    site.otherFeeType,
    site.otherFeeValue
  );

  return (
    <>
      <p>
        <strong>Status:</strong>{" "}
        <Badge className={site.status === "inactive" ? "border border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300" : "border border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300"}>
          {site.status || "active"}
        </Badge>
      </p>

      <p>
        <strong>Revenue:</strong>{" "}
        {revenue ? `$${revenue.toFixed(2)}` : "Not set"}
      </p>
      <p>
  <strong>Billing frequency:</strong>{" "}
  {site.billingFrequency || "Not set"}
</p>
<p>
        <strong>Estimated work time:</strong>{" "}
        {formatDuration(site.estimatedWorkMinutes)}
      </p>
      <p>
       <strong className="inline-flex items-center gap-1">
  R/S
  <Tooltip>
    <TooltipTrigger asChild>
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border text-[10px] text-muted-foreground"
      >
        i
      </button>
    </TooltipTrigger>
    <TooltipContent>
      Royalty and Support Fee
    </TooltipContent>
  </Tooltip>
  :
</strong>{" "}
{site.rsFeeType && site.rsFeeType !== "none"
  ? `$${rsAmount.toFixed(2)}`
  : "Not set"}
      </p>

      <p>
        <strong>Other fee:</strong>{" "}
        {site.otherFeeType && site.otherFeeType !== "none"
          ? `${site.otherFeeLabel || "Other fee"} · ${
              site.otherFeeType === "percent"
                ? `${site.otherFeeValue}%`
                : `$${otherAmount.toFixed(2)}`
            }`
          : "Not set"}
      </p>
    </>
  );
})()}
</div>
                                      {site.bonusType ? (
                                        <p>
                                          <strong>Bonus:</strong>{" "}
                                          <span className="capitalize">
                                            {site.bonusType}
                                          </span>{" "}
                                          {site.bonusAmount !== undefined &&
                                            `· $${site.bonusAmount.toFixed(
                                              2
                                            )}`}
                                        </p>
                                      ) : (
                                        <p className="text-muted-foreground">
                                          No bonus set.
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] items-start">
                                    <div className="space-y-1">
                                      {settings.requireGeofence && (
                                        <p className="text-xs text-muted-foreground">
                                          Global geofence radius:{" "}
                                          <span className="font-medium">
                                            {settings.geofenceRadius ?? 150} ft
                                          </span>
                                        </p>
                                      )}

                                      {settings.requireGeofence &&
  (site.lat === undefined || site.lng === undefined) && (
    <Badge className="border border-rose-200 bg-rose-100 text-rose-800 dark:border-rose-900 dark:bg-rose-950/60 dark:text-rose-300">
      GPS coordinates are required for this site while geofencing is
      enabled.
    </Badge>
  )}
                                    </div>

                                    <div className="flex flex-col gap-2 sm:items-end">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setSiteLocationFromHere(site.id)
                                        }
                                      >
                                        Set GPS from current location
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        onClick={() => testGeofence(site)}
                                        disabled={site.lat === undefined || site.lng === undefined}
                                      >
                                        Test geofence
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            ) : (
              <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/50 px-6 text-center text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/20 dark:text-blue-300">
                {searchQuery
                  ? `No sites match “${searchQuery}”.`
                  : "No sites have been created yet. Use “Add site” to set up your first client location."}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}