import type { DEFAULT_NAMESPACE, Resources } from '@monevo/i18n';

// Typed translation keys: calling t() with an undefined key fails type-checking (internationalization.md#2-translation-resources).
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof DEFAULT_NAMESPACE;
    resources: Resources;
  }
}
