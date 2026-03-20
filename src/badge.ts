// SPDX-License-Identifier: AGPL-3.0-only

import { parseColor, expandHex } from './colors';

/** Supported badge visual styles. */
export type BadgeStyle = 'flat' | 'plastic' | 'for-the-badge';

/** Options for badge SVG generation. */
export interface BadgeOptions {
  /** Text for the left (label) section. */
  label: string;
  /** Text for the right (value) section. */
  value: string;
  /** Visual style variant. */
  style: BadgeStyle;
  /** Color string for the label section (name or hex). */
  labelColor: string;
  /** Color string for the value section (name or hex). */
  valueColor: string;
}

/**
 * Verdana 11px character widths in tenths of pixels, indexed from ASCII 32 (space).
 * Derived from shields.io font metrics for pixel-accurate badge sizing.
 */
const VERDANA_WIDTHS: readonly number[] = [
  //  sp  !   "   #   $   %   &   '   (   )   *   +   ,   -   .   /
  33, 40, 58, 89, 68, 107, 79, 31, 41, 41, 53, 84, 36, 44, 36, 47,
  // 0   1   2   3   4   5   6   7   8   9   :   ;   <   =   >   ?
  68, 42, 68, 68, 68, 68, 68, 68, 68, 68, 36, 36, 84, 84, 84, 61,
  // @    A   B   C   D   E   F   G   H   I   J   K   L   M   N   O
  112, 78, 72, 72, 78, 65, 59, 78, 79, 33, 47, 73, 61, 92, 80, 83,
  //  P   Q   R   S   T   U   V   W   X   Y   Z   [   \   ]   ^   _
  67, 83, 74, 63, 67, 78, 75, 104, 71, 67, 67, 41, 47, 41, 84, 68,
  //  `   a   b   c   d   e   f   g   h   i   j   k   l   m   n   o
  56, 65, 71, 60, 71, 65, 43, 71, 70, 30, 32, 65, 30, 105, 70, 70,
  //  p   q   r   s   t   u   v   w   x   y   z   {   |   }   ~
  71, 71, 47, 57, 43, 70, 65, 92, 65, 65, 63, 42, 36, 42, 84,
] as const;

/**
 * Estimate the rendered pixel width of a string in Verdana at the given font size.
 * Uses per-character width table; unknown characters are assumed to be 7px wide.
 *
 * @param text     - String to measure
 * @param fontSize - Font size in pixels (default 11)
 */
function measureText(text: string, fontSize = 11): number {
  const scale = fontSize / 11;
  let tenths = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 32 && code - 32 < VERDANA_WIDTHS.length) {
      tenths += VERDANA_WIDTHS[code - 32];
    } else {
      tenths += 70; // ~7px fallback for unknown chars (covers unicode / emoji)
    }
  }
  return (tenths / 10) * scale;
}

/**
 * Escape a string for safe embedding in SVG text content or attribute values.
 */
