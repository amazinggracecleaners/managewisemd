import type { Site } from "@/shared/types/domain";

export function getGoogleMapsUrl(site?: Partial<Site> | null) {
  if (!site) return "#";

  // 1. Prefer address first because it is easier for managers to maintain.
  if (site.address?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      site.address.trim()
    )}`;
  }

  // 2. Use GPS coordinates only if no address exists.
  if (site.lat != null && site.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}`;
  }

  // 3. Final fallback: use site name.
  const query = site.name?.trim() || "";

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query
  )}`;
}