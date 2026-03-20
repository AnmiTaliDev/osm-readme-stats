// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Format a number as either a plain string or a compact human-readable string.
 *
 * @param n - The number to format
 * @param compact - When true, abbreviate large numbers (e.g. 12450 -> "12.4k")
 * @returns Formatted string representation
 *
 * @example
 * formatNumber(999, false)     // "999"
 * formatNumber(999, true)      // "999"
 * formatNumber(1000, true)     // "1k"
 * formatNumber(12450, true)    // "12.4k"
 * formatNumber(1500000, true)  // "1.5M"
 */
export function formatNumber(n: number, compact: boolean): string {
  if (!compact) {
    return String(n);
  }

  if (n >= 1_000_000) {
    const val = n / 1_000_000;
    const rounded = Math.floor(val * 10) / 10;
    return (rounded % 1 === 0 ? String(rounded | 0) : String(rounded)) + 'M';
  }

  if (n >= 1_000) {
    const val = n / 1_000;
    const rounded = Math.floor(val * 10) / 10;
    return (rounded % 1 === 0 ? String(rounded | 0) : String(rounded)) + 'k';
  }

  return String(n);
}
