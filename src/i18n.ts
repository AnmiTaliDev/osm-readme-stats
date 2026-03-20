// SPDX-License-Identifier: AGPL-3.0-only

/** Localized strings for a single locale. */
export interface LocaleData {
  /** Default badge label text (shown when no custom label is specified). */
  label: string;
  /** Short label used as a secondary edits descriptor. */
  editsLabel: string;
}

/**
 * All supported locales keyed by their BCP-47 language code.
 * Add new locales here following the same structure.
 */
export const LOCALES: Readonly<Record<string, LocaleData>> = {
  en: { label: 'OSM Edits', editsLabel: 'edits' },
  ru: { label: 'OSM Правки', editsLabel: 'правки' },
  kk: { label: 'OSM Өзгерістер', editsLabel: 'өзгерістер' },
  de: { label: 'OSM Bearbeitungen', editsLabel: 'Bearbeitungen' },
  fr: { label: 'OSM Modifications', editsLabel: 'modifications' },
} as const;

/**
 * Retrieve locale data for the given language code.
 * Falls back to English if the code is unknown or undefined.
 *
 * @param code - BCP-47 language code (e.g. "en", "ru", "kk")
 */
export function getLocale(code: string | undefined): LocaleData {
  if (code && code in LOCALES) {
    return LOCALES[code];
  }
  return LOCALES['en'];
}
