import { useEffect, useState } from 'react'
import { useThemeMode } from '../hooks/useThemeMode'
import type { ResolvedMode, ThemeColor } from '../lib/theme'

interface LogoProps {
  height?: number
  zoom?: number // taille apparente du logo (1.6 = taille historique du site)
}

// Une image par thème de couleur et par mode (dossier public/logo/).
const LOGO_NAMES: Record<ThemeColor, string> = {
  blue: 'bleu',
  violet: 'violet',
  green: 'vert',
  pink: 'rose',
  graphite: 'graphite',
}

const logoSrc = (color: ThemeColor, mode: ResolvedMode) => `/logo/calendraft-logo-${LOGO_NAMES[color]}-${mode}.png`

// Les images sont recadrées au plus près du logo (720 x 199 px) : 271/1024 = rapport entre la hauteur du logo
// et celle de l'ancienne image d'origine, ce qui garde la même taille apparente qu'avant.
const IMG_RATIO = 271 / 1024

export default function Logo({ height = 40, zoom = 1.6 }: LogoProps) {
  const { color, resolved } = useThemeMode()
  const [failed, setFailed] = useState(false)

  // Précharge l'autre mode pour que le changement clair / sombre n'affiche pas de trou.
  useEffect(() => {
    const other = new Image()
    other.src = logoSrc(color, resolved === 'dark' ? 'light' : 'dark')
  }, [color, resolved])

  // Secours : si les images par thème sont absentes du site, on garde l'image d'origine.
  if (failed) {
    return (
      <div style={{ height, overflow: 'hidden', display: 'flex', alignItems: 'center' }}>
        <img
          className="logo-legacy"
          src="/calendraft-banner.png"
          alt="Calendraft"
          style={{ height: height * zoom, width: 'auto', objectFit: 'contain', display: 'block' }}
        />
      </div>
    )
  }

  return (
    <div style={{ height, display: 'flex', alignItems: 'center' }}>
      <img
        src={logoSrc(color, resolved)}
        alt="Calendraft"
        width={720}
        height={199}
        onError={() => setFailed(true)}
        style={{ height: height * zoom * IMG_RATIO, width: 'auto', display: 'block' }}
      />
    </div>
  )
}
