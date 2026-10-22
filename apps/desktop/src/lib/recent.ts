const STORAGE_KEY = "recentServerIds";
const MAX_RECENT = 8;

/** Server ids, most recently connected first. */
export function recentServerIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function markRecent(serverId: string) {
  const ids = [serverId, ...recentServerIds().filter((id) => id !== serverId)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Recents are a convenience only.
  }
}
