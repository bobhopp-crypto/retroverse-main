/**
 * RetroVerse Design Authority
 * All radial color definitions must originate here.
 * No component may hardcode ring colors.
 * Changes here propagate system-wide.
 */

export const COLOR_BASE_CREAM = '#F8F1DE'
export const COLOR_PANEL_CREAM = '#EFE6CF'
export const COLOR_INNER_PANEL = '#E4D9BE'

export const COLOR_INK_PRIMARY = '#1B1B1B'
export const COLOR_INK_SECONDARY = '#3C3A36'

export const DECADE_COLORS: Record<number, string> = {
  1950: '#9FBFBA',
  1960: '#E3B78C',
  1970: '#B8C8A4',
  1980: '#E6C47A',
  1990: '#D9A6A0',
  2000: '#D6A28C',
  2010: '#A8B7D6',
  2020: '#C9C1AE',
}

export const YEAR_DIGIT_COLORS: Record<number, string> = {
  0: '#E4E7EA',
  1: '#E4E7EA',
  2: '#E4E7EA',
  3: '#E4E7EA',
  4: '#E4E7EA',
  5: '#E4E7EA',
  6: '#E4E7EA',
  7: '#E4E7EA',
  8: '#E4E7EA',
  9: '#E4E7EA',
}

export const SPAN_COLORS: Record<number, string> = {
  1: '#FBF4DE',
  3: '#F6E8B6',
  5: '#F2DC95',
  7: '#EACB75',
  10: '#E2B756',
  15: '#D4A23F',
}

export const TIER_COLORS = {
  Promo: '#F3E4C7',
  Light: '#DCE4F5',
  Medium: '#D7EBD7',
  Heavy: '#F3E9A9',
  Power: '#E7B6B6',
} as const

export const COUNT_COLORS: Record<number, string> = {
  5: '#CFE6DF',
  10: '#B8D9CF',
  15: '#A2CCC0',
  20: '#8DBFB1',
}

export const CENTER_COLOR_ALL = '#FFFDF6'
export const CENTER_COLOR_NEW = '#F3CFCB'
export const YEAR_DIGIT_SELECTED_LIGHTNESS_SHIFT = -0.07

export type RingType = 'decade' | 'yearDigit' | 'span' | 'tier' | 'count' | 'center'

export function getRingPalette(type: 'center'): { All: string; New: string }
export function getRingPalette(type: Exclude<RingType, 'center'>): Record<string | number, string>
export function getRingPalette(type: RingType) {
  switch (type) {
    case 'decade':
      return DECADE_COLORS
    case 'yearDigit':
      return YEAR_DIGIT_COLORS
    case 'span':
      return SPAN_COLORS
    case 'tier':
      return TIER_COLORS
    case 'count':
      return COUNT_COLORS
    case 'center':
      return {
        All: CENTER_COLOR_ALL,
        New: CENTER_COLOR_NEW,
      }
    default:
      return {}
  }
}

const clampColor = (value: number) => Math.max(0, Math.min(255, Math.round(value)))

export function shiftHexLightness(hex: string, amount: number) {
  const raw = hex.trim().replace('#', '')
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(raw)) return hex

  const expanded = raw.length === 3 ? raw.split('').map((char) => `${char}${char}`).join('') : raw
  const r = Number.parseInt(expanded.slice(0, 2), 16)
  const g = Number.parseInt(expanded.slice(2, 4), 16)
  const b = Number.parseInt(expanded.slice(4, 6), 16)

  const nextR = amount >= 0 ? r + (255 - r) * amount : r * (1 + amount)
  const nextG = amount >= 0 ? g + (255 - g) * amount : g * (1 + amount)
  const nextB = amount >= 0 ? b + (255 - b) * amount : b * (1 + amount)

  const toHex = (value: number) => clampColor(value).toString(16).padStart(2, '0')
  return `#${toHex(nextR)}${toHex(nextG)}${toHex(nextB)}`
}
