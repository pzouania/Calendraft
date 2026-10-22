/*
 * Applique le mode clair / sombre AVANT le premier affichage de la page, pour éviter un flash de
 * la mauvaise couleur. Même logique que src/lib/theme.ts (mêmes valeurs à garder identiques).
 *
 * Choix mémorisés dans localStorage :
 *   « calendraft.mode »  : 'light', 'dark' ou 'system'
 *   « calendraft.theme » : 'blue', 'violet', 'green', 'pink' ou 'graphite'
 * Outil de test : ouvrir le site avec ?mode=dark (ou light, system) et/ou ?theme=violet (etc.) enregistre ce choix.
 */
(function () {
  var KEY = 'calendraft.mode'
  var DEFAULT_MODE = 'light'
  var COLOR_KEY = 'calendraft.theme'
  var DEFAULT_COLOR = 'blue'
  var META_COLORS = {
    blue: { light: '#2563eb', dark: '#1e3a8a' },
    violet: { light: '#7c3aed', dark: '#4c1d95' },
    green: { light: '#16a34a', dark: '#14532d' },
    pink: { light: '#db2777', dark: '#831843' },
    graphite: { light: '#475569', dark: '#334155' },
  }
  var mode = DEFAULT_MODE
  var color = DEFAULT_COLOR

  function valid(value) {
    return value === 'light' || value === 'dark' || value === 'system'
  }

  function validColor(value) {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(META_COLORS, value)
  }

  try {
    var params = new URLSearchParams(window.location.search)
    var asked = params.get('mode')
    var askedColor = params.get('theme')
    if (validColor(askedColor)) {
      color = askedColor
      try {
        window.localStorage.setItem(COLOR_KEY, askedColor)
      } catch (e) {
        // Stockage indisponible : le choix ne vaut que pour cette page.
      }
    } else {
      var storedColor = window.localStorage.getItem(COLOR_KEY)
      if (validColor(storedColor)) color = storedColor
    }
    if (valid(asked)) {
      mode = asked
      try {
        window.localStorage.setItem(KEY, asked)
      } catch (e) {
        // Stockage indisponible : le choix ne vaut que pour cette page.
      }
    } else {
      var stored = window.localStorage.getItem(KEY)
      if (valid(stored)) mode = stored
    }
  } catch (e) {
    // Stockage indisponible : mode par défaut.
  }

  var dark = mode === 'dark'
  if (mode === 'system') {
    try {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    } catch (e) {
      dark = false
    }
  }

  var resolved = dark ? 'dark' : 'light'
  document.documentElement.setAttribute('data-mode', resolved)
  document.documentElement.setAttribute('data-theme', color)

  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META_COLORS[color][resolved])
})()
