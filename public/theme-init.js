/*
 * Applique le mode clair / sombre AVANT le premier affichage de la page, pour éviter un flash de
 * la mauvaise couleur. Même logique que src/lib/theme.ts (mêmes valeurs à garder identiques).
 *
 * Choix mémorisé dans localStorage, clé « calendraft.mode » : 'light', 'dark' ou 'system'.
 * Outil de test : ouvrir le site avec ?mode=dark, ?mode=light ou ?mode=system enregistre ce choix.
 */
(function () {
  var KEY = 'calendraft.mode'
  var DEFAULT_MODE = 'light'
  var META_COLORS = { light: '#2563eb', dark: '#0b1220' }
  var mode = DEFAULT_MODE

  function valid(value) {
    return value === 'light' || value === 'dark' || value === 'system'
  }

  try {
    var asked = new URLSearchParams(window.location.search).get('mode')
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

  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', META_COLORS[resolved])
})()
