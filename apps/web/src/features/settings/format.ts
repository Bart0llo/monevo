import { useTranslation } from 'react-i18next';

/** Formats an API instant (ISO string) for display in the UI language. */
export function useFormatInstant(): (iso: string | null) => string {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (iso) => (iso ? format.format(new Date(iso)) : '—');
}
