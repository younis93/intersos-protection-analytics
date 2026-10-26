export type StartupPage = 'home' | 'legal' | 'kobo' | 'custom';
export const STARTUP_PAGE_LABELS: Record<StartupPage, string> = {home: 'Home', legal: 'Legal', kobo: 'Kobo', custom: 'Custom Analysis'};
const STORAGE_KEY = 'app-startup-page';
const isStartupPage = (value: unknown): value is StartupPage => value === 'home' || value === 'legal' || value === 'kobo' || value === 'custom';

export function readStartupPage(): StartupPage {
  // The launcher supplies the preference for an empty workspace profile;
  // storage keeps later visits to Home in sync after Save.
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (isStartupPage(cached)) return cached;
  } catch { /* Use the preference supplied by the launcher. */ }
  const supplied = new URLSearchParams(window.location.search).get('startupPage');
  return isStartupPage(supplied) ? supplied : 'home';
}

export async function saveStartupPage(page: StartupPage): Promise<void> {
  const native = (window as any).pywebview;
  const desktop = native || new URLSearchParams(window.location.search).has('startupEpoch');
  if (desktop) {
    if (!native?.api?.save_startup_page) throw new Error('The app is still starting. Please try saving again.');
    if (await native.api.save_startup_page(page) !== true) throw new Error('Unable to save the startup page. Please try again.');
    try { localStorage.setItem(STORAGE_KEY, page); } catch { /* The native preference is already saved. */ }
  } else {
    localStorage.setItem(STORAGE_KEY, page);
  }
}
