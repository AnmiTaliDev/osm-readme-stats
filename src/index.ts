// SPDX-License-Identifier: AGPL-3.0-only

import { Hono } from 'hono';
import { generateBadge, generateErrorBadge, type BadgeStyle } from './badge';
import { generateHeatmap, type HeatmapPalette, type HeatmapTheme } from './heatmap';
import {
  getUserById,
  getUserByUsername,
  getChangesets,
  checkOsmApiStatus,
  checkOsmChangesetsStatus,
} from './osm';
import { getLocale } from './i18n';
import { parseColor } from './colors';
import { formatNumber } from './format';

/** Cloudflare Workers environment bindings. */
interface Env {
  /** Static assets binding for the public/ directory. */
  ASSETS: Fetcher;
}

const VERSION = '1.0.0';
const BADGE_CACHE = 'public, max-age=3600, s-maxage=3600';
const NO_CACHE = 'no-cache, no-store';

const VALID_STYLES: BadgeStyle[] = ['flat', 'plastic', 'for-the-badge'];
const VALID_PALETTES: HeatmapPalette[] = ['green', 'blue', 'orange', 'purple', 'red'];
const VALID_THEMES: HeatmapTheme[] = ['light', 'dark'];

const app = new Hono<{ Bindings: Env }>();

/** Resolve user from query params (user_id takes priority over username). */
async function resolveUser(q: Record<string, string>) {
  const username = q['username']?.trim();
  const userIdRaw = q['user_id']?.trim();

  if (!username && !userIdRaw) return { user: null, error: 'invalid params' as const };

  if (userIdRaw) {
    const uid = Number(userIdRaw);
    if (!Number.isInteger(uid) || uid <= 0) return { user: null, error: 'invalid params' as const };
    const user = await getUserById(uid);
    return { user, error: user ? null : 'user not found' as const };
  }

  const user = await getUserByUsername(username!);
  return { user, error: user ? null : 'user not found' as const };
}

/**
 * GET /badge
 *
 * Returns a shields.io-compatible SVG badge with the OSM edit count.
 *
 * Query params:
 *   username    – OSM display name
 *   user_id     – Numeric OSM user ID (priority over username)
 *   style       – flat | plastic | for-the-badge  (default: flat)
 *   label       – Custom label text (overrides locale default)
 *   label_color – Color name or hex for the label section  (default: grey)
 *   color       – Color name or hex for the value section  (default: brightgreen)
 *   compact     – true → abbreviate numbers (12.4k)
 *   locale      – en | ru | kk | de | fr  (default: en)
 */
app.get('/badge', async (c) => {
  const q = c.req.query();

  const styleRaw = q['style']?.trim() ?? 'flat';
  const style: BadgeStyle = VALID_STYLES.includes(styleRaw as BadgeStyle)
    ? (styleRaw as BadgeStyle)
    : 'flat';

  const labelOverride  = q['label']?.trim();
  const labelColorRaw  = q['label_color']?.trim() ?? 'grey';
  const valueColorRaw  = q['color']?.trim() ?? 'brightgreen';
  const compact        = q['compact'] === 'true';
  const locale         = q['locale']?.trim();

  const label      = labelOverride ?? getLocale(locale).label;
  const labelColor = parseColor(labelColorRaw);
  const valueColor = parseColor(valueColorRaw);

  if (!q['username']?.trim() && !q['user_id']?.trim()) {
    return c.body(generateErrorBadge('invalid params', style), 400, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': NO_CACHE,
    });
  }

  try {
    const { user, error } = await resolveUser(q);

    if (error === 'invalid params') {
      return c.body(generateErrorBadge('invalid params', style), 400, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': NO_CACHE,
      });
    }

    if (error === 'user not found' || !user) {
      return c.body(generateErrorBadge('user not found', style), 404, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': NO_CACHE,
      });
    }

    const svg = generateBadge({
      label,
      value: formatNumber(user.changesetCount, compact),
      style,
      labelColor,
      valueColor,
    });

    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': BADGE_CACHE,
    });
  } catch (err) {
    console.error('[/badge]', err);
    return c.body(generateErrorBadge('osm api error', style), 502, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': NO_CACHE,
    });
  }
});

