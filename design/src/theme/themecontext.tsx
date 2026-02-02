import { createContext, useContext, useState, type ReactNode } from 'react'
import { retroVerseTheme, type RetroVerseTheme } from './theme'

type ThemeContextValue = {
  theme: RetroVerseTheme
  isDark: boolean
  setDark: (dark: boolean) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setDark] = useState(true)
  const value: ThemeContextValue = {
    theme: retroVerseTheme,
    isDark,
    setDark,
  }
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
