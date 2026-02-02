import { Link } from 'react-router-dom'

/**
 * Tools landing — placeholder.
 */
export default function ToolsLanding() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-8 sm:py-12"
      style={{ background: 'var(--rv-color-navy)' }}
    >
      <h1
        className="text-2xl sm:text-3xl font-semibold mb-4"
        style={{ color: 'var(--rv-color-white)', fontFamily: 'var(--rv-font-family)' }}
      >
        Tools
      </h1>
      <p
        className="text-base sm:text-lg mb-8"
        style={{ color: 'var(--rv-color-butter)' }}
      >
        Coming soon
      </p>
      <Link to="/hub" className="rv-btn rv-btn-outline">
        ← RetroVerse Hub
      </Link>
    </div>
  )
}
