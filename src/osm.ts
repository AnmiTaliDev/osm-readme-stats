// SPDX-License-Identifier: AGPL-3.0-only

const OSM_API = 'https://api.openstreetmap.org/api/0.6';
const STATUS_TIMEOUT_MS = 4_000;

/**
 * HTTP headers sent with every OSM API request.
 * OSM usage policy requires a valid User-Agent identifying the application.
 */
const OSM_HEADERS: HeadersInit = {
  'User-Agent': 'osm-readme-stats/1.0.0 (https://github.com/AnmiTaliDev/osm-readme-stats)',
  'Accept': 'application/json',
};

interface OsmApiUserResponse {
  user: {
    id: number;
    display_name: string;
    changesets: { count: number };
  };
}

interface OsmApiChangesetItem {
  id: number;
  created_at: string;
  uid: number;
}

interface OsmApiChangesetsResponse {
  changesets: OsmApiChangesetItem[];
}

/** Minimal OSM user data needed for badge and heatmap generation. */
export interface OsmUser {
  id: number;
  displayName: string;
  changesetCount: number;
}

/** A single OSM changeset record. */
export interface OsmChangeset {
  id: number;
  createdAt: string;
}

/**
 * Fetch a user object by their numeric OSM user ID.
 * Returns null on 404, throws on other errors.
 */
export async function getUserById(id: number): Promise<OsmUser | null> {
  const res = await fetch(`${OSM_API}/user/${id}.json`, { headers: OSM_HEADERS });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OSM API ${res.status} for user ID ${id}`);
  const data = (await res.json()) as OsmApiUserResponse;
  return {
    id: data.user.id,
    displayName: data.user.display_name,
    changesetCount: data.user.changesets.count,
  };
}

/**
 * Look up a user by their OSM display name via the changesets endpoint.
 * Returns null when no changesets (and thus no traceable user) are found.
 */
export async function getUserByUsername(username: string): Promise<OsmUser | null> {
  const url = `${OSM_API}/changesets.json?display_name=${encodeURIComponent(username)}&limit=1`;
  const res = await fetch(url, { headers: OSM_HEADERS });
  if (!res.ok) throw new Error(`OSM API ${res.status} searching "${username}"`);
  const data = (await res.json()) as OsmApiChangesetsResponse;
  if (data.changesets.length === 0) return null;
  return getUserById(data.changesets[0].uid);
}

/**
 * Fetch one time window of changesets for a user using OSM `time=T1,T2`.
 * OSM filters by closed_at, so results are client-filtered by created_at.
 * Pages through up to MAX_PAGES_PER_WINDOW × 100 changesets within the window.
 */
async function fetchWindow(
  userId: number,
  windowStart: Date,
  windowEnd: Date,
  cutoffMs: number,
): Promise<OsmChangeset[]> {
  const result: OsmChangeset[] = [];
  let maxId: number | null = null;
  const MAX_PAGES_PER_WINDOW = 20;
  const timeParam = `${windowStart.toISOString()},${windowEnd.toISOString()}`;

  for (let page = 0; page < MAX_PAGES_PER_WINDOW; page++) {
    let url = `${OSM_API}/changesets.json?user=${userId}&limit=100&time=${encodeURIComponent(timeParam)}`;
    if (maxId !== null) url += `&max_id=${maxId}`;

    const res = await fetch(url, { headers: OSM_HEADERS });
    if (!res.ok) {
      console.warn(`[fetchWindow] OSM ${res.status} user=${userId} timeParam=${timeParam}`);
      break;
    }

    const data = (await res.json()) as OsmApiChangesetsResponse;
    if (data.changesets.length === 0) break;

    for (const cs of data.changesets) {
      const t = new Date(cs.created_at).getTime();
      if (t >= cutoffMs) result.push({ id: cs.id, createdAt: cs.created_at });
    }

    if (data.changesets.length < 100) break;
    maxId = data.changesets[data.changesets.length - 1].id;
  }

  return result;
}

/**
 * Fetch all changesets for a user in [cutoffMs, now].
 *
 * Splits the range into monthly windows and fetches them in parallel.
 * Each window uses OSM `time=T1,T2` (filters by closed_at server-side),
 * with an additional client-side created_at >= cutoffMs guard.
 * Results are deduplicated by changeset ID (changesets near window
 * boundaries can appear in two adjacent windows).
 *
 * @param userId   - Numeric OSM user ID
 * @param cutoffMs - Epoch ms lower bound (inclusive).
 */
export async function getChangesets(userId: number, cutoffMs: number): Promise<OsmChangeset[]> {
  const cutoff = new Date(cutoffMs);
  const now = new Date();

  const windows: Array<{ start: Date; end: Date }> = [];
  let cursor = new Date(cutoff);
  while (cursor < now) {
    const next = new Date(cursor);
    next.setUTCMonth(next.getUTCMonth() + 1);
    windows.push({ start: new Date(cursor), end: next > now ? now : next });
    cursor = next;
  }

  const settled = await Promise.allSettled(
    windows.map(w => fetchWindow(userId, w.start, w.end, cutoffMs)),
  );

  const seen = new Set<number>();
  const result: OsmChangeset[] = [];
  for (const outcome of settled) {
    if (outcome.status === 'rejected') {
      console.warn('[getChangesets] window failed:', outcome.reason);
      continue;
    }
    for (const cs of outcome.value) {
      if (!seen.has(cs.id)) {
        seen.add(cs.id);
        result.push(cs);
      }
    }
  }

  console.log(`[getChangesets] userId=${userId} windows=${windows.length} total=${result.length}`);
  return result;
}

/**
 * Probe the OSM capabilities endpoint.
 * Returns "ok", "degraded" (5xx), or "down" (unreachable).
 */
export async function checkOsmApiStatus(): Promise<'ok' | 'degraded' | 'down'> {
  try {
    const res = await fetch(`${OSM_API}/capabilities.json`, {
      headers: OSM_HEADERS,
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (res.ok) return 'ok';
    if (res.status >= 500) return 'degraded';
    return 'down';
  } catch { return 'down'; }
}

/**
 * Probe the OSM changesets endpoint.
 * Returns "ok", "degraded" (5xx), or "down" (unreachable).
 */
export async function checkOsmChangesetsStatus(): Promise<'ok' | 'degraded' | 'down'> {
  try {
    const res = await fetch(`${OSM_API}/changesets.json?limit=1`, {
      headers: OSM_HEADERS,
      signal: AbortSignal.timeout(STATUS_TIMEOUT_MS),
    });
    if (res.ok) return 'ok';
    if (res.status >= 500) return 'degraded';
    return 'down';
  } catch { return 'down'; }
}