function escSvg(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface SectionMetrics {
  text: string;
  color: string;
  width: number;
  textWidth: number;
  textX: number;
}

interface BadgeMetrics {
  totalWidth: number;
  height: number;
  rx: number;
  label: SectionMetrics;
  value: SectionMetrics;
  fontSize: number;
  textY: number;
  shadowY: number;
}

/** Compute layout metrics for flat and plastic styles (height=20, 11px font). */
function computeFlatMetrics(opts: BadgeOptions): BadgeMetrics {
  const labelText = opts.label;
  const valueText = opts.value;

  const labelTW = measureText(labelText);
  const valueTW = measureText(valueText);

  // 5px horizontal padding per side
  const labelW = Math.ceil(labelTW + 10);
  const valueW = Math.ceil(valueTW + 10);

  return {
    totalWidth: labelW + valueW,
    height: 20,
    rx: opts.style === 'plastic' ? 4 : 3,
    label: {
      text: labelText,
      color: parseColor(opts.labelColor),
      width: labelW,
      textWidth: labelTW,
      textX: Math.round(labelW / 2) + 1,
    },
    value: {
      text: valueText,
      color: parseColor(opts.valueColor),
      width: valueW,
      textWidth: valueTW,
      textX: labelW + Math.round(valueW / 2) - 1,
    },
    fontSize: 11,
    textY: 14,
    shadowY: 15,
  };
}

/** Compute layout metrics for the for-the-badge style (height=28, 10px font). */
function computeFtbMetrics(opts: BadgeOptions): BadgeMetrics {
  const labelText = opts.label.toUpperCase();
  const valueText = opts.value.toUpperCase();

  const labelTW = measureText(labelText, 10);
  const valueTW = measureText(valueText, 10);

  // 9px horizontal padding per side for for-the-badge
  const labelW = Math.ceil(labelTW + 18) + 1;
  const valueW = Math.ceil(valueTW + 18);

  return {
    totalWidth: labelW + valueW,
    height: 28,
    rx: 0,
    label: {
      text: labelText,
      color: parseColor(opts.labelColor),
      width: labelW,
      textWidth: labelTW,
      textX: Math.round(labelW / 2),
    },
    value: {
      text: valueText,
      color: parseColor(opts.valueColor),
      width: valueW,
      textWidth: valueTW,
      textX: labelW + Math.round(valueW / 2),
    },
    fontSize: 10,
    textY: 18,
    shadowY: 19,
  };
}

/** Render the two text elements (shadow + main) for one badge section. */
function renderText(
  m: BadgeMetrics,
  section: SectionMetrics,
  labelledBy: string,
): string {
  // Coordinates are expressed in 1/10 px units so we can use integer font-size
  // and scale(.1) to render correctly at the intended pixel size.
  const xTen = section.textX * 10;
  const yMain = m.textY * 10;
  const yShadow = m.shadowY * 10;
  const tl = Math.round(section.textWidth * 10);
  const txt = escSvg(section.text);

  return (
    `<text aria-hidden="true" x="${xTen}" y="${yShadow}" fill="#010101" fill-opacity=".3"` +
    ` transform="scale(.1)" textLength="${tl}" lengthAdjust="spacing">${txt}</text>` +
    `<text x="${xTen}" y="${yMain}" fill="#fff"` +
    ` transform="scale(.1)" textLength="${tl}" lengthAdjust="spacing"` +
    (labelledBy ? ` id="${labelledBy}"` : '') +
    `>${txt}</text>`
  );
}

/** Generate the complete SVG for the **flat** style. */
function renderFlat(m: BadgeMetrics, opts: BadgeOptions): string {
  const { totalWidth: W, height: H, rx } = m;
  const lw = m.label.width;
  const vw = m.value.width;
  const labelColor = expandHex(m.label.color);
  const valueColor = expandHex(m.value.color);
  const ariaLabel = escSvg(`${opts.label}: ${opts.value}`);
  const fs = m.fontSize * 10;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` width="${W}" height="${H}" role="img" aria-label="${ariaLabel}">` +
    `<title>${ariaLabel}</title>` +
    `<linearGradient id="s" x2="0" y2="100%">` +
    `<stop offset="0" stop-color="#bbb" stop-opacity=".1"/>` +
    `<stop offset="1" stop-opacity=".1"/>` +
    `</linearGradient>` +
    `<clipPath id="r">` +
    `<rect width="${W}" height="${H}" rx="${rx}" fill="#fff"/>` +
    `</clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${lw}" height="${H}" fill="${labelColor}"/>` +
    `<rect x="${lw}" width="${vw}" height="${H}" fill="${valueColor}"/>` +
    `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
    `</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif"` +
    ` font-size="${fs}">` +
    renderText(m, m.label, 'lbl') +
    renderText(m, m.value, 'val') +
    `</g>` +
    `</svg>`
  );
}

