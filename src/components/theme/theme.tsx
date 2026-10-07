"use client";

import { MotionConfig } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";
export const THEME_STORAGE_KEY = "shrinkfox.theme";
export const themeInitScript = `(function(){try{var q=new URLSearchParams(location.search).get("__theme");var p=(q==="light"||q==="dark")?q:localStorage.getItem("shrinkfox.theme");var m=window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.setAttribute("data-theme",(p==="light"||p==="dark")?p:(m?"dark":"light"));}catch(e){document.documentElement.setAttribute("data-theme","light");}})();`;
interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
  toggle: () => void;
}
const ThemeContext = createContext<ThemeContextValue | null>(null);
let sessionPreference: ThemePreference | null = null;
function readPreference(): ThemePreference {
  if (sessionPreference) return sessionPreference;
  const forced = new URLSearchParams(window.location.search).get("__theme");
  if (forced === "light" || forced === "dark") return forced;
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}
function subscribePreference(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === THEME_STORAGE_KEY || event.key === null) {
      sessionPreference = null;
      notify();
    }
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener("shrinkfox-theme-change", notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("shrinkfox-theme-change", notify);
  };
}
function subscribeSystem(notify: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  query.addEventListener("change", notify);
  return () => query.removeEventListener("change", notify);
}
const systemSnapshot = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;
const serverPreference = (): ThemePreference => "system";
const serverFalse = () => false;
const clientTrue = () => true;
const subscribeHydration = () => () => {};
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribePreference,
    readPreference,
    serverPreference,
  );
  const systemIsDark = useSyncExternalStore(
    subscribeSystem,
    systemSnapshot,
    serverFalse,
  );
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    clientTrue,
    serverFalse,
  );
  const resolved: ResolvedTheme =
    preference === "system" ? (systemIsDark ? "dark" : "light") : preference;
  useEffect(() => {
    if (hydrated) document.documentElement.setAttribute("data-theme", resolved);
  }, [resolved, hydrated]);
  const setPreference = useCallback((next: ThemePreference) => {
    sessionPreference = next;
    try {
      if (next === "system") localStorage.removeItem(THEME_STORAGE_KEY);
      else localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* Session preference still applies when storage is blocked. */
    }
    window.dispatchEvent(new Event("shrinkfox-theme-change"));
  }, []);
  const value = useMemo<ThemeContextValue>(
    () => ({
      preference,
      resolved,
      setPreference,
      toggle: () => setPreference(resolved === "dark" ? "light" : "dark"),
    }),
    [preference, resolved, setPreference],
  );
  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </ThemeContext.Provider>
  );
}
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
