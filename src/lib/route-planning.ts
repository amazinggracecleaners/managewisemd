import type {
  CleaningSchedule,
  Site,
} from "@/shared/types/domain";

import {
  addTravelEstimates,
  optimizeRouteFromStart,
} from "@/lib/routing";

export type PlannedRouteStop = {
  schedule: CleaningSchedule;
  site?: Site;

  cleaningMinutes: number;

  automaticTravelMinutes: number;
  customTravelMinutes?: number;
  effectiveTravelMinutes: number;

  distanceMiles: number;
};

export type DailyRoutePlan = {
  stops: PlannedRouteStop[];

  totalCleaningMinutes: number;
  totalTravelMinutes: number;
  totalEstimatedMinutes: number;
};

type BuildDailyRoutePlanOptions = {
  schedules: CleaningSchedule[];
  sites: Site[];

  startingLocation?: {
    lat: number;
    lng: number;
  } | null;
};

export function buildDailyRoutePlan({
  schedules,
  sites,
  startingLocation,
}: BuildDailyRoutePlanOptions): DailyRoutePlan {
  const schedulesWithSites = schedules.map((schedule) => {
    const site = sites.find(
      (candidate) =>
        candidate.name === schedule.siteName
    );

    return {
      schedule,
      site,
      lat: site?.lat,
      lng: site?.lng,
    };
  });

  const orderedStops = optimizeRouteFromStart(
    schedulesWithSites,
    startingLocation
  );

  const stopsWithTravel = addTravelEstimates(
    orderedStops,
    startingLocation
  );

  const stops: PlannedRouteStop[] =
    stopsWithTravel.map(
      ({
        item,
        automaticTravelMinutes,
        distanceMiles,
      }) => {
        const useCustomTravel =
          item.schedule.travelTimeMode === "custom" &&
          item.schedule.customTravelMinutes !== undefined;

        const effectiveTravelMinutes =
          useCustomTravel
            ? Math.max(
                0,
                item.schedule.customTravelMinutes ?? 0
              )
            : automaticTravelMinutes;

        return {
          schedule: item.schedule,
          site: item.site,

          cleaningMinutes: Math.max(
            0,
            item.site?.estimatedWorkMinutes ?? 0
          ),

          automaticTravelMinutes,

          customTravelMinutes:
            item.schedule.customTravelMinutes,

          effectiveTravelMinutes,

          distanceMiles,
        };
      }
    );

  const totalCleaningMinutes = stops.reduce(
    (total, stop) =>
      total + stop.cleaningMinutes,
    0
  );

  const totalTravelMinutes = stops.reduce(
    (total, stop) =>
      total + stop.effectiveTravelMinutes,
    0
  );

  return {
    stops,

    totalCleaningMinutes,

    totalTravelMinutes,

    totalEstimatedMinutes:
      totalCleaningMinutes +
      totalTravelMinutes,
  };
}

export function subtractMinutesFromTime(
  finishTime: string,
  minutesToSubtract: number
): string | null {
  if (!/^\d{2}:\d{2}$/.test(finishTime)) {
    return null;
  }

  const [hours, minutes] = finishTime
    .split(":")
    .map(Number);

  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }

  const finishTotalMinutes =
    hours * 60 + minutes;

  const result =
    (
      finishTotalMinutes -
      Math.max(0, minutesToSubtract) +
      24 * 60
    ) %
    (24 * 60);

  const resultHours =
    Math.floor(result / 60);

  const resultMinutes =
    result % 60;

  return `${String(resultHours).padStart(
    2,
    "0"
  )}:${String(resultMinutes).padStart(
    2,
    "0"
  )}`;
}

export function formatMinutes(
  totalMinutes: number
): string {
  const safeMinutes = Math.max(
    0,
    Math.round(totalMinutes)
  );

  const hours =
    Math.floor(safeMinutes / 60);

  const minutes =
    safeMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}

export function formatClockTime(
  time?: string | null
): string {
  if (
    !time ||
    !/^\d{2}:\d{2}$/.test(time)
  ) {
    return "Not set";
  }

  const [hours, minutes] =
    time.split(":").map(Number);

  if (
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return "Not set";
  }

  const suffix =
    hours >= 12 ? "PM" : "AM";

  const displayHours =
    hours % 12 || 12;

  return `${displayHours}:${String(
    minutes
  ).padStart(2, "0")} ${suffix}`;
}