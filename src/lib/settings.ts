import { createContext, useContext } from 'react';
import type { Appearance, SecretName, SettingsSection, SettingsView } from '../../shared/settings.ts';

export interface SettingsApi {
  view: SettingsView | null;
  update: (section: SettingsSection, values: Record<string, unknown>) => Promise<SettingsView>;
  setSecret: (name: SecretName, value: string | null) => Promise<SettingsView>;
}

export const SettingsContext = createContext<SettingsApi>({
  view: null,
  update: () => Promise.reject(new Error('Settings are not loaded')),
  setSecret: () => Promise.reject(new Error('Settings are not loaded')),
});

export function useSettings(): SettingsApi {
  return useContext(SettingsContext);
}

// Puts the theme and motion preference on <html>, where the CSS tokens read them
export function applyAppearance(appearance: Pick<Appearance, 'theme' | 'reduceMotion'> & Partial<Pick<Appearance, 'density'>>) {
  const root = document.documentElement;
  root.dataset.theme = appearance.theme;
  root.dataset.reduceMotion = String(appearance.reduceMotion);
  root.dataset.density = appearance.density ?? 'comfortable';
}

// Small per-viewer conveniences (recent palette items); never anything that must persist
export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the feature just won't remember
  }
}
