import { useMemo, useState } from 'react'
import {
  COUNT_VALUES,
  ERA_DEFINITIONS,
  type CountValue,
  type EraId,
  type PlayTierId,
  RECENCY_VALUES,
  SPAN_VALUES,
  TIER_COLORS,
  type RecencyValue,
  type SpanValue,
  type TierSelection,
  computeSpanWindow,
  countToAngle,
  eraToAngle,
  getEraDefinition,
  intersectYearRanges,
  spanToAngle,
  tierSelectionToIds,
  tierToAngle,
  yearToAngle,
} from './setBuilderUtils'

type UseConcentricRingsOptions = {
  initialYear?: number
  initialSpan?: SpanValue
  initialEraId?: EraId
  initialTier?: TierSelection
  initialCount?: CountValue
  initialRecency?: RecencyValue
}

const DEFAULT_OPTIONS: Required<UseConcentricRingsOptions> = {
  initialYear: 1980,
  initialSpan: 5,
  initialEraId: 'none',
  initialTier: 'mixed',
  initialCount: 20,
  initialRecency: 'all',
}

export function useConcentricRings(options: UseConcentricRingsOptions = {}) {
  const {
    initialYear,
    initialSpan,
    initialEraId,
    initialTier,
    initialCount,
    initialRecency,
  } = { ...DEFAULT_OPTIONS, ...options }

  const [selectedYear, setSelectedYear] = useState(initialYear)
  const [selectedSpan, setSelectedSpan] = useState<SpanValue>(initialSpan)
  const [selectedEraId, setSelectedEraId] = useState<EraId>(initialEraId)
  const [selectedTier, setSelectedTier] = useState<TierSelection>(initialTier)
  const [selectedCount, setSelectedCount] = useState<CountValue>(initialCount)
  const [selectedRecency, setSelectedRecency] = useState<RecencyValue>(initialRecency)

  const spanWindow = useMemo(() => computeSpanWindow(selectedYear, selectedSpan), [selectedYear, selectedSpan])

  const selectedEra = useMemo(() => getEraDefinition(selectedEraId), [selectedEraId])

  const eraRange = useMemo(
    () => ({ start: selectedEra.start, end: selectedEra.end }),
    [selectedEra.end, selectedEra.start],
  )

  const overlapRange = useMemo(() => {
    if (selectedEraId === 'none') return spanWindow
    return intersectYearRanges(spanWindow, eraRange)
  }, [eraRange, selectedEraId, spanWindow])

  const hasEraOverlap = selectedEraId === 'none' || overlapRange !== null

  const effectiveRange = hasEraOverlap && overlapRange ? overlapRange : null

  const activeTierIds = useMemo<PlayTierId[]>(() => tierSelectionToIds(selectedTier), [selectedTier])

  const yearAngle = useMemo(() => yearToAngle(selectedYear), [selectedYear])
  const spanAngle = useMemo(() => spanToAngle(selectedSpan), [selectedSpan])
  const eraAngle = useMemo(() => eraToAngle(selectedEraId), [selectedEraId])
  const tierAngle = useMemo(() => tierToAngle(selectedTier), [selectedTier])
  const countAngle = useMemo(() => countToAngle(selectedCount), [selectedCount])

  const tierAccentColor = TIER_COLORS[selectedTier]

  return {
    selectedYear,
    setSelectedYear,
    selectedSpan,
    setSelectedSpan,
    selectedEraId,
    setSelectedEraId,
    selectedTier,
    setSelectedTier,
    selectedCount,
    setSelectedCount,
    selectedRecency,
    setSelectedRecency,
    spanWindow,
    overlapRange,
    effectiveRange,
    hasEraOverlap,
    selectedEra,
    activeTierIds,
    yearAngle,
    spanAngle,
    eraAngle,
    tierAngle,
    countAngle,
    tierAccentColor,
    recencyOptions: RECENCY_VALUES,
    spanOptions: SPAN_VALUES,
    eraOptions: ERA_DEFINITIONS,
    countOptions: COUNT_VALUES,
  }
}
