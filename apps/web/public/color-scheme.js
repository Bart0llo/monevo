// Applies the saved color scheme before the app renders, so there is no flash of the wrong theme.
// This is an external file because the Content-Security-Policy forbids inline scripts
// (security.md#output-and-xss). The key matches localStorageColorSchemeManager in src/theme.
(function () {
  var scheme = 'auto';
  try {
    var saved = window.localStorage.getItem('monevo-color-scheme');
    if (saved === 'light' || saved === 'dark' || saved === 'auto') scheme = saved;
  } catch {
    // Storage can be unavailable (private mode, blocked site data); fall back to the system scheme.
  }
  if (scheme === 'auto') {
    scheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-mantine-color-scheme', scheme);
})();
