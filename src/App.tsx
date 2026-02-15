import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import Hub from './pages/Hub'
import VideoLibrary from './pages/VideoLibrary'
import Playlists from './pages/Playlists'
import Random from './pages/Random'
import Matching from './pages/Matching'
import Games from './pages/Games'
import Tools from './pages/Tools'
import Analytics from './pages/Analytics'
import SetBuilderRingsV2 from './components/SetBuilderRingsV2'
import DisplayDesignLab from './pages/DisplayDesignLab'
import { PlaylistProvider } from './context/PlaylistContext'
import './App.css'

function App() {
  return (
    <PlaylistProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/hub" replace />} />
            <Route path="/hub" element={<Hub />} />
            <Route path="/video-library" element={<VideoLibrary />} />
            <Route path="/videolibrary" element={<Navigate to="/video-library" replace />} />
            <Route path="/playlists" element={<Playlists />} />
            <Route path="/random" element={<Random />} />
            <Route path="/matching" element={<Matching />} />
            <Route path="/games" element={<Games />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/set-builder-rings" element={<SetBuilderRingsV2 />} />
            <Route path="/design-lab/display" element={<DisplayDesignLab />} />
            <Route path="*" element={<Navigate to="/hub" replace />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </PlaylistProvider>
  )
}

export default App
