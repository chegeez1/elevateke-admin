import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useGetMe } from "@workspace/api-client-react";
import { setAuthTokenGetter } from "@workspace/api-client-react";

interface AuthContextType {
  token: string | null;
  setToken: (token: string | null) => void;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Initialize auth getter synchronously from localStorage so that React Query
// queries fired on the very first render (before any useEffect) already have
// the correct Authorization header — avoids a race-condition 401.
const _initialToken = typeof window !== "undefined" ? localStorage.getItem("elevate_token") : null;
if (_initialToken) {
  setAuthTokenGetter(() => _initialToken);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(_initialToken);

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("elevate_token", newToken);
    } else {
      localStorage.removeItem("elevate_token");
    }
    setTokenState(newToken);
  };

  // Keep the getter up to date when the token changes (e.g. login / logout)
  useEffect(() => {
    setAuthTokenGetter(token ? () => token : null);
  }, [token]);

  const logout = () => {
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, setToken, isAuthenticated: !!token, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
}
