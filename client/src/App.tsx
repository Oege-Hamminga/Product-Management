import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import NavBar from "./components/common/NavBar";
import MindMapPage from "./pages/MindMapPage";
import VehiclePage from "./pages/VehiclePage";
import DashboardPage from "./pages/DashboardPage";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-shell">
          <NavBar />
          <main className="app-main">
            <Routes>
              <Route path="/" element={<MindMapPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/vehicles/:vehicleId" element={<VehiclePage />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
