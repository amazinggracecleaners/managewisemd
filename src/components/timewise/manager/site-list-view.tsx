
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
import {
  User,
  KeyRound,
  DollarSign,
  ExternalLink,
  PlusCircle,
  Edit,
  MapPin,
  Trash2,
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
import { TooltipProvider } from "@/components/ui/tooltip";

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

const getPriceRange = (price?: number): string => {
  const p = price || 0;
  if (p === 0) return "No price";
  if (p <= 100) return "$0–$100";
  if (p <= 250) return "$101–$250";
  if (p <= 500) return "$251–$500";
  return "$501+";
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
        ? (sites ?? []).filter((s) => !s.lat || !s.lng).length
        : 0,
    [settings.requireGeofence, sites]
  );

  const filteredSites = useMemo(() => {
    if (!searchQuery.trim()) {
      return sites;
    }
    const query = searchQuery.toLowerCase();
    return sites.filter(
      (site) =>
        site.name.toLowerCase().includes(query) ||
        site.address?.toLowerCase().includes(query) ||
        site.contactName?.toLowerCase().includes(query)
    );
  }, [sites, searchQuery]);

  const groupedSites = useMemo(() => {
    if (groupBy === "none") {
      return {
        "All sites": [...filteredSites].sort((a, b) =>
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
        key = getPriceRange(site.servicePrice);
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(site);
    });

    Object.values(groups).forEach((group) =>
      group.sort((a, b) => a.name.localeCompare(b.name))
    );

    return groups;
  }, [filteredSites, groupBy]);

  const handleOpenDialog = (site: Site | null) => {
    setEditingSite(site);
    setSiteData(site ? { ...site } : { name: "", color: "#333333" });
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
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start flex-wrap gap-4">
            <div className="flex-grow space-y-1">
              <CardTitle className="text-xl">Client sites</CardTitle>
              <CardDescription>
                Maintain addresses, contacts, access details, and rates for each
                location.
              </CardDescription>
              {settings.requireGeofence && sitesNeedingGPS > 0 && (
                <Badge variant="destructive" className="mt-2">
                  {sitesNeedingGPS} site
                  {sitesNeedingGPS !== 1 && "s"} require GPS coordinates while
                  geofencing is enabled.
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search by name, address, or contact…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-56"
              />
              <div className="w-40">
                <Select
                  value={groupBy}
                  onValueChange={(v: "none" | "city" | "amount") => setGroupBy(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Grouping" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No grouping</SelectItem>
                    <SelectItem value="city">Group by city</SelectItem>
                    <SelectItem value="amount">Group by billing range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenDialog(null)}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add site
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingSite ? "Edit site" : "New site"}
                    </DialogTitle>
                  </DialogHeader>
                  <ScrollArea className="max-h-[70vh] p-1">
                    <div className="space-y-4 px-4 py-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="siteName">Site name</Label>
                          <Input
                            id="siteName"
                            value={siteData.name || ""}
                            onChange={(e) =>
                              handleDataChange("name", e.target.value)
                            }
                          />
                        </div>
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

                      <div className="space-y-2">
                        <Label>Geofence location (latitude / longitude)</Label>
                        <div className="flex gap-2 items-center">
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
                            <MapPin className="mr-1 h-4 w-4" />
                            Use current location
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="contactName">Primary contact</Label>
                          <Input
                            id="contactName"
                            value={siteData.contactName || ""}
                            onChange={(e) =>
                              handleDataChange("contactName", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contactPhone">Contact phone</Label>
                          <Input
                            id="contactPhone"
                            value={siteData.contactPhone || ""}
                            onChange={(e) =>
                              handleDataChange("contactPhone", e.target.value)
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="contactEmail">Contact email</Label>
                          <Input
                            id="contactEmail"
                            type="email"
                            value={siteData.contactEmail || ""}
                            onChange={(e) =>
                              handleDataChange("contactEmail", e.target.value)
                            }
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            placeholder="Gate code, door type, lockbox, etc."
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="alarmCode">Alarm details</Label>
                          <Input
                            id="alarmCode"
                            value={siteData.alarmCode || ""}
                            onChange={(e) =>
                              handleDataChange("alarmCode", e.target.value)
                            }
                            placeholder="Alarm code or instructions"
                          />
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="servicePrice">
                              Standard service amount ($)
                            </Label>
                            <Input
                              id="servicePrice"
                              type="number"
                              value={siteData.servicePrice ?? ""}
                              onChange={(e) =>
                                handleDataChange(
                                  "servicePrice",
                                  e.target.value
                                    ? parseFloat(e.target.value)
                                    : undefined
                                )
                              }
                              placeholder="Example: 250"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="bonusType">Bonus structure</Label>
                            <Select
                              value={siteData.bonusType || "none"}
                              onValueChange={(v) =>
                                handleDataChange(
                                  "bonusType",
                                  v === "none" ? undefined : v
                                )
                              }
                            >
                              <SelectTrigger>
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
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                          <div className="space-y-2 sm:col-start-2">
                            <Label htmlFor="bonusAmount">
                              Bonus amount ($)
                            </Label>
                            <Input
                              id="bonusAmount"
                              type="number"
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
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button onClick={handleSubmit}>Save site</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <ScrollArea className="h-[70vh]">
            {Object.keys(groupedSites).length > 0 ? (
              <Accordion
                type="multiple"
                defaultValue={Object.keys(groupedSites)}
              >
                {Object.entries(groupedSites)
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([groupName, sitesInGroup]) => (
                    <AccordionItem value={groupName} key={groupName}>
                      <AccordionTrigger className="text-base font-semibold">
                        {groupName} ({sitesInGroup.length})
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
                                className="overflow-hidden"
                                style={{
                                  borderTopColor: site.color,
                                  borderTopWidth: "4px",
                                }}
                              >
                                <CardHeader className="flex flex-row justify-between items-start gap-3">
                                  <div className="space-y-1">
                                    <CardTitle className="text-lg flex items-center gap-2">
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
                                <CardContent>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm">
                                    <div className="space-y-1">
                                      <h4 className="font-semibold text-muted-foreground flex items-center gap-2">
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
                                    </div>

                                    <div className="space-y-1">
                                      <h4 className="font-semibold text-muted-foreground flex items-center gap-2">
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

                                    <div className="space-y-1">
                                      <h4 className="font-semibold text-muted-foreground flex items-center gap-2">
                                        <DollarSign className="h-4 w-4" />
                                        Billing
                                      </h4>
                                      <p>
                                        <strong>Standard amount:</strong>{" "}
                                        {site.servicePrice
                                          ? `$${site.servicePrice.toFixed(2)}`
                                          : "Not set"}
                                      </p>
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
                                        (!site.lat || !site.lng) && (
                                          <Badge variant="destructive">
                                            GPS coordinates are required for
                                            this site while geofencing is
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
                                        disabled={!site.lat || !site.lng}
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
              <div className="flex items-center justify-center h-48 text-muted-foreground border rounded-lg text-sm text-center px-6">
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
