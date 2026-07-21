import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import LoginModal from "./LoginModal";
import "./NavBar.css";

export default function NavBar() {
  const { isEditMode, logout } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <NavLink to="/" className="navbar-brand">
          <span className="mark">OP</span>
          OEM Portfolio
        </NavLink>

        <nav className="navbar-links">
          <NavLink to="/" end className={({ isActive }) => `navbar-link${isActive ? " active" : ""}`}>
            Brand Map
          </NavLink>
          <NavLink to="/insights" className={({ isActive }) => `navbar-link${isActive ? " active" : ""}`}>
            Weekly Insights
          </NavLink>
        </nav>

        <div className="navbar-mode">
          {isEditMode ? (
            <>
              <span className="edit-pill">
                <span className="dot" />
                Edit mode
              </span>
              <button className="btn btn-ghost btn-sm" style={{ color: "#fff" }} onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setShowLogin(true)}>
              Log in to edit
            </button>
          )}
        </div>
      </div>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </header>
  );
}
