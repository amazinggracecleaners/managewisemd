"use client";

import React, { useMemo, useState } from "react";
import type { MileageLog, Site } from "@/shared/types/domain";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlusCircle, Trash2, Edit, Play, Square, MapPin, Download } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  format,
  parseISO,
  isValid,
  isToday,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
} from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ✅ Tooltip for the GPS icon (fixes the "title" prop error on lucide icons)
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Haversine formula to calculate distance between two lat/lng points
const haversineDistance = (
  coords1: { lat: number; lng: number },
  coords2: { lat: number; lng: number }
): number => {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 3959; // Earth radius in miles

  const dLat = toRad(coords2.lat - coords1.lat);
  const dLon = toRad(coords2.lng - coords1.lng);
  const lat1 = toRad(coords1.lat);
  const lat2 = toRad(coords2.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

interface MileageViewProps {
  mileageLogs: MileageLog[];
  sites: Site[];
  addMileageLog: (log: Omit<MileageLog, "id">) => void;
  updateMileageLog: (id: string, updates: Partial<MileageLog>) => void;
  deleteMileageLog: (id: string) => void;
  fromDate: string;
  toDate: string;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));
const months = [
  { value: "0", label: "January" },
  { value: "1", label: "February" },
  { value: "2", label: "March" },
  { value: "3", label: "April" },
  { value: "4", label: "May" },
  { value: "5", label: "June" },
  { value: "6", label: "July" },
  { value: "7", label: "August" },
  { value: "8", label: "September" },
  { value: "9", label: "October" },
  { value: "10", label: "November" },
  { value: "11", label: "December" },
];

export function MileageView({
  mileageLogs,
  sites,
  addMileageLog,
  updateMileageLog,
  deleteMileageLog,
  fromDate: customFromDate,
  toDate: customToDate,
}: MileageViewProps) {
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<MileageLog | null>(null);

  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [distance, setDistance] = useState("");
  const [purpose, setPurpose] = useState("");
  const [siteName, setSiteName] = useState("");

  const [isTracking, setIsTracking] = useState(false);
  const [startCoords, setStartCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [tripPurpose, setTripPurpose] = useState("");
  const [tripSiteName, setTripSiteName] = useState("");

  const [viewType, setViewType] = useState<"custom" | "monthly" | "annually">("custom");
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth()));
  const [groupBy, setGroupBy] = useState<"purpose" | "site">("purpose");

  const { fromDate, toDate: toDateObj } = useMemo(() => {
    if (viewType === "monthly") {
      const year = parseInt(selectedYear, 10);
      const month = parseInt(selectedMonth, 10);
      const start = new Date(year, month, 1);
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
      return { fromDate: start, toDate: end };
    }

    if (viewType === "annually") {
      const year = parseInt(selectedYear, 10);
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59, 999);
      return { fromDate: start, toDate: end };
    }

    // Custom from Dashboard filters
    const start = customFromDate ? new Date(`${customFromDate}T00:00:00`) : null;
    const end = customToDate ? new Date(`${customToDate}T23:59:59`) : null;
    return { fromDate: start, toDate: end };
  }, [viewType, selectedYear, selectedMonth, customFromDate, customToDate]);

  const filteredMileageLogs = useMemo(() => {
    const fromTime = fromDate?.getTime();
    const toTime = toDateObj?.getTime();

    return mileageLogs.filter((log) => {
      if (!log.date || !isValid(parseISO(log.date))) return false;

      const logDate = parseISO(log.date).getTime();

      if (!fromTime && !toTime) return true;
      if (fromTime && logDate < fromTime) return false;
      if (toTime && logDate > toTime) return false;
      return true;
    });
  }, [mileageLogs, fromDate, toDateObj]);

  const handleOpenDialog = (log: MileageLog | null = null) => {
    setEditingLog(log);

    if (log) {
      setDate(log.date);
      setDistance(String(log.distance));
      setPurpose(log.purpose);
      setSiteName(log.siteName || "");
    } else {
      setDate(format(new Date(), "yyyy-MM-dd"));
      setDistance("");
      setPurpose("");
      setSiteName("");
    }

    setIsDialogOpen(true);
  };

  const handleSubmit = () => {
    const numDistance = parseFloat(distance);

    if (!date || !distance || !purpose || Number.isNaN(numDistance)) {
      toast({
        variant: "destructive",
        title: "Missing required fields",
        description: "Please fill out Date, Distance, and Purpose correctly.",
      });
      return;
    }

    const dataToSave: Partial<MileageLog> = { date, distance: numDistance, purpose };
    if (siteName) dataToSave.siteName = siteName;

    if (editingLog) {
      updateMileageLog(editingLog.id, dataToSave);
      toast({ title: "Mileage log updated." });
    } else {
      addMileageLog(dataToSave as Omit<MileageLog, "id">);
      toast({ title: "Mileage log added." });
    }

    setIsDialogOpen(false);
  };

  const startTracking = () => {
    if (!tripPurpose.trim()) {
      toast({ variant: "destructive", title: "Please enter a purpose for the trip." });
      return;
    }
    if (!navigator.geolocation) {
      toast({ variant: "destructive", title: "Geolocation is not supported by your browser." });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setStartCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsTracking(true);
        toast({ title: "Trip started!", description: "GPS location captured." });
      },
      () => {
        toast({ variant: "destructive", title: "Unable to retrieve your location." });
      },
      { enableHighAccuracy: true }
    );
  };

  const stopTracking = () => {
    if (!startCoords) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const endCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
        const calculatedDistance = haversineDistance(startCoords, endCoords);

        const logData: Omit<MileageLog, "id"> = {
          date: format(new Date(), "yyyy-MM-dd"),
          distance: calculatedDistance,
          purpose: tripPurpose,
          siteName: tripSiteName || undefined,
          startCoords,
          endCoords,
        } as any;

        addMileageLog(logData);

        toast({
          title: "Trip ended.",
          description: `Logged ${calculatedDistance.toFixed(1)} miles.`,
        });

        setIsTracking(false);
        setStartCoords(null);
        setTripPurpose("");
        setTripSiteName("");
      },
      () => {
        toast({ variant: "destructive", title: "Unable to retrieve your final location." });
      },
      { enableHighAccuracy: true }
    );
  };

  const downloadCSV = () => {
    const header = ["Date", "Distance (miles)", "Purpose", "Site", "GPS Tracked"];
    const rows = filteredMileageLogs.map((log) => [
      log.date,
      log.distance.toFixed(2),
      log.purpose,
      log.siteName || "",
      log.startCoords && log.endCoords ? "Yes" : "No",
    ]);

    const csvContent = [header, ...rows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `mileage-logs-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({ title: "Mileage CSV downloaded." });
  };

  const totalMileage = useMemo(
    () => filteredMileageLogs.reduce((sum, log) => sum + log.distance, 0),
    [filteredMileageLogs]
  );

  const mileageSummary = useMemo(() => {
    const summary = new Map<string, { totalDistance: number; count: number }>();

    filteredMileageLogs.forEach((log) => {
      const key =
        groupBy === "site"
          ? log.siteName || "No Site"
          : log.purpose || "Uncategorized";

      const entry = summary.get(key) || { totalDistance: 0, count: 0 };
      entry.totalDistance += log.distance;
      entry.count += 1;
      summary.set(key, entry);
    });

    return Array.from(summary.entries())
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => b.totalDistance - a.totalDistance);
  }, [filteredMileageLogs, groupBy]);

  const calculateMileageForPeriod = (startDate: Date, endDate: Date) => {
    return mileageLogs.reduce((sum, log) => {
      if (!log.date || !isValid(parseISO(log.date))) return sum;
      const logDate = parseISO(log.date);
      return logDate >= startDate && logDate <= endDate ? sum + log.distance : sum;
    }, 0);
  };

  const totalMileageToday = useMemo(() => {
    return mileageLogs.reduce((sum, log) => {
      if (!log.date || !isValid(parseISO(log.date))) return sum;
      return isToday(parseISO(log.date)) ? sum + log.distance : sum;
    }, 0);
  }, [mileageLogs]);

  const totalMileageThisWeek = useMemo(() => {
    const start = startOfWeek(new Date());
    const end = endOfWeek(new Date());
    return calculateMileageForPeriod(start, end);
  }, [mileageLogs]);

  const totalMileageThisMonth = useMemo(() => {
    const start = startOfMonth(new Date());
    const end = endOfMonth(new Date());
    return calculateMileageForPeriod(start, end);
  }, [mileageLogs]);

  const totalMileageThisYear = useMemo(() => {
    const start = startOfYear(new Date());
    const end = endOfYear(new Date());
    return calculateMileageForPeriod(start, end);
  }, [mileageLogs]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Date Range</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-2">
              <Label>View Type</Label>
              <Select value={viewType} onValueChange={(v: any) => setViewType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom">Custom Range (from Dashboard)</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {viewType !== "custom" && (
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {viewType === "monthly" && (
              <div className="space-y-2">
                <Label>Month</Label>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Mileage Totals</CardTitle>
            <CardDescription>At-a-glance mileage summary.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="week">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="week">This Week</TabsTrigger>
                <TabsTrigger value="month">This Month</TabsTrigger>
                <TabsTrigger value="year">This Year</TabsTrigger>
              </TabsList>

              <TabsContent value="today" className="pt-4">
                <div className="text-center">
                  <p className="text-3xl font-bold">{totalMileageToday.toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">miles today</p>
                </div>
              </TabsContent>

              <TabsContent value="week" className="pt-4">
                <div className="text-center">
                  <p className="text-3xl font-bold">{totalMileageThisWeek.toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">miles this week</p>
                </div>
              </TabsContent>

              <TabsContent value="month" className="pt-4">
                <div className="text-center">
                  <p className="text-3xl font-bold">{totalMileageThisMonth.toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">miles this month</p>
                </div>
              </TabsContent>

              <TabsContent value="year" className="pt-4">
                <div className="text-center">
                  <p className="text-3xl font-bold">{totalMileageThisYear.toFixed(1)}</p>
                  <p className="text-sm text-muted-foreground">miles this year</p>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SUMMARY */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center gap-3">
              <div>
                <CardTitle>Mileage Summary</CardTitle>
                <CardDescription>
                  A pivot table summarizing mileage for the selected period.
                </CardDescription>
              </div>
              <div className="w-48">
                <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purpose">Group by Purpose</SelectItem>
                    <SelectItem value="site">Group by Site</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[450px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="capitalize">{groupBy}</TableHead>
                    <TableHead># Trips</TableHead>
                    <TableHead className="text-right">Total Distance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mileageSummary.length > 0 ? (
                    mileageSummary.map((item) => (
                      <TableRow key={item.key}>
                        <TableCell className="font-medium">{item.key}</TableCell>
                        <TableCell>{item.count}</TableCell>
                        <TableCell className="text-right">
                          {item.totalDistance.toFixed(1)} mi
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={3} className="h-24 text-center">
                        No mileage to summarize for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* TRACKER */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center gap-3 flex-wrap">
              <div>
                <CardTitle>Mileage Tracker</CardTitle>
                <CardDescription>Log and manage manager mileage.</CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={downloadCSV}
                  variant="outline"
                  size="sm"
                  disabled={filteredMileageLogs.length === 0}
                >
                  <Download className="mr-2 h-4 w-4" /> CSV
                </Button>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenDialog()} size="sm">
                      <PlusCircle className="mr-2 h-4 w-4" /> Add Manually
                    </Button>
                  </DialogTrigger>

                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editingLog ? "Edit" : "Add"} Mileage Log</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="date">Date</Label>
                        <Input
                          id="date"
                          type="date"
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="distance">Distance (miles)</Label>
                        <Input
                          id="distance"
                          type="number"
                          value={distance}
                          onChange={(e) => setDistance(e.target.value)}
                          placeholder="e.g., 25.5"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="siteName">Site (Optional)</Label>
                        <Select value={siteName} onValueChange={setSiteName}>
                          <SelectTrigger id="siteName">
                            <SelectValue placeholder="Select a site..." />
                          </SelectTrigger>
                          <SelectContent>
                            {sites.map((s) => (
                              <SelectItem key={s.name} value={s.name}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="purpose">Purpose</Label>
                        <Input
                          id="purpose"
                          value={purpose}
                          onChange={(e) => setPurpose(e.target.value)}
                          placeholder="e.g., Supply run"
                          required
                        />
                      </div>
                    </div>

                    <DialogFooter>
                      <DialogClose asChild>
                        <Button variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button onClick={handleSubmit}>Save</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {/* Trip tracking */}
            <Card className="mb-6 bg-muted/50">
              <CardHeader>
                <CardTitle className="text-lg">Track a New Trip</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="trip-site">Site (Optional)</Label>
                      <Select
                        value={tripSiteName}
                        onValueChange={setTripSiteName}
                        disabled={isTracking}
                      >
                        <SelectTrigger id="trip-site">
                          <SelectValue placeholder="Select a site..." />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.map((s) => (
                            <SelectItem key={s.name} value={s.name}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="trip-purpose">Purpose</Label>
                      <Input
                        id="trip-purpose"
                        placeholder="e.g., Supply run"
                        value={tripPurpose}
                        onChange={(e) => setTripPurpose(e.target.value)}
                        disabled={isTracking}
                      />
                    </div>
                  </div>

                  {!isTracking ? (
                    <Button onClick={startTracking} className="w-full" disabled={!tripPurpose.trim()}>
                      <Play className="mr-2" />
                      Start Trip
                    </Button>
                  ) : (
                    <Button onClick={stopTracking} variant="destructive" className="w-full">
                      <Square className="mr-2" />
                      Stop Trip
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Logs table */}
            <ScrollArea className="h-72">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Purpose</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>GPS</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {filteredMileageLogs.length > 0 ? (
                    filteredMileageLogs
                      .slice()
                      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())
                      .map((log) => (
                        <TableRow key={log.id}>
                          <TableCell>{log.date}</TableCell>
                          <TableCell>{log.purpose}</TableCell>
                          <TableCell>{log.siteName || "–"}</TableCell>
                          <TableCell>{log.distance.toFixed(1)} mi</TableCell>

                          <TableCell>
                            {log.startCoords && log.endCoords ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex items-center">
                                      <MapPin className="h-5 w-5 text-green-600" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>GPS Tracked</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>

                          <TableCell className="text-right">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(log)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => deleteMileageLog(log.id)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-24 text-center">
                        No mileage logs for this period.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="text-right font-bold mt-4">
              Total Mileage for Period: {totalMileage.toFixed(1)} miles
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
