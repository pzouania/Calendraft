import { useSyncExternalStore } from 'react'
import { getThemeState, setMode, subscribeTheme, type ThemeState } from '../lib/theme'

// Mode d'affichage courant (clair / sombre / système) et fonction pour le changer.
// Se met à jour tout seul quand le réglage de l'appareil change (mode « système »)
// ou quand le choix est modifié dans un autre onglet.
export function useThemeMode(): ThemeState & { setMode: typeof setMode } {
  const state = useSyncExternalStore(subscribeTheme, getThemeState, getThemeState)
  return { mode: state.mode, resolved: state.resolved, setMode }
}
