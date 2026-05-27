import type { Site } from "@/shared/types/domain";

export function getGoogleMapsUrl(site?: Partial<Site> | null) {
  if (!site) return "#";

  if (site.lat != null && site.lng != null) {
    return `https://www.google.com/maps/search/?api=1&query=${site.lat},${site.lng}`;
  }

  const query = site.address || site.name || "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}