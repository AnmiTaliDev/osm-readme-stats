// SPDX-License-Identifier: AGPL-3.0-only

import type { OsmChangeset } from './osm';

// 5-level palettes: 0 = no activity, 4 = maximum
const PALETTES: Record<string, readonly string[]> = {
  green:  ['#ebedf0', '#c6e48b', '#7bc96f', '#239a3b', '#196127'],
  blue:   ['#ebedf0', '#c0deff', '#79b8ff', '#2188ff', '#0366d6'],
  orange: ['#ebedf0', '#ffd8a8', '#ffa94d', '#fd7e14', '#e67700'],
  purple: ['#ebedf0', '#d0bfff', '#9775fa', '#7950f2', '#5f3dc4'],
  red:    ['#ebedf0', '#ffc9c9', '#ff8787', '#fa5252', '#c0392b'],
} as const;

export type HeatmapPalette = keyof typeof PALETTES;
export type HeatmapTheme = 'light' | 'dark';

/** Visual options for the heatmap SVG. */
export interface HeatmapOptions {
  /** Cell color palette. Default: "green". */
  palette: HeatmapPalette;
  /** Light or dark background theme. Default: "light". */
  theme: HeatmapTheme;
  /** Whether to render the stats title line. Default: true. */
  showTitle: boolean;
  /** Whether to render the Less/More legend. Default: true. */
  showLegend: boolean;
}

const CELL = 11;
const GAP = 2;
const STRIDE = CELL + GAP;
const WEEKS = 53;
const DAYS = 7;

const MARGIN_LEFT = 18;
const MARGIN_RIGHT = 8;

const GRID_W = WEEKS * STRIDE - GAP;
const GRID_H = DAYS * STRIDE - GAP;

function countToLevel(count: number): number {
  if (count === 0) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 10) return 3;
  return 4;
}

/**
 * Builds a 53×7 grid (weeks × days) with the changeset count per day.
 * Column 0 = oldest week, row 0 = Sunday.
 */
function buildGrid(changesets: OsmChangeset[], today: Date): number[][] {
  const countByDate = new Map<string, number>();
  for (const cs of changesets) {
    const date = cs.createdAt.slice(0, 10);
    countByDate.set(date, (countByDate.get(date) ?? 0) + 1);
  }

  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 364);
  // Align to the Sunday of that week (Sunday = 0)
  const dow = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - dow);

  const grid: number[][] = Array.from({ length: WEEKS }, () => new Array<number>(DAYS).fill(0));
  const cursor = new Date(start);

  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      grid[w][d] = countByDate.get(cursor.toISOString().slice(0, 10)) ?? 0;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  }

  return grid;
}

interface MonthLabel {
  text: string;
  weekIndex: number;
}

function buildMonthLabels(today: Date): MonthLabel[] {
  const SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - 364);
  // Align to the Sunday of that week (Sunday = 0)
  const dow = start.getUTCDay();
  start.setUTCDate(start.getUTCDate() - dow);

  const labels: MonthLabel[] = [];
  let lastMonth = -1;

  for (let w = 0; w < WEEKS; w++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + w * 7);
    const m = d.getUTCMonth();
    if (m !== lastMonth) {
      labels.push({ text: SHORT[m], weekIndex: w });
      lastMonth = m;
    }
  }

  return labels;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Return value of generateHeatmap. */
export interface HeatmapResult {
  svg: string;
  mappingDays: number;
  totalChangesets: number;
}

/**
 * Generates an SVG activity heatmap for the past year.
 *
 * @param changesets - Changesets to visualise
 * @param today      - Reference date (grid anchor)
 * @param opts       - Visual options
 */
