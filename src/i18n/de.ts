import type { Message, TranslationKey } from './fr'

export const de: Record<TranslationKey, Message> = {
  'appearance.button': 'Darstellung',
  'appearance.buttonTitle': 'Darstellung und Sprache',
  'appearance.dialogLabel': 'Darstellung und Sprache der Website',
  'appearance.title': 'Darstellung',
  'appearance.close': 'Schließen',
  'appearance.display': 'Anzeige',
  'appearance.mode.system': 'System',
  'appearance.mode.light': 'Hell',
  'appearance.mode.dark': 'Dunkel',
  'appearance.color': 'Farbe',
  'appearance.colorAria': 'Design {color}',
  'appearance.color.blue': 'Blau',
  'appearance.color.violet': 'Violett',
  'appearance.color.green': 'Grün',
  'appearance.color.pink': 'Rosa',
  'appearance.color.graphite': 'Graphit',
  'appearance.language': 'Sprache',
  'appearance.hint.systemDark': 'Folgt der Einstellung Ihres Geräts (derzeit: dunkel).',
  'appearance.hint.systemLight': 'Folgt der Einstellung Ihres Geräts (derzeit: hell).',
  'appearance.hint.saved': 'Diese Auswahl wird auf diesem Gerät gespeichert.',

  // Exemple de texte qui varie avec un nombre (utilisé plus tard dans le calendrier)
  'calendar.eventsCount': { one: '{count} Termin', other: '{count} Termine' },
}
