import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
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

  // Only the GitHub-committed build ever fires this (see githubDb.ts) — a
  // write came back 401, meaning the stored token has gone bad (expired, or
  // revoked after being exposed) rather than this being a one-off network
  // blip. Without reacting here, every further change would keep repeating
  // the exact same "Bad credentials" error forever, with no obvious way
  // back to a working login short of noticing and clicking Log out by hand.
  useEffect(() => {
    function handleTokenInvalid() {
      setIsEditMode(false);
      setLoginError("Your login has expired or was revoked — please log in again with a valid token.");
    }
    window.addEventListener("oem-token-invalid", handleTokenInvalid);
    return () => window.removeEventListener("oem-token-invalid", handleTokenInvalid);
  }, []);

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
