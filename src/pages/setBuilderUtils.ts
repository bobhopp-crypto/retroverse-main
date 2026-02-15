export const YEAR_DOMAIN_MIN = 1950
export const YEAR_DOMAIN_MAX = 2025

export const YEAR_VALUES = Array.from({ length: YEAR_DOMAIN_MAX - YEAR_DOMAIN_MIN + 1 }, (_, index) => YEAR_DOMAIN_MIN + index)

export const SPAN_VALUES = [1, 3, 5, 7, 10, 'FULL'] as const
export type SpanValue = (typeof SPAN_VALUES)[number]

export const COUNT_VALUES = [5, 10, 15, 20, 25] as const
export type CountValue = (typeof COUNT_VALUES)[number]

export const RECENCY_VALUES = ['7d', '30d', '90d', 'all'] as const
export type RecencyValue = (typeof RECENCY_VALUES)[number]

export const PLAY_TIERS = [
  { id: 'promo', label: 'Promo' },
  { id: 'light', label: 'Light' },
  { id: 'medium', label: 'Medium' },
  { id: 'heavy', label: 'Heavy' },
  { id: 'power', label: 'Power' },
] as const

export type PlayTierId = (typeof PLAY_TIERS)[number]['id']
export type TierSelection = PlayTierId | 'mixed'

export const TIER_SELECTIONS = [...PLAY_TIERS.map((tier) => tier.id), 'mixed'] as const

export const TIER_COLORS: Record<TierSelection, string> = {
  promo: '#F3EFE2',
  light: '#CFE2F9',
  medium: '#CFEECF',
  heavy: '#F4E8B0',
  power: '#F2B8AE',
  mixed: '#E8DDC8',
}

export type EraId = 'none' | 'disco' | 'new-wave' | 'classic-rock' | 'hair-metal' | 'grunge' | 'edm'

export type EraDefinition = {
  id: EraId
  label: string
  start: number
  end: number
}

export const ERA_DEFINITIONS: EraDefinition[] = [
  { id: 'none', label: 'None', start: YEAR_DOMAIN_MIN, end: YEAR_DOMAIN_MAX },
  { id: 'disco', label: 'Disco', start: 1974, end: 1982 },
  { id: 'new-wave', label: 'New Wave', start: 1978, end: 1986 },
  { id: 'classic-rock', label: 'Classic Rock', start: 1965, end: 1980 },
  { id: 'hair-metal', label: 'Hair Metal', start: 1983, end: 1991 },
  { id: 'grunge', label: 'Grunge', start: 1989, end: 1995 },
  { id: 'edm', label: 'EDM', start: 2005, end: 2020 },
]

export type YearRange = {
  start: number
  end: number
}

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const clampYear = (year: number) => clamp(Math.round(year), YEAR_DOMAIN_MIN, YEAR_DOMAIN_MAX)

export const computeSpanWindow = (year: number, span: SpanValue): YearRange => {
  if (span === 'FULL') {
    return { start: YEAR_DOMAIN_MIN, end: YEAR_DOMAIN_MAX }
  }

  const start = clampYear(year - span)
  const end = clampYear(year + span)

  return { start: Math.min(start, end), end: Math.max(start, end) }
}

export const intersectYearRanges = (left: YearRange, right: YearRange): YearRange | null => {
  const start = Math.max(left.start, right.start)
  const end = Math.min(left.end, right.end)
  if (start > end) return null
  return { start, end }
}

export const getEraDefinition = (eraId: EraId): EraDefinition => ERA_DEFINITIONS.find((era) => era.id === eraId) ?? ERA_DEFINITIONS[0]

export const spanLabel = (span: SpanValue) => (span === 'FULL' ? 'FULL' : `${span}y`)

export const recencyLabel = (recency: RecencyValue) => (recency === 'all' ? 'ALL' : recency.toUpperCase())

export const tierLabel = (tier: TierSelection) => {
  if (tier === 'mixed') return 'MIXED'
  const entry = PLAY_TIERS.find((value) => value.id === tier)
  return entry ? entry.label.toUpperCase() : 'MIXED'
}

export const tierSelectionToIds = (selection: TierSelection): PlayTierId[] => {
  if (selection === 'mixed') return PLAY_TIERS.map((tier) => tier.id)
  return [selection]
}

export const normalizeAngle = (angle: number) => {
  const normalized = angle % 360
  return normalized < 0 ? normalized + 360 : normalized
}

export const indexToAngle = (index: number, count: number, startAngle = -90) => {
  if (count <= 1) return startAngle
  return startAngle + (index / count) * 360
}

export const angleToIndex = (angle: number, count: number, startAngle = -90) => {
  if (count <= 1) return 0

  const normalized = normalizeAngle(angle - startAngle)
  const step = 360 / count
  const snapped = Math.round(normalized / step)
  return clamp(snapped % count, 0, count - 1)
}

export const yearToAngle = (year: number) => {
  const index = clamp(year, YEAR_DOMAIN_MIN, YEAR_DOMAIN_MAX) - YEAR_DOMAIN_MIN
  return indexToAngle(index, YEAR_VALUES.length)
}

export const angleToYear = (angle: number) => {
  const index = angleToIndex(angle, YEAR_VALUES.length)
  return YEAR_VALUES[index]
}

export const countToAngle = (count: CountValue) => {
  const index = COUNT_VALUES.indexOf(count)
  return indexToAngle(index < 0 ? 0 : index, COUNT_VALUES.length)
}

export const spanToAngle = (span: SpanValue) => {
  const index = SPAN_VALUES.indexOf(span)
  return indexToAngle(index < 0 ? 0 : index, SPAN_VALUES.length)
}

export const eraToAngle = (eraId: EraId) => {
  const index = ERA_DEFINITIONS.findIndex((era) => era.id === eraId)
  return indexToAngle(index < 0 ? 0 : index, ERA_DEFINITIONS.length)
}

export const tierToAngle = (tier: TierSelection) => {
  const index = TIER_SELECTIONS.indexOf(tier)
  return indexToAngle(index < 0 ? 0 : index, TIER_SELECTIONS.length)
}
