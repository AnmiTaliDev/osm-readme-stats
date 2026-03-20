// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Named color presets matching shields.io naming convention.
 * Keys are preset names, values are hex color strings.
 */
export const COLOR_PRESETS: Readonly<Record<string, string>> = {
  brightgreen: '#4c1',
  green: '#97ca00',
  yellow: '#dfb317',
  orange: '#fe7d37',
  red: '#e05d44',
  blue: '#007ec6',
  lightgrey: '#9f9f9f',
  grey: '#555',
} as const;

/**
 * Parse and normalize a color input to a hex string.
 *
 * Accepts:
 * - Named preset (e.g. "brightgreen")
 * - 3-digit hex with or without leading # (e.g. "4c1" or "#4c1")
 * - 6-digit hex with or without leading # (e.g. "007ec6" or "#007ec6")
 *
 * Falls back to grey (#555) for unrecognized values.
 */
export function parseColor(input: string): string {
  const trimmed = input.trim().toLowerCase();

  if (trimmed in COLOR_PRESETS) {
    return COLOR_PRESETS[trimmed];
  }

  // Already valid hex with #
  if (/^#[0-9a-f]{3}$/.test(trimmed) || /^#[0-9a-f]{6}$/.test(trimmed)) {
    return trimmed;
  }

  // Hex without leading #
  if (/^[0-9a-f]{3}$/.test(trimmed) || /^[0-9a-f]{6}$/.test(trimmed)) {
    return '#' + trimmed;
  }

  return '#555';
}

/**
 * Expand a short 3-digit hex color to 6 digits.
 * Required for SVG gradient stops that need full 6-digit hex.
 */
export function expandHex(hex: string): string {
  if (hex.length === 4) {
    // #RGB -> #RRGGBB
    return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }
  return hex;
}
