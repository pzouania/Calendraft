import type { Message, TranslationKey } from './fr'

export const en: Record<TranslationKey, Message> = {
  'appearance.button': 'Appearance',
  'appearance.buttonTitle': 'Appearance and language',
  'appearance.dialogLabel': 'Site appearance and language',
  'appearance.title': 'Appearance',
  'appearance.close': 'Close',
  'appearance.display': 'Display',
  'appearance.mode.system': 'System',
  'appearance.mode.light': 'Light',
  'appearance.mode.dark': 'Dark',
  'appearance.color': 'Color',
  'appearance.colorAria': '{color} theme',
  'appearance.color.blue': 'Blue',
  'appearance.color.violet': 'Violet',
  'appearance.color.green': 'Green',
  'appearance.color.pink': 'Pink',
  'appearance.color.graphite': 'Graphite',
  'appearance.language': 'Language',
  'appearance.hint.systemDark': 'Follows your device setting (currently: dark).',
  'appearance.hint.systemLight': 'Follows your device setting (currently: light).',
  'appearance.hint.saved': 'This choice is saved on this device.',

  // Exemple de texte qui varie avec un nombre (utilisé plus tard dans le calendrier)
  'calendar.eventsCount': { one: '{count} event', other: '{count} events' },
}