/**
 * GET /heatmap
 *
 * Returns an SVG activity heatmap for the last 52 weeks.
 *
 * Query params:
 *   username     – OSM display name
 *   user_id      – Numeric OSM user ID (priority over username)
 *   palette      – green | blue | orange | purple | red  (default: green)
 *   theme        – light | dark  (default: light)
 *   hide_title   – true → omit the stats title line
 *   hide_legend  – true → omit the Less/More legend
 */
app.get('/heatmap', async (c) => {
  const q = c.req.query();

  const paletteRaw = q['palette']?.trim() ?? 'green';
  const themeRaw   = q['theme']?.trim() ?? 'light';

  const palette: HeatmapPalette = VALID_PALETTES.includes(paletteRaw as HeatmapPalette)
    ? (paletteRaw as HeatmapPalette)
    : 'green';

  const theme: HeatmapTheme = VALID_THEMES.includes(themeRaw as HeatmapTheme)
    ? (themeRaw as HeatmapTheme)
    : 'light';

  const showTitle  = q['hide_title'] !== 'true';
  const showLegend = q['hide_legend'] !== 'true';

  if (!q['username']?.trim() && !q['user_id']?.trim()) {
    return c.body(generateErrorBadge('invalid params'), 400, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': NO_CACHE,
    });
  }

  try {
    const { user, error } = await resolveUser(q);

    if (error === 'invalid params') {
      return c.body(generateErrorBadge('invalid params'), 400, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': NO_CACHE,
      });
    }

    if (error === 'user not found' || !user) {
      return c.body(generateErrorBadge('user not found'), 404, {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': NO_CACHE,
      });
    }

    const today = new Date();

    // Mirror the grid-start calculation in heatmap.ts so we always fetch
    // enough data to cover every cell, then add a 7-day buffer.
    const gridStart = new Date(today);
    gridStart.setUTCDate(gridStart.getUTCDate() - 364);
    // Align to Sunday (same as heatmap.ts buildGrid)
    const dow = gridStart.getUTCDay();
    gridStart.setUTCDate(gridStart.getUTCDate() - dow);
    gridStart.setUTCDate(gridStart.getUTCDate() - 7); // buffer

    const changesets = await getChangesets(user.id, gridStart.getTime());

    const { svg } = generateHeatmap(changesets, today, { palette, theme, showTitle, showLegend });

    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': BADGE_CACHE,
    });
  } catch (err) {
    console.error('[/heatmap]', err);
    return c.body(generateErrorBadge('osm api error'), 502, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': NO_CACHE,
    });
  }
});

/**
 * GET /status
 *
 * Health-check. Always returns HTTP 200; inspect the JSON body for service state.
 *
 * Response:
 * {
 *   status: "ok",
 *   services: { osm_api: "ok"|"degraded"|"down", osm_changesets: "ok"|"degraded"|"down" },
 *   checked_at: "<ISO 8601>",
 *   version: "<semver>"
 * }
 */
app.get('/status', async (c) => {
  const [osmApi, osmChangesets] = await Promise.all([
    checkOsmApiStatus(),
    checkOsmChangesetsStatus(),
  ]);

  return c.json({
    status: 'ok',
    services: { osm_api: osmApi, osm_changesets: osmChangesets },
    checked_at: new Date().toISOString(),
    version: VERSION,
  });
});

/**
 * GET /sandbox
 *
 * Interactive badge/heatmap builder. Served via Cloudflare Assets binding.
 */
app.get('/sandbox', async (c) => {
  const url = new URL(c.req.url);
  url.pathname = '/sandbox.html';
  return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
});

app.get('/', (c) => c.redirect('/sandbox', 302));


export default app;
