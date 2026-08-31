import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import NavBar from "./components/common/NavBar";
import SlidesPage from "./pages/SlidesPage";
import TopicsTablePage from "./pages/TopicsTablePage";
import SettingsPage from "./pages/SettingsPage";

// Any build served from a static host with no server-side rewrite rules —
// the standalone (single-file, no-server) build, or the server-backed build
// published to GitHub Pages calling a separately-hosted API — has nothing to
// fall back unknown paths to "/index.html", so it uses hash routing instead:
// every route lives under "#/..." and a reload or deep link never needs
// server-side rewrite rules. A server-backed build actually served BY that
// same Express server keeps clean paths (Express already serves index.html
// for any non-API route).
const Router =
  import.meta.env.VITE_STANDALONE === "true" || import.meta.env.VITE_HASH_ROUTER === "true" ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-shell">
          <NavBar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<SlidesPage />} />
              <Route path="/topics" element={<TopicsTablePage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}
