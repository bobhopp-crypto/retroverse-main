/**
 * RetroVerse theme — design token object for JS/React.
 */
export const retroVerseTheme = {
  colors: {
    navy: '#0B0D17',
    gold: '#F8D17A',
    mint: '#A6E3E9',
    coral: '#FF8B7B',
    butter: '#FFE8A3',
    white: '#FFFFFF',
    black: '#000000',
  },
  radii: {
    sm: '6px',
    md: '12px',
    lg: '20px',
  },
  shadows: {
    soft: '0px 4px 10px rgba(0,0,0,0.25)',
  },
  spacing: {
    0: '0',
    1: '0.25rem',
    2: '0.5rem',
    3: '0.75rem',
    4: '1rem',
    5: '1.25rem',
    6: '1.5rem',
    7: '1.75rem',
    8: '2rem',
    9: '2.25rem',
  },
  typography: {
    fontFamily: '"DM Sans", system-ui, sans-serif',
    sizes: {
      xs: '0.75rem',
      sm: '0.875rem',
      md: '1rem',
      lg: '1.125rem',
      xl: '1.25rem',
      '2xl': '1.5rem',
    },
  },
} as const

export type RetroVerseTheme = typeof retroVerseTheme
