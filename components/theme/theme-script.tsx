/**
 * Applies the stored theme before first paint.
 *
 * This has to be a blocking inline script in `<head>`: doing it in an effect
 * would paint the light theme first and flash it at anyone using dark mode.
 * It is deliberately tiny and dependency-free, and it fails silently when
 * storage is unavailable (private browsing, blocked cookies) rather than
 * throwing before the app has rendered anything.
 */

export const THEME_STORAGE_KEY = 'rolefit-theme'

const script = `
(function () {
  try {
    var stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = stored === 'dark' || (stored !== 'light' && prefersDark);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();
`.trim()

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />
}
