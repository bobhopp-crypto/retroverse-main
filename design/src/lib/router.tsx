import { createBrowserRouter, Navigate } from "react-router-dom";
import HubLanding from '../pages/hublanding';
import GamesLanding from '../pages/gameslanding';
import ToolsLanding from '../pages/toolslanding';
import VideoLibraryHome from '../sections/workbench-core-video-library-v1/videolibraryhome';
import EditorHome from '../sections/editor/editorhome';

export const router = createBrowserRouter([
  { path: "/", element: <Navigate to="/hub" replace /> },

  { path: "/hub", element: <HubLanding /> },
  { path: "/videolibrary", element: <VideoLibraryHome /> },
  { path: "/games", element: <GamesLanding /> },
  { path: "/tools", element: <ToolsLanding /> },

  { path: "/editor", element: <EditorHome /> },

  // fallback for 404
  { path: "*", element: <Navigate to="/hub" replace /> }
]);
