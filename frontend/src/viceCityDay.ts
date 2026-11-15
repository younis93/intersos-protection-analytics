import {useEffect, useState} from 'react';

const startsAt = Date.parse('2026-11-19T00:00:00+03:00');
const endsAt = Date.parse('2026-11-20T00:00:00+03:00');

export function isViceCityDay(now: number): boolean {
  return now >= startsAt && now < endsAt;
}

export function useViceCityDay(): boolean {
  const [active, setActive] = useState(() => isViceCityDay(Date.now()));

  useEffect(() => {
    let timer: number;
    const refresh = () => {
      window.clearTimeout(timer);
      const now = Date.now();
      setActive(isViceCityDay(now));
      const boundary = now < startsAt ? startsAt : endsAt;
      if (now < boundary) {
        timer = window.setTimeout(refresh, Math.min(boundary - now, 60_000));
      }
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  return active;
}
