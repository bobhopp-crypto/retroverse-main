import { Link } from 'react-router-dom'

/**
 * RetroVerse Hub — landing page.
 * Full-screen navy, logo placeholder, tagline, primary nav buttons.
 */
export default function HubLanding() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12"
      style={{ background: 'var(--rv-color-navy)' }}
    >
      {/* Logo placeholder */}
      <div
        className="w-24 h-24 sm:w-32 sm:h-32 rounded-[var(--rv-radius-lg)] flex items-center justify-center mb-6 sm:mb-8"
        style={{
          background: 'var(--rv-color-gold)',
          boxShadow: 'var(--rv-shadow-soft)',
        }}
      >
        <span
          className="text-2xl sm:text-3xl font-bold"
          style={{ color: 'var(--rv-color-black)' }}
        >
          RV
        </span>
      </div>

      <h1
        className="text-2xl sm:text-3xl font-semibold mb-2"
        style={{ color: 'var(--rv-color-white)', fontFamily: 'var(--rv-font-family)' }}
      >
        RetroVerse
      </h1>
      <p
        className="text-base sm:text-lg mb-8 sm:mb-10 opacity-90"
        style={{ color: 'var(--rv-color-butter)' }}
      >
        Press Play for the Past
      </p>

      <nav className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full max-w-xs sm:max-w-sm">
        <Link to="/videolibrary" className="rv-btn rv-btn-gold text-center">
          Video Library
        </Link>
        <Link to="/games" className="rv-btn rv-btn-gold text-center">
          Games
        </Link>
        <Link to="/tools" className="rv-btn rv-btn-gold text-center">
          Tools
        </Link>
      </nav>
    </div>
  )
}
