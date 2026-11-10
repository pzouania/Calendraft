// Vacances scolaires de la France métropolitaine (zones A, B et C).
//
// Les dates sont celles du calendrier scolaire officiel (arrêtés du ministère de l'Éducation nationale, publiés au Journal
// officiel) : elles sont écrites ici, dans le code, pour que l'application ne dépende d'aucun service extérieur (pas de panne
// possible, rien à payer). Il faut les compléter une fois par an, quand le ministère publie l'année scolaire suivante.
//
// Convention des dates (celle du ministère) :
//  - « from » : premier jour de vacances (le plus souvent le samedi, « départ en vacances après la classe ») ;
//  - « to »   : jour de REPRISE des cours le matin (lundi le plus souvent). Ce jour-là n'est PAS un jour de vacances : le
//               dernier jour de vacances est la veille. Une vacance couvre donc les jours « from <= jour < to ».
//
// Couverture : de la rentrée 2024 à fin août 2028. Au-delà (ou avant), on ne sait pas : aucun jour n'est coloré et l'écran
// le dit. Les dates de la rentrée 2028 ne sont pas encore publiées : l'été 2028 est donc coupé au 31 août.

export type SchoolZone = 'A' | 'B' | 'C'

export type HolidayKind = 'toussaint' | 'noel' | 'hiver' | 'printemps' | 'ascension' | 'ete'

export interface SchoolHoliday {
  kind: HolidayKind
  // Premier jour de vacances, AAAA-MM-JJ.
  from: string
  // Jour de reprise des cours (exclu), AAAA-MM-JJ.
  to: string
}

export const SCHOOL_ZONES: readonly SchoolZone[] = ['A', 'B', 'C']

// Jours pour lesquels les dates sont connues (inclus). Hors de cette période, on ne sait pas si c'est un jour de vacances.
export const HOLIDAY_COVERAGE = { from: '2024-09-02', to: '2028-08-31' } as const

type Span = readonly [from: string, to: string]

interface SchoolYear {
  // Identiques pour les trois zones.
  toussaint: Span
  noel: Span
  ascension: Span
  ete: Span
  // Propres à chaque zone.
  hiver: Record<SchoolZone, Span>
  printemps: Record<SchoolZone, Span>
}

const YEARS: readonly SchoolYear[] = [
  // 2024-2025
  {
    toussaint: ['2024-10-19', '2024-11-04'],
    noel: ['2024-12-21', '2025-01-06'],
    hiver: { A: ['2025-02-22', '2025-03-10'], B: ['2025-02-08', '2025-02-24'], C: ['2025-02-15', '2025-03-03'] },
    printemps: { A: ['2025-04-19', '2025-05-05'], B: ['2025-04-05', '2025-04-21'], C: ['2025-04-12', '2025-04-28'] },
    ascension: ['2025-05-29', '2025-06-02'],
    ete: ['2025-07-05', '2025-09-01'],
  },
  // 2025-2026
  {
    toussaint: ['2025-10-18', '2025-11-03'],
    noel: ['2025-12-20', '2026-01-05'],
    hiver: { A: ['2026-02-07', '2026-02-23'], B: ['2026-02-14', '2026-03-02'], C: ['2026-02-21', '2026-03-09'] },
    printemps: { A: ['2026-04-04', '2026-04-20'], B: ['2026-04-11', '2026-04-27'], C: ['2026-04-18', '2026-05-04'] },
    ascension: ['2026-05-14', '2026-05-18'],
    ete: ['2026-07-04', '2026-09-01'],
  },
  // 2026-2027
  {
    toussaint: ['2026-10-17', '2026-11-02'],
    noel: ['2026-12-19', '2027-01-04'],
    hiver: { A: ['2027-02-13', '2027-03-01'], B: ['2027-02-20', '2027-03-08'], C: ['2027-02-06', '2027-02-22'] },
    printemps: { A: ['2027-04-10', '2027-04-26'], B: ['2027-04-17', '2027-05-03'], C: ['2027-04-03', '2027-04-19'] },
    ascension: ['2027-05-06', '2027-05-10'],
    ete: ['2027-07-03', '2027-09-02'],
  },
  // 2027-2028 (arrêté du 21 juillet 2026, Journal officiel du 23 juillet 2026)
  {
    toussaint: ['2027-10-23', '2027-11-08'],
    noel: ['2027-12-18', '2028-01-03'],
    hiver: { A: ['2028-02-19', '2028-03-06'], B: ['2028-02-05', '2028-02-21'], C: ['2028-02-12', '2028-02-28'] },
    printemps: { A: ['2028-04-22', '2028-05-09'], B: ['2028-04-08', '2028-04-24'], C: ['2028-04-15', '2028-05-02'] },
    ascension: ['2028-05-25', '2028-05-29'],
    // Dernier jour de classe : mardi 4 juillet 2028 ; premier jour de vacances : le lendemain. La reprise de septembre 2028 n'est
    // pas encore publiée : la période s'arrête à la fin de la couverture (1er septembre 2028 exclu).
    ete: ['2028-07-05', '2028-09-01'],
  },
]

const ORDER: readonly HolidayKind[] = ['toussaint', 'noel', 'hiver', 'printemps', 'ascension', 'ete']

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

// Décale un jour « AAAA-MM-JJ » (calcul en UTC : jamais de décalage dû à l'heure d'été).
export function shiftDay(day: string, n: number): string {
  const m = DAY_RE.exec(day)
  if (!m) return day
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n))
  return d.toISOString().slice(0, 10)
}

