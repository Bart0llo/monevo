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
  var root = document.documentElement;
  root.setAttribute('data-mantine-color-scheme', scheme);
  // Paint the page color before the stylesheets load, so a dark start does not flash white.
  // Colors match PAPER in src/theme/theme.ts.
  root.style.colorScheme = scheme;
  root.style.backgroundColor = scheme === 'dark' ? '#191e2c' : '#f4f6fa';
})();
