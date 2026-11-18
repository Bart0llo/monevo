import { DEFAULT_LANGUAGE, DEFAULT_NAMESPACE, NAMESPACES, SUPPORTED_LANGUAGES, resolveLanguage, resources } from '@monevo/i18n';
import i18next, { type i18n } from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

// i18next setup (internationalization.md#2-translation-resources). The initial language is the saved
// choice, then navigator.languages, then English.

export const LANGUAGE_STORAGE_KEY = 'monevo-language';

export async function createI18n(): Promise<i18n> {
  const instance = i18next.createInstance();
  instance.on('languageChanged', (language) => {
    document.documentElement.lang = language;
  });
  await instance
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      ns: [...NAMESPACES],
      defaultNS: DEFAULT_NAMESPACE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      fallbackLng: DEFAULT_LANGUAGE,
      load: 'languageOnly',
      interpolation: { escapeValue: false },
      returnNull: false,
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        caches: ['localStorage'],
        convertDetectedLanguage: (language: string) => resolveLanguage([language]),
      },
    });
  return instance;
}