export function generateHeatmap(
  changesets: OsmChangeset[],
  today: Date,
  opts: HeatmapOptions,
): HeatmapResult {
  const palette = PALETTES[opts.palette] ?? PALETTES['green'];

  const dark = opts.theme === 'dark';
  const bg          = dark ? '#0d1117' : '#ffffff';
  const textColor   = dark ? '#c9d1d9' : '#333333';
  const mutedColor  = dark ? '#8b949e' : '#767676';
  // Empty cell color differs slightly in dark theme
  const emptyColor  = dark ? '#161b22' : palette[0];

  const marginTop    = opts.showTitle ? 28 : 20;
  const marginBottom = opts.showLegend ? 20 : 4;
  const svgW = MARGIN_LEFT + GRID_W + MARGIN_RIGHT;
  const svgH = marginTop + GRID_H + marginBottom;

  const grid = buildGrid(changesets, today);
  const monthLabels = buildMonthLabels(today);

  let mappingDays = 0;
  let totalChangesets = 0;
  let maxPerDay = 0;

  for (const week of grid) {
    for (const count of week) {
      if (count > 0) {
        mappingDays++;
        totalChangesets += count;
        if (count > maxPerDay) maxPerDay = count;
      }
    }
  }

  const title = `${mappingDays} mapping days with ${totalChangesets} changesets in the last year`;
  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg"` +
    ` width="${svgW}" height="${svgH}"` +
    ` viewBox="0 0 ${svgW} ${svgH}"` +
    ` role="img" aria-label="${esc(title)}">`,
  );
  parts.push(`<title>${esc(title)}</title>`);
  parts.push(`<rect width="${svgW}" height="${svgH}" fill="${bg}" rx="4"/>`);

  if (opts.showTitle) {
    parts.push(
      `<text x="0" y="11"` +
      ` font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" fill="${textColor}" font-weight="600">` +
      esc(title) +
      `</text>`,
    );
  }

  // Month labels
  for (const ml of monthLabels) {
    const x = MARGIN_LEFT + ml.weekIndex * STRIDE;
    parts.push(
      `<text x="${x}" y="${marginTop - 6}"` +
      ` font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="9" fill="${mutedColor}">` +
      esc(ml.text) +
      `</text>`,
    );
  }

  // Day labels: M, W, F at rows 1, 3, 5 (Mon/Wed/Fri in Sunday-first grid)
  const dayLabels: Record<number, string> = { 1: 'M', 3: 'W', 5: 'F' };
  for (const [idx, label] of Object.entries(dayLabels)) {
    const d = Number(idx);
    const y = marginTop + d * STRIDE + CELL - 1;
    parts.push(
      `<text x="${MARGIN_LEFT - 4}" y="${y}" text-anchor="end"` +
      ` font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="9" fill="${mutedColor}">` +
      esc(label) +
      `</text>`,
    );
  }

  // Cell grid
  for (let w = 0; w < WEEKS; w++) {
    for (let d = 0; d < DAYS; d++) {
      const count = grid[w][d];
      const color = count === 0 ? emptyColor : (palette[countToLevel(count)] ?? palette[4]);
      const cx = MARGIN_LEFT + w * STRIDE;
      const cy = marginTop + d * STRIDE;
      parts.push(
        `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}"` +
        ` rx="2" fill="${color}">` +
        (count > 0 ? `<title>${count} changeset${count !== 1 ? 's' : ''}</title>` : '') +
        `</rect>`,
      );
    }
  }

  // Legend (bottom-right)
  if (opts.showLegend) {
    const legendY = marginTop + GRID_H + 14;
    const rightEdge = svgW - MARGIN_RIGHT;
    const moreLabel = `More (${maxPerDay})`;
    const lessLabel = `Less (${mappingDays > 0 ? 1 : 0})`;
    const moreLabelW = moreLabel.length * 5.2;
    const squaresBlock = 5 * (CELL + 2) - 2;
    const squaresLeft = rightEdge - moreLabelW - 4 - squaresBlock - 4;

    parts.push(
      `<text x="${squaresLeft - 4}" y="${legendY}" text-anchor="end"` +
      ` font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="9" fill="${mutedColor}">` +
      esc(lessLabel) +
      `</text>`,
    );

    for (let i = 0; i < 5; i++) {
      const color = i === 0 ? emptyColor : (palette[i] ?? palette[4]);
      parts.push(
        `<rect x="${squaresLeft + i * (CELL + 2)}" y="${legendY - 9}"` +
        ` width="${CELL}" height="${CELL}" rx="2" fill="${color}"/>`,
      );
    }

    parts.push(
      `<text x="${squaresLeft + squaresBlock + 4}" y="${legendY}"` +
      ` font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="9" fill="${mutedColor}">` +
      esc(moreLabel) +
      `</text>`,
    );
  }

  parts.push(`</svg>`);

  return { svg: parts.join(''), mappingDays, totalChangesets };
}
