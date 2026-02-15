export type CanonicalTier = 'Promo' | 'Light' | 'Medium' | 'Heavy' | 'Power'

export const TIER_ORDER: CanonicalTier[] = ['Promo', 'Light', 'Medium', 'Heavy', 'Power']

export const tierFromPlaycount = (playcount: number): CanonicalTier | null => {
  if (!Number.isFinite(playcount)) return null
  if (playcount <= 1) return 'Promo'
  if (playcount <= 7) return 'Light'
  if (playcount <= 15) return 'Medium'
  if (playcount <= 29) return 'Heavy'
  return 'Power'
}
