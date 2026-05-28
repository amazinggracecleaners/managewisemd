export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
) {
  const R = 3958.8;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

export function estimateDriveMinutes(miles: number, avgMph = 35) {
  if (!Number.isFinite(miles) || miles <= 0) return 0;
  return Math.max(1, Math.round((miles / avgMph) * 60));
}

export function optimizeRouteByNearest<T extends {
  lat?: number;
  lng?: number;
}>(stops: T[]) {
  const remaining = stops.filter((s) => s.lat != null && s.lng != null);
  const noCoords = stops.filter((s) => s.lat == null || s.lng == null);

  if (remaining.length <= 1) return stops;

  const ordered: T[] = [];
  let current = remaining.shift()!;

  ordered.push(current);

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    remaining.forEach((stop, index) => {
      const distance = haversineMiles(
        current.lat!,
        current.lng!,
        stop.lat!,
        stop.lng!
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    current = remaining.splice(nearestIndex, 1)[0];
    ordered.push(current);
  }

  return [...ordered, ...noCoords];
}

export function optimizeRouteFromStart<T extends {
  lat?: number;
  lng?: number;
}>(
  stops: T[],
  start?: { lat: number; lng: number } | null
) {
  if (!start) {
    return optimizeRouteByNearest(stops);
  }

  const remaining = stops.filter((s) => s.lat != null && s.lng != null);
  const noCoords = stops.filter((s) => s.lat == null || s.lng == null);

  if (remaining.length <= 1) return stops;

  const ordered: T[] = [];

  let currentLat = start.lat;
  let currentLng = start.lng;

  while (remaining.length > 0) {
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    remaining.forEach((stop, index) => {
      const distance = haversineMiles(
        currentLat,
        currentLng,
        stop.lat!,
        stop.lng!
      );

      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    const next = remaining.splice(nearestIndex, 1)[0];

    ordered.push(next);

    currentLat = next.lat!;
    currentLng = next.lng!;
  }

  return [...ordered, ...noCoords];
}