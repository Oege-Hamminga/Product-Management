import { useState, type FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";

export default function LoginModal({ onClose }: { onClose: () => void }) {
  const { login, isLoggingIn, loginError, clearLoginError } = useAuth();
  const [password, setPassword] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await login(password);
    if (ok) onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Log in to edit</h2>
        <form onSubmit={handleSubmit} className="field" style={{ gap: 12 }}>
          <div className="field">
            <label htmlFor="admin-password">Admin password</label>
            <input
              id="admin-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearLoginError();
              }}
            />
          </div>
          {loginError && <p className="error-text">{loginError}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoggingIn || !password}>
              {isLoggingIn ? "Checking…" : "Log in"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
