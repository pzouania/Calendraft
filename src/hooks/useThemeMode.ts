import { useSyncExternalStore } from 'react'
import { getThemeState, setMode, setThemeColor, subscribeTheme, type ThemeState } from '../lib/theme'

// Mode d'affichage (clair / sombre / système), thème de couleur, et fonctions pour les changer.
// Se met à jour tout seul quand le réglage de l'appareil change (mode « système »)
// ou quand le choix est modifié dans un autre onglet.
export function useThemeMode(): ThemeState & { setMode: typeof setMode; setColor: typeof setThemeColor } {
  const state = useSyncExternalStore(subscribeTheme, getThemeState, getThemeState)
  return { mode: state.mode, resolved: state.resolved, color: state.color, setMode, setColor: setThemeColor }
}
