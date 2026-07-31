import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import NavBar from "./components/common/NavBar";
import SlidesPage from "./pages/SlidesPage";
import TopicsTablePage from "./pages/TopicsTablePage";
import ImagesPage from "./pages/ImagesPage";

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
              <Route path="/" element={<SlidesPage />} />
              <Route path="/topics" element={<TopicsTablePage />} />
              <Route path="/images" element={<ImagesPage />} />
            </Routes>
          </main>
        </div>
      </Router>
    </AuthProvider>
  );
}
