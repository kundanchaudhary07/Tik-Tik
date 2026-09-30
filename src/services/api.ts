import { ApiError } from "../types";

export interface ApiResponse<T = any> {
  data: T | null;
  error: ApiError | null;
  status: number;
  headers: Record<string, string>;
  latencyMs: number;
  requestId: string | null;
}

type UnauthorizedListener = (message: string) => void;

class ApiClient {
  private token: string | null = null;
  private unauthorizedListeners: UnauthorizedListener[] = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.token = localStorage.getItem("access_token");
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== "undefined") {
      if (token) {
        localStorage.setItem("access_token", token);
      } else {
        localStorage.removeItem("access_token");
      }
    }
  }

  getToken(): string | null {
    if (!this.token && typeof window !== "undefined") {
      this.token = localStorage.getItem("access_token");
    }
    return this.token;
  }

  onUnauthorized(listener: UnauthorizedListener): () => void {
    this.unauthorizedListeners.push(listener);
    return () => {
      this.unauthorizedListeners = this.unauthorizedListeners.filter((l) => l !== listener);
    };
  }

  private notifyUnauthorized(message: string) {
    for (const listener of this.unauthorizedListeners) {
      try {
        listener(message);
      } catch (err) {
        console.error("Error in onUnauthorized listener:", err);
      }
    }
  }

  async request<T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const startTime = performance.now();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const currentToken = this.getToken();
    if (currentToken && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${currentToken}`;
    }

    // Safety guard: prevent sending requests to protected endpoints if token is absent
    const isPublicAuthEndpoint =
      endpoint.includes("/auth/login") ||
      endpoint.includes("/auth/register") ||
      endpoint.includes("/auth/resend-verification") ||
      endpoint.includes("/auth/forgot-password") ||
      endpoint.includes("/auth/reset-password") ||
      endpoint.includes("/auth/verify-email") ||
      endpoint.startsWith("/health") ||
      endpoint === "/openapi.json";

    if (!currentToken && !isPublicAuthEndpoint) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        data: null,
        error: {
          error: {
            code: "UNAUTHENTICATED",
            message: "Authentication required. Please sign in.",
          },
        },
        status: 401,
        headers: {},
        latencyMs,
        requestId: null,
      };
    }

    try {
      const baseUrl = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
      const fullUrl = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`;

      const response = await fetch(fullUrl, {
        ...options,
        headers,
      });

      const latencyMs = Math.round(performance.now() - startTime);
      const resHeaders: Record<string, string> = {};
      response.headers.forEach((val, key) => {
        resHeaders[key] = val;
      });

      const requestId = response.headers.get("X-Request-ID");

      let json: any = null;
      const text = await response.text();
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }

      // Handle 401 (Unauthorized) from expired or invalid token
      // Note: /auth/login returns 401 for wrong password, which is not an expired session
      if (
        response.status === 401 &&
        currentToken &&
        !endpoint.includes("/auth/login") &&
        !endpoint.includes("/auth/register")
      ) {
        this.setToken(null);
        this.notifyUnauthorized("Your session has expired. Please sign in again.");
      }

      if (!response.ok) {
        return {
          data: null,
          error: json as ApiError,
          status: response.status,
          headers: resHeaders,
          latencyMs,
          requestId,
        };
      }

      return {
        data: json as T,
        error: null,
        status: response.status,
        headers: resHeaders,
        latencyMs,
        requestId,
      };
    } catch (err: any) {
      const latencyMs = Math.round(performance.now() - startTime);
      return {
        data: null,
        error: {
          error: {
            code: "NETWORK_ERROR",
            message: err.message || "Failed to communicate with server.",
          },
        },
        status: 0,
        headers: {},
        latencyMs,
        requestId: null,
      };
    }
  }
}

export const api = new ApiClient();