function build(zone: SchoolZone): SchoolHoliday[] {
  const list: SchoolHoliday[] = []
  for (const y of YEARS) {
    for (const kind of ORDER) {
      const span: Span = kind === 'hiver' ? y.hiver[zone] : kind === 'printemps' ? y.printemps[zone] : y[kind]
      list.push({ kind, from: span[0], to: span[1] })
    }
  }
  list.sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
  return list
}

const BY_ZONE: Record<SchoolZone, readonly SchoolHoliday[]> = { A: build('A'), B: build('B'), C: build('C') }

// Valeur lue dans la base ou le stockage : une zone valide, sinon null.
export function parseZone(value: unknown): SchoolZone | null {
  return value === 'A' || value === 'B' || value === 'C' ? value : null
}

// Toutes les vacances d'une zone, de la plus ancienne à la plus récente.
export function schoolHolidays(zone: SchoolZone): readonly SchoolHoliday[] {
  return BY_ZONE[zone]
}

// Vacances qui touchent la période de « from » à « to » (jours inclus).
export function holidaysBetween(zone: SchoolZone, from: string, to: string): SchoolHoliday[] {
  return BY_ZONE[zone].filter((h) => h.from <= to && h.to > from)
}

// Vacances en cours un jour donné (undefined si c'est un jour de classe, ou si le jour n'est pas couvert).
export function holidayOn(zone: SchoolZone, day: string): SchoolHoliday | undefined {
  for (const h of BY_ZONE[zone]) {
    if (day < h.from) return undefined
    if (day < h.to) return h
  }
  return undefined
}

// Les jours de vacances de « from » à « to » (inclus), jour par jour : sert à colorer la grille des mois.
export function holidaysByDay(zone: SchoolZone, from: string, to: string): Map<string, SchoolHoliday> {
  const map = new Map<string, SchoolHoliday>()
  for (const h of holidaysBetween(zone, from, to)) {
    for (let day = h.from < from ? from : h.from; day < h.to && day <= to; day = shiftDay(day, 1)) map.set(day, h)
  }
  return map
}

// Dernier jour de vacances (la veille de la reprise).
export function lastHolidayDay(h: SchoolHoliday): string {
  return shiftDay(h.to, -1)
}

// Jour de reprise des cours, ou null quand il n'est pas connu (la rentrée suivante n'est pas encore publiée : fin de la couverture).
export function resumeDay(h: SchoolHoliday): string | null {
  return h.to > HOLIDAY_COVERAGE.to ? null : h.to
}

// Vrai si une partie de la période de « from » à « to » (inclus) est hors de la couverture des dates.
export function outsideCoverage(from: string, to: string): boolean {
  return from < HOLIDAY_COVERAGE.from || to > HOLIDAY_COVERAGE.to
}

// Langue des libellés. Le type est écrit ici (et non importé de ../i18n) : ce fichier est aussi utilisé par le Worker
// (fichier .ics), qui n'a ni « window » ni « document » ; les textes sont donc des tableaux locaux, pas le dictionnaire.
export type HolidayLang = 'fr' | 'en' | 'de'

const HOLIDAY_NAMES: Record<HolidayLang, Record<HolidayKind, string>> = {
  fr: {
    toussaint: 'Vacances de la Toussaint',
    noel: 'Vacances de Noël',
    hiver: 'Vacances d’hiver',
    printemps: 'Vacances de printemps',
    ascension: 'Pont de l’Ascension',
    ete: 'Vacances d’été',
  },
  en: {
    toussaint: 'All Saints’ holidays',
    noel: 'Christmas holidays',
    hiver: 'Winter holidays',
    printemps: 'Spring holidays',
    ascension: 'Ascension long weekend',
    ete: 'Summer holidays',
  },
  de: {
    toussaint: 'Herbstferien (Allerheiligen)',
    noel: 'Weihnachtsferien',
    hiver: 'Winterferien',
    printemps: 'Frühjahrsferien',
    ascension: 'Brückentage an Christi Himmelfahrt',
    ete: 'Sommerferien',
  },
}

const HOLIDAY_ZONE_WORD: Record<HolidayLang, string> = { fr: 'zone', en: 'zone', de: 'Zone' }
const HOLIDAY_LEGEND: Record<HolidayLang, string> = { fr: 'Vacances scolaires', en: 'School holidays', de: 'Schulferien' }

export function holidayName(kind: HolidayKind, lang: HolidayLang = 'fr'): string {
  return HOLIDAY_NAMES[lang][kind]
}

// « Vacances de Noël (zone B) ».
export function holidayLabel(kind: HolidayKind, zone: SchoolZone, lang: HolidayLang = 'fr'): string {
  return `${holidayName(kind, lang)} (${HOLIDAY_ZONE_WORD[lang]} ${zone})`
}

// Libellé de la ligne de légende : « Vacances scolaires (zone B) ».
export function holidayLegendLabel(zone: SchoolZone, lang: HolidayLang = 'fr'): string {
  return `${HOLIDAY_LEGEND[lang]} (${HOLIDAY_ZONE_WORD[lang]} ${zone})`
}

// Couleur de la vacance dans la légende et sur les feuilles imprimées (fond blanc).
export const HOLIDAY_COLOR = '#f59e0b'

// Académies de chaque zone (aide au choix de la zone).
export const ZONE_ACADEMIES: Record<SchoolZone, string> = {
  A: 'Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers',
  B: 'Aix-Marseille, Amiens, Lille, Nancy-Metz, Nantes, Nice, Normandie, Orléans-Tours, Reims, Rennes, Strasbourg',
  C: 'Créteil, Montpellier, Paris, Toulouse, Versailles',
}
