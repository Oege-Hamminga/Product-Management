import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import NavBar from "./components/common/NavBar";
import MindMapPage from "./pages/MindMapPage";
import InsightsPage from "./pages/InsightsPage";

// The standalone (single-file, no-server) build has no backend to fall back
// unknown paths to "/index.html", so it uses hash routing — every route
// lives under "#/..." and a reload or deep link never needs server-side
// rewrite rules. The server-backed build keeps clean paths (Express already
// serves index.html for any non-API route).
const Router = import.meta.env.VITE_STANDALONE === "true" ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="app-shell">
          <NavBar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<MindMapPage />} />
              <Route path="/insights" element={<InsightsPage />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}
