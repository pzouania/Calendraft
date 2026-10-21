// Mode d'affichage du site : clair, sombre ou « système » (suit le réglage de l'appareil).
// Le choix est mémorisé sur l'appareil (localStorage). public/theme-init.js applique le même choix
// avant le premier affichage ; ce fichier prend ensuite le relais (changement de réglage de l'appareil,
// changement fait dans un autre onglet, futur sélecteur dans le profil).

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedMode = 'light' | 'dark'

export interface ThemeState {
  mode: ThemeMode // le choix de la personne
  resolved: ResolvedMode // ce qui est réellement affiché
}

export const MODE_STORAGE_KEY = 'calendraft.mode'

// Mode utilisé tant qu'aucun choix n'est enregistré. Provisoirement « clair » : les composants sont
// convertis aux variables de couleur étape par étape. Il passera à 'system' une fois tout converti.
// (Même valeur que DEFAULT_MODE dans public/theme-init.js.)
export const DEFAULT_MODE: ThemeMode = 'light'

// Couleur de la barre d'état du téléphone (balise meta theme-color).
const META_COLORS: Record<ResolvedMode, string> = { light: '#2563eb', dark: '#1e3a8a' }

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark'
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

function applyToDocument(resolved: ResolvedMode): void {
  document.documentElement.setAttribute('data-mode', resolved)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META_COLORS[resolved])
}

let state: ThemeState = { mode: DEFAULT_MODE, resolved: 'light' }
const listeners = new Set<() => void>()

function commit(mode: ThemeMode): void {
  const resolved = resolveMode(mode)
  applyToDocument(resolved)
  if (state.mode !== mode || state.resolved !== resolved) {
    state = { mode, resolved }
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

let started = false

// À appeler une seule fois au démarrage (src/main.tsx).
export function initTheme(): void {
  if (started) return
  started = true
  commit(getStoredMode())

  // Mode « système » : suivre le réglage de l'appareil quand il change (par exemple au coucher du soleil).
  const query = systemQuery()
  if (query) {
    const onSystemChange = () => {
      if (state.mode === 'system') commit('system')
    }
    query.addEventListener('change', onSystemChange)
  }

  // Choix modifié dans un autre onglet.
  window.addEventListener('storage', (event) => {
    if (event.key === MODE_STORAGE_KEY || event.key === null) commit(getStoredMode())
  })
}
