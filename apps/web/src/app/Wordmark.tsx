import { useTranslation } from 'react-i18next';
import './shell.css';

/** The brand mark and name. Not a heading: each page owns its h1. */
export function Wordmark() {
  const { t } = useTranslation();
  return (
    <span className="mv-wordmark">
      <svg className="mv-mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <rect width="100" height="100" rx="22" fill="currentColor" />
        <path
          d="M28 72V28l22 28 22-28v44"
          fill="none"
          stroke="var(--mv-cover-bg)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="mv-wordmark-text">{t('app.name')}</span>
    </span>
  );
}
