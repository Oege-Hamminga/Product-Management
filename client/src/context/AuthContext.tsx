import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { api, ApiError, getToken, setToken } from "../api/client";

interface AuthContextValue {
  isEditMode: boolean;
  loginError: string | null;
  isLoggingIn: boolean;
  login: (password: string) => Promise<boolean>;
  logout: () => void;
  clearLoginError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isEditMode, setIsEditMode] = useState<boolean>(() => Boolean(getToken()));
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const login = useCallback(async (password: string) => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const { token } = await api.login(password);
      setToken(token);
      setIsEditMode(true);
      return true;
    } catch (err) {
      setLoginError(err instanceof ApiError ? err.message : "Could not log in.");
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setIsEditMode(false);
  }, []);

  const clearLoginError = useCallback(() => setLoginError(null), []);

  return (
    <AuthContext.Provider
      value={{ isEditMode, loginError, isLoggingIn, login, logout, clearLoginError }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