/** Generate the complete SVG for the **plastic** style (adds gradient overlay). */
function renderPlastic(m: BadgeMetrics, opts: BadgeOptions): string {
  const { totalWidth: W, height: H, rx } = m;
  const lw = m.label.width;
  const vw = m.value.width;
  const labelColor = expandHex(m.label.color);
  const valueColor = expandHex(m.value.color);
  const ariaLabel = escSvg(`${opts.label}: ${opts.value}`);
  const fs = m.fontSize * 10;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` width="${W}" height="${H}" role="img" aria-label="${ariaLabel}">` +
    `<title>${ariaLabel}</title>` +
    `<linearGradient id="s" x2="0" y2="100%">` +
    `<stop offset="0" stop-color="#fff" stop-opacity=".7"/>` +
    `<stop offset=".1" stop-color="#aaa" stop-opacity=".1"/>` +
    `<stop offset=".9" stop-color="#000" stop-opacity=".3"/>` +
    `<stop offset="1" stop-color="#000" stop-opacity=".5"/>` +
    `</linearGradient>` +
    `<clipPath id="r">` +
    `<rect width="${W}" height="${H}" rx="${rx}" fill="#fff"/>` +
    `</clipPath>` +
    `<g clip-path="url(#r)">` +
    `<rect width="${lw}" height="${H}" fill="${labelColor}"/>` +
    `<rect x="${lw}" width="${vw}" height="${H}" fill="${valueColor}"/>` +
    `<rect width="${W}" height="${H}" fill="url(#s)"/>` +
    `</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif"` +
    ` font-size="${fs}">` +
    renderText(m, m.label, 'lbl') +
    renderText(m, m.value, 'val') +
    `</g>` +
    `</svg>`
  );
}

/** Generate the complete SVG for the **for-the-badge** style. */
function renderFtb(m: BadgeMetrics, opts: BadgeOptions): string {
  const { totalWidth: W, height: H } = m;
  const lw = m.label.width;
  const vw = m.value.width;
  const labelColor = expandHex(m.label.color);
  const valueColor = expandHex(m.value.color);
  const ariaLabel = escSvg(`${opts.label}: ${opts.value}`);
  const fs = m.fontSize * 10;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"` +
    ` width="${W}" height="${H}" role="img" aria-label="${ariaLabel}">` +
    `<title>${ariaLabel}</title>` +
    `<g shape-rendering="crispEdges">` +
    `<rect width="${lw}" height="${H}" fill="${labelColor}"/>` +
    `<rect x="${lw}" width="${vw}" height="${H}" fill="${valueColor}"/>` +
    `</g>` +
    `<g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif"` +
    ` font-size="${fs}" letter-spacing="5">` +
    renderText(m, m.label, 'lbl') +
    renderText(m, m.value, 'val') +
    `</g>` +
    `</svg>`
  );
}

/**
 * Generate a shields.io-compatible SVG badge.
 *
 * Selects a renderer based on `opts.style` and computes layout metrics
 * using per-character font width tables for accurate sizing.
 *
 * @param opts - Badge configuration
 * @returns Complete SVG string ready for HTTP response
 */
export function generateBadge(opts: BadgeOptions): string {
  switch (opts.style) {
    case 'flat': {
      const m = computeFlatMetrics(opts);
      return renderFlat(m, opts);
    }
    case 'plastic': {
      const m = computeFlatMetrics(opts);
      return renderPlastic(m, opts);
    }
    case 'for-the-badge': {
      const m = computeFtbMetrics(opts);
      return renderFtb(m, opts);
    }
  }
}

/**
 * Generate a minimal error badge displaying the given message.
 * Uses red value color and grey label to match shields.io error badges.
 *
 * @param message - Short error text to show in the value section
 * @param style   - Visual style to use
 */
export function generateErrorBadge(message: string, style: BadgeStyle = 'flat'): string {
  return generateBadge({
    label: 'osm',
    value: message,
    style,
    labelColor: 'grey',
    valueColor: 'red',
  });
}
