// Textes du site en français : c'est la langue de référence. Les fichiers en.ts et de.ts doivent contenir
// exactement les mêmes clés (le compilateur signale toute clé manquante ou en trop).
//
// - Un texte simple est une chaîne. {nom} est remplacé par la valeur donnée à t('clé', { nom: ... }).
// - Un texte qui varie avec un nombre est un objet { one, other } choisi d'après { count } (règles de la langue).

export type Message = string | { one: string; other: string }

export const fr = {
  // Menu « Apparence et langue » (barre du haut)
  'appearance.button': 'Apparence',
  'appearance.buttonTitle': 'Apparence et langue',
  'appearance.dialogLabel': 'Apparence et langue du site',
  'appearance.title': 'Apparence',
  'appearance.close': 'Fermer',
  'appearance.display': 'Affichage',
  'appearance.mode.system': 'Système',
  'appearance.mode.light': 'Clair',
  'appearance.mode.dark': 'Sombre',
  'appearance.color': 'Couleur',
  'appearance.colorAria': 'Thème {color}',
  'appearance.color.blue': 'Bleu',
  'appearance.color.violet': 'Violet',
  'appearance.color.green': 'Vert',
  'appearance.color.pink': 'Rose',
  'appearance.color.graphite': 'Graphite',
  'appearance.language': 'Langue',
  'appearance.hint.systemDark': 'Suit le réglage de votre appareil (actuellement : sombre).',
  'appearance.hint.systemLight': 'Suit le réglage de votre appareil (actuellement : clair).',
  'appearance.hint.saved': 'Ce choix est enregistré sur cet appareil.',

  // Exemple de texte qui varie avec un nombre (utilisé plus tard dans le calendrier)
  'calendar.eventsCount': { one: '{count} événement', other: '{count} événements' },
} satisfies Record<string, Message>

export type TranslationKey = keyof typeof fr
