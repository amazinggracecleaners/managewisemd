import type { Site } from "@/shared/types/domain";

export type SiteIndex = {
  byId: Map<string, Site>;
  byName: Map<string, Site>;
};

export function indexSites(sites: Site[] = []): SiteIndex {
  const byId = new Map<string, Site>();
  const byName = new Map<string, Site>();

  for (const s of sites) {
    const id = s.id ?? s.name;
    byId.set(id, s);
    byName.set(s.name.trim().toLowerCase(), s);
  }

  return { byId, byName };
}
