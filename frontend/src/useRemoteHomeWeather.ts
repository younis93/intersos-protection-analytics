import {useEffect, useState} from 'react';
import {API} from './api';
import type {HomeWeatherMode} from './homeWeather';

let lastMode: HomeWeatherMode | null = null;

export function useRemoteHomeWeather() {
  const [mode, setMode] = useState(lastMode);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh() {
      if (document.hidden || pending) return;
      pending = true;
      try {
        const response = await fetch(`${API}/home/weather`, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) return;
        const value = (await response.json())?.mode;
        if (controller.signal.aborted || (value !== 'off' && value !== 'rain' && value !== 'snow')) return;
        lastMode = value === 'off' ? null : value;
        setMode(lastMode);
      } catch {
        // A network or validation failure leaves the last successful selection in place.
      } finally {
        pending = false;
      }
    }
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);
  return mode;
}
