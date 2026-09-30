import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { User, AuthTokens } from "../types";
import { api, ApiResponse } from "../services/api";
import { isValidEmail } from "../utils/validation";

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  rateLimitCountdown: number | null;
  lastResponse: ApiResponse | null;
  sessionExpiredMessage: string | null;
  clearSessionExpiredMessage: () => void;
  login: (email: string, password: string) => Promise<ApiResponse<AuthTokens>>;
  register: (email: string, password: string, name?: string) => Promise<ApiResponse<any>>;
  resendVerification: (email: string) => Promise<ApiResponse>;
  logout: () => Promise<void>;
  verifyEmail: (token: string) => Promise<ApiResponse>;
  forgotPassword: (email: string) => Promise<ApiResponse>;
  resetPassword: (token: string, newPassword: string) => Promise<ApiResponse>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(api.getToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null);
  const [lastResponse, setLastResponse] = useState<ApiResponse | null>(null);
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  const clearSessionExpiredMessage = useCallback(() => {
    setSessionExpiredMessage(null);
  }, []);

  // Rate limit countdown effect
  useEffect(() => {
    if (rateLimitCountdown === null || rateLimitCountdown <= 0) return;
    const interval = setInterval(() => {
      setRateLimitCountdown((prev) => (prev && prev > 1 ? prev - 1 : null));
    }, 1000);
    return () => clearInterval(interval);
  }, [rateLimitCountdown]);

  const handleRateLimitCheck = (resp: ApiResponse) => {
    setLastResponse(resp);
    if (resp.status === 429) {
      const retryAfter = resp.headers["retry-after"];
      const seconds = retryAfter ? parseInt(retryAfter, 10) : 60;
      setRateLimitCountdown(isNaN(seconds) ? 60 : seconds);
    }
  };

  const refreshProfile = useCallback(async () => {
    const currentToken = api.getToken();
    if (!currentToken) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    const resp = await api.request<User>("/auth/me");
    handleRateLimitCheck(resp);
    if (resp.data) {
      setUser(resp.data);
      setToken(currentToken);
    } else {
      // Token invalid, expired, or revoked
      api.setToken(null);
      setToken(null);
      setUser(null);
      if (resp.status === 401) {
        setSessionExpiredMessage("Your session has expired. Please sign in again.");
      }
    }
    setIsLoading(false);
  }, []);

  // Register onUnauthorized callback for live 401 handling across all API requests
  useEffect(() => {
    const unsubscribe = api.onUnauthorized((msg) => {
      setUser(null);
      setToken(null);
      setSessionExpiredMessage(msg || "Your session has expired. Please sign in again.");
    });

    refreshProfile();

    return () => {
      unsubscribe();
    };
  }, [refreshProfile]);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    setSessionExpiredMessage(null);

    const normalizedEmail = (email || "").trim().toLowerCase();
    const resp = await api.request<AuthTokens>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email: normalizedEmail, password }),
    });
    handleRateLimitCheck(resp);

    if (resp.data) {
      const receivedToken = resp.data.token || resp.data.access_token || null;
      if (receivedToken) {
        api.setToken(receivedToken);
        setToken(receivedToken);
      }
      setUser(resp.data.user);
    }

    setIsLoading(false);
    return resp;
  };

  const register = async (emailOrName: string, passwordOrEmail: string, nameOrPassword?: string) => {
    let email = emailOrName;
    let password = passwordOrEmail;
    let name = nameOrPassword;

    // Defensive guard: if caller passed (name, email, password)
    if (isValidEmail(passwordOrEmail) && !isValidEmail(emailOrName)) {
      name = emailOrName;
      email = passwordOrEmail;
      password = nameOrPassword || "";
    }

    const trimmedEmail = email ? email.trim() : "";
    const trimmedName = name ? name.trim() : undefined;

    const resp = await api.request<{ user: User; token: string }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({ email: trimmedEmail, password, name: trimmedName }),
    });
    handleRateLimitCheck(resp);

    return resp;
  };

  const resendVerification = async (email: string) => {
    const resp = await api.request("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
    handleRateLimitCheck(resp);
    return resp;
  };

  const logout = async () => {
    const currentToken = api.getToken();
    if (currentToken) {
      try {
        await api.request("/auth/logout", { method: "POST" });
      } catch {
        // Ignore network failure on logout endpoint
      }
    }
    api.setToken(null);
    setToken(null);
    setUser(null);
    setSessionExpiredMessage(null);
  };

  const verifyEmail = async (verificationToken: string) => {
    const resp = await api.request("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token: verificationToken }),
    });
    handleRateLimitCheck(resp);
    if (resp.data) {
      await refreshProfile();
    }
    return resp;
  };

  const forgotPassword = async (email: string) => {
    const resp = await api.request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    handleRateLimitCheck(resp);
    return resp;
  };

  const resetPassword = async (resetToken: string, newPassword: string) => {
    const resp = await api.request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token: resetToken, new_password: newPassword }),
    });
    handleRateLimitCheck(resp);
    return resp;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        rateLimitCountdown,
        lastResponse,
        sessionExpiredMessage,
        clearSessionExpiredMessage,
        login,
        register,
        resendVerification,
        logout,
        verifyEmail,
        forgotPassword,
        resetPassword,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
