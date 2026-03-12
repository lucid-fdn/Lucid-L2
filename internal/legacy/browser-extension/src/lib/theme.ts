/// <reference types="chrome"/>

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'theme_preference'

export async function getThemePreference(): Promise<ThemePreference> {
  try {
    const data = await chrome.storage.local.get([STORAGE_KEY])
    const pref = data?.[STORAGE_KEY]
    if (pref === 'light' || pref === 'dark' || pref === 'system') return pref
    return 'system'
  } catch {
    return 'system'
  }
}

export async function setThemePreference(pref: ThemePreference): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: pref })
}

export function resolveEffectiveTheme(pref: ThemePreference): 'light' | 'dark' {
  if (pref === 'light' || pref === 'dark') return pref
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function applyThemeToDocument(theme: 'light' | 'dark') {
  // Tailwind is configured with darkMode: ['class']
  // Apply to <html> so it affects the whole popup.
  const root = document.documentElement
  if (theme === 'dark') root.classList.add('dark')
  else root.classList.remove('dark')
}

