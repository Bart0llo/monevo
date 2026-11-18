import enCommon from '../locales/en/common.json' with { type: 'json' };
import enErrors from '../locales/en/errors.json' with { type: 'json' };
import plCommon from '../locales/pl/common.json' with { type: 'json' };
import plErrors from '../locales/pl/errors.json' with { type: 'json' };

/** UI languages (internationalization.md#1-languages-and-locales). English is the source. */
export const SUPPORTED_LANGUAGES = ['en', 'pl'] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export const NAMESPACES = ['common', 'errors'] as const;
export type Namespace = (typeof NAMESPACES)[number];
export const DEFAULT_NAMESPACE: Namespace = 'common';

export const resources = {
  en: { common: enCommon, errors: enErrors },
  pl: { common: plCommon, errors: plErrors },
} as const satisfies Record<Language, Record<Namespace, unknown>>;

/** The English resources define the key types for every language. */
export type Resources = (typeof resources)['en'];

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

/**
 * Picks the first supported language from a BCP 47 preference list (e.g. `navigator.languages`),
 * matching on the primary subtag, and falls back to English.
 */
export function resolveLanguage(preferences: readonly string[]): Language {
  for (const tag of preferences) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLanguage(primary)) {
      return primary;
    }
  }
  return DEFAULT_LANGUAGE;
}
