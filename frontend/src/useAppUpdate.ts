import {useCallback, useEffect, useRef, useState} from "react";
import {checkForUpdates, getUpdateStatus, installUpdate} from "./api";
import type {UpdateCheck, UpdateStatus} from "./types";

export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const activeUpdatePhases = ["downloading", "verifying", "installing", "restarting"];

export function useAppUpdate(canAutoOpen?: () => boolean) {
  const [info, setInfo] = useState<UpdateCheck | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState("");
  const pending = useRef<Promise<UpdateCheck | undefined> | null>(null);
  const mounted = useRef(false);
  const openedManually = useRef(false);

  const refresh = useCallback(() => {
    if (pending.current) return pending.current;
    setChecking(true);
    setCheckError("");
    const request = checkForUpdates()
      .then(result => {
        if (result.checkFailed) {
          if (mounted.current) setCheckError(result.message || "Try checking again in a moment.");
          return;
        }
        if (mounted.current) setInfo(result);
        return result;
      })
      .catch((error: Error) => {
        if (mounted.current) setCheckError(error.message);
        return undefined;
      })
      .finally(() => {
        pending.current = null;
        if (mounted.current) setChecking(false);
      });
    pending.current = request;
    return request;
  }, []);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    void refresh().then(result => {
      if (active && result?.available && !openedManually.current && (canAutoOpen?.() ?? true)) {
        setOpen(true);
      }
    });
    const timer = window.setInterval(() => void refresh(), UPDATE_CHECK_INTERVAL_MS);
    return () => {
      active = false;
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [canAutoOpen, refresh]);

  const phase = status?.phase;
  useEffect(() => {
    if (!phase || !activeUpdatePhases.includes(phase)) return;
    const timer = window.setInterval(() => {
      void getUpdateStatus().then(setStatus).catch(() => undefined);
    }, 700);
    return () => window.clearInterval(timer);
  }, [phase]);

  const check = () => {
    openedManually.current = true;
    setOpen(true);
    void refresh();
  };
  const install = () => {
    void installUpdate().then(setStatus).catch((error: Error) => {
      setStatus({phase: "error", progress: 0, error: error.message, currentVersion: info?.currentVersion ?? ""});
    });
  };

  return {info, status, open, checking, checkError, check, install, close: () => setOpen(false)};
}
