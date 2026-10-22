// Mode d'affichage du site : clair, sombre ou « système » (suit le réglage de l'appareil).
// Le choix est mémorisé sur l'appareil (localStorage). public/theme-init.js applique le même choix
// avant le premier affichage ; ce fichier prend ensuite le relais (changement de réglage de l'appareil,
// changement fait dans un autre onglet, sélecteur dans le profil).

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedMode = 'light' | 'dark'

// Thème de couleur : Bleu (celui du site jusqu'ici), Violet, Vert, Rose ou Graphite.
export type ThemeColor = 'blue' | 'violet' | 'green' | 'pink' | 'graphite'
export const THEME_COLORS: ThemeColor[] = ['blue', 'violet', 'green', 'pink', 'graphite']

export interface ThemeState {
  mode: ThemeMode // le choix de la personne
  resolved: ResolvedMode // ce qui est réellement affiché
  color: ThemeColor // le thème de couleur
}

export const MODE_STORAGE_KEY = 'calendraft.mode'
export const COLOR_STORAGE_KEY = 'calendraft.theme'
export const DEFAULT_COLOR: ThemeColor = 'blue'

// Mode utilisé tant qu'aucun choix n'est enregistré. Provisoirement « clair » : les composants sont
// convertis aux variables de couleur étape par étape. Il passera à 'system' une fois tout converti.
// (Même valeur que DEFAULT_MODE dans public/theme-init.js.)
export const DEFAULT_MODE: ThemeMode = 'light'

// Couleur de la barre d'état du téléphone (balise meta theme-color) : celle de l'accent en clair,
// celle du début de la barre du haut en sombre. (Mêmes valeurs dans public/theme-init.js.)
const META_COLORS: Record<ThemeColor, Record<ResolvedMode, string>> = {
  blue: { light: '#2563eb', dark: '#1e3a8a' },
  violet: { light: '#7c3aed', dark: '#4c1d95' },
  green: { light: '#16a34a', dark: '#14532d' },
  pink: { light: '#db2777', dark: '#831843' },
  graphite: { light: '#475569', dark: '#334155' },
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function isThemeColor(value: unknown): value is ThemeColor {
  return typeof value === 'string' && (THEME_COLORS as string[]).includes(value)
}

export function getStoredColor(): ThemeColor {
  try {
    const value = window.localStorage.getItem(COLOR_STORAGE_KEY)
    if (isThemeColor(value)) return value
  } catch {
    // Stockage indisponible : thème par défaut.
  }
  return DEFAULT_COLOR
}

export function getStoredMode(): ThemeMode {
  try {
    const value = window.localStorage.getItem(MODE_STORAGE_KEY)
    if (isThemeMode(value)) return value
  } catch {
    // Stockage indisponible (navigation privée, réglages du navigateur) : mode par défaut.
  }
  return DEFAULT_MODE
}

function systemQuery(): MediaQueryList | null {
  try {
    return typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null
  } catch {
    return null
  }
}

export function resolveMode(mode: ThemeMode): ResolvedMode {
  if (mode === 'system') return systemQuery()?.matches ? 'dark' : 'light'
  return mode
}

function applyToDocument(resolved: ResolvedMode, color: ThemeColor): void {
  document.documentElement.setAttribute('data-mode', resolved)
  document.documentElement.setAttribute('data-theme', color)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META_COLORS[color][resolved])
}

let state: ThemeState = { mode: DEFAULT_MODE, resolved: 'light', color: DEFAULT_COLOR }
const listeners = new Set<() => void>()

function commit(mode: ThemeMode, color: ThemeColor = state.color): void {
  const resolved = resolveMode(mode)
  applyToDocument(resolved, color)
  if (state.mode !== mode || state.resolved !== resolved || state.color !== color) {
    state = { mode, resolved, color }
    listeners.forEach((listener) => listener())
  }
}

// Instantané du mode courant (même objet tant que rien ne change : utilisable avec useSyncExternalStore).
export function getThemeState(): ThemeState {
  return state
}

export function subscribeTheme(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Change le mode et le mémorise sur cet appareil.
export function setMode(mode: ThemeMode): void {
  try {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode)
  } catch {
    // Sans stockage, le choix vaut jusqu'à la fermeture de la page.
  }
  commit(mode)
}

// Change le thème de couleur et le mémorise sur cet appareil.
export function setThemeColor(color: ThemeColor): void {
  try {
    window.localStorage.setItem(COLOR_STORAGE_KEY, color)
  } catch {
    // Sans stockage, le choix vaut jusqu'à la fermeture de la page.
  }
  commit(state.mode, color)
}

let started = false

// À appeler une seule fois au démarrage (src/main.tsx).
export function initTheme(): void {
  if (started) return
  started = true
  commit(getStoredMode(), getStoredColor())

  // Mode « système » : suivre le réglage de l'appareil quand il change (par exemple au coucher du soleil).
  const query = systemQuery()
  if (query) {
    const onSystemChange = () => {
      if (state.mode === 'system') commit('system', state.color)
    }
    query.addEventListener('change', onSystemChange)
  }

  // Choix modifié dans un autre onglet.
  window.addEventListener('storage', (event) => {
    if (event.key === MODE_STORAGE_KEY || event.key === COLOR_STORAGE_KEY || event.key === null) {
      commit(getStoredMode(), getStoredColor())
    }
  })
}
