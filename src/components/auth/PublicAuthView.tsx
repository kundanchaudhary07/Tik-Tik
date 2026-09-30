// src/components/auth/PublicAuthView.tsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { isValidEmail } from "../../utils/validation";
import {
  Lock,
  Mail,
  User as UserIcon,
  CheckCircle2,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { TikTikLogo } from "../common/TikTikLogo";

export type PublicAuthMode = "login" | "register" | "forgot" | "reset" | "verify";

interface PublicAuthViewProps {
  initialMode?: PublicAuthMode;
  onAuthenticated?: (role?: string) => void;
  onBackToHome?: () => void;
}

export const PublicAuthView: React.FC<PublicAuthViewProps> = ({
  initialMode = "login",
  onAuthenticated,
  onBackToHome,
}) => {
  const {
    login,
    register,
    resendVerification,
    resetPassword,
    verifyEmail,
    sessionExpiredMessage,
    clearSessionExpiredMessage,
    rateLimitCountdown,
  } = useAuth();

  const [mode, setMode] = useState<PublicAuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const path = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get("token");

    if (tokenParam) {
      setToken(tokenParam);
    }

    if (path === "/register") {
      setMode("register");
    } else if (path === "/forgot-password") {
      setMode("forgot");
    } else if (path === "/reset-password") {
      setMode("reset");
    } else if (path === "/verify-email") {
      setMode("verify");
    } else if (path === "/login") {
      setMode("login");
    }
  }, []);

  const changeMode = (newMode: PublicAuthMode) => {
    setMode(newMode);
    setErrorMessage(null);
    setSuccessMessage(null);
    clearSessionExpiredMessage();

    if (typeof window !== "undefined") {
      let targetPath = "/login";
      if (newMode === "register") targetPath = "/register";
      else if (newMode === "forgot") targetPath = "/forgot-password";
      else if (newMode === "reset") targetPath = "/reset-password";
      else if (newMode === "verify") targetPath = "/verify-email";

      window.history.replaceState(null, "", targetPath);
    }
  };

  const resetState = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetState();

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !password) {
      setErrorMessage("Please enter both email address and password.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMessage("Invalid email format.");
      return;
    }

    setLoading(true);
    const res = await login(trimmedEmail, password);
    setLoading(false);

    if (res.data) {
      const userRole = res.data.user?.role;
      const targetPath = userRole === "ADMIN" ? "/admin" : "/dashboard";
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", targetPath);
      }
      onAuthenticated?.(userRole);
    } else {
      setErrorMessage(
        res.error?.error?.message ||
          (res.error as any)?.message ||
          "Invalid email address or password. Please try again."
      );
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetState();

    const trimmedName = name.trim();
    const trimmedEmail = email.trim().toLowerCase();

    if (!trimmedName || !trimmedEmail || !password || !confirmPassword) {
      setErrorMessage("Please complete all fields.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMessage("Invalid email format.");
      return;
    }

    if (!trimmedEmail.endsWith("@gmail.com")) {
      setErrorMessage("Please use a Gmail address ending in @gmail.com.");
      return;
    }

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await register(trimmedEmail, password, trimmedName);
    setLoading(false);

    if (res.data) {
      setSuccessMessage("Account created. Check your Gmail inbox to verify your address before signing in.");
    } else {
      const serverErrMsg =
        res.error?.error?.message ||
        (res.error as any)?.message ||
        (res.error as any)?.detail?.[0]?.msg ||
        (res.error as any)?.detail ||
        "Registration failed. Please try again.";
      setErrorMessage(serverErrMsg);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    resetState();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setErrorMessage("Invalid email format.");
      return;
    }

    setLoading(true);
    try {
      await api.request("/api/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmedEmail }),
      });
      setSuccessMessage("If an account exists, a reset link has been sent.");
    } catch {
      setSuccessMessage("If an account exists, a reset link has been sent.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    resetState();

    if (!token || !newPassword) {
      setErrorMessage("Please enter all fields.");
      return;
    }

    if (confirmNewPassword && newPassword !== confirmNewPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    const res = await resetPassword(token, newPassword);
    setLoading(false);

    if (res.data) {
      setSuccessMessage("Password updated. Redirecting to sign in...");
      setTimeout(() => {
        changeMode("login");
      }, 1400);
    } else {
      setErrorMessage(
        res.error?.error?.message || "Invalid or expired reset link. Please try again."
      );
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    resetState();

    if (!token) {
      setErrorMessage("Please enter the verification code received by email.");
      return;
    }

    setLoading(true);
    const res = await verifyEmail(token);
    setLoading(false);

    if (res.data) {
      setSuccessMessage("Email verified.");
      setTimeout(() => {
        changeMode("login");
      }, 1400);
    } else {
      setErrorMessage(res.error?.error?.message || "Invalid or expired link. Please try again.");
    }
  };

  return (
    <div
      className="min-h-screen flex flex-col justify-center py-12 sm:px-6 lg:px-8"
      style={{ backgroundColor: "var(--bg-light)" }}
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Brand Typographic Wordmark */}
        <div className="text-center">
          <button
            type="button"
            onClick={onBackToHome}
            className="inline-flex items-center gap-2 hover:opacity-85 transition-opacity cursor-pointer"
          >
            <TikTikLogo
              size={40}
              showText={true}
              textClassName="text-2xl font-bold tracking-tight"
              textColor="var(--primary-dark)"
            />
          </button>
        </div>

        {/* Main Card */}
        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div
            className="py-8 px-6 sm:px-10 shadow-xs border rounded-2xl"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border-light)",
            }}
          >
            {/* Session Expired Banner */}
            {sessionExpiredMessage && (
              <div
                className="mb-5 p-3 rounded-xl border flex items-start gap-2.5"
                style={{
                  backgroundColor: "var(--surface-soft)",
                  borderColor: "var(--border)",
                  color: "var(--primary-dark)",
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--primary)" }} />
                <div className="flex-1 text-xs leading-relaxed">
                  <span className="font-semibold block">Your session has expired.</span>
                  Please sign in again.
                </div>
                <button
                  type="button"
                  onClick={clearSessionExpiredMessage}
                  className="text-xs font-bold px-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  ×
                </button>
              </div>
            )}

            {/* Error Message */}
            {errorMessage && (
              <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2 text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
                <span className="text-xs leading-relaxed">{errorMessage}</span>
              </div>
            )}

            {/* Success Message */}
            {successMessage && (
              <div
                className="mb-5 p-3 rounded-xl border flex items-start gap-2"
                style={{
                  backgroundColor: "var(--surface-soft)",
                  borderColor: "var(--border)",
                  color: "var(--primary-dark)",
                }}
              >
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--primary)" }} />
                <span className="text-xs leading-relaxed font-medium">{successMessage}</span>
              </div>
            )}

            {/* Rate limit countdown */}
            {rateLimitCountdown !== null && rateLimitCountdown > 0 && (
              <div
                className="mb-5 p-3 rounded-xl border text-xs flex items-center justify-between"
                style={{
                  backgroundColor: "var(--surface-soft)",
                  borderColor: "var(--border)",
                  color: "var(--primary-dark)",
                }}
              >
                <span>Please wait before trying again:</span>
                <span className="font-semibold">{rateLimitCountdown}s</span>
              </div>
            )}

            {/* 1. SIGN IN FORM */}
            {mode === "login" && (
              <div>
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-bold" style={{ color: "var(--primary-dark)" }}>
                    Sign in
                  </h2>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    Plan your day. Stay on track.
                  </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      Email address
                    </label>
                    <div className="relative rounded-lg">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: "var(--text-muted)" }}>
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email address"
                        className="block w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border rounded-lg bg-white"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => changeMode("forgot")}
                        className="text-xs font-medium hover:underline cursor-pointer"
                        style={{ color: "var(--primary)" }}
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative rounded-lg">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: "var(--text-muted)" }}>
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm border rounded-lg bg-white"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || Boolean(rateLimitCountdown)}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: "var(--primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-dark)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
                  >
                    {loading ? "Signing in..." : "Sign in"}
                  </button>

                  <div className="text-center pt-4 border-t mt-5" style={{ borderColor: "var(--border-light)" }}>
                    <button
                      type="button"
                      onClick={async () => {
                        resetState();
                        if (!email.trim().toLowerCase().endsWith("@gmail.com")) {
                          setErrorMessage("Enter your Gmail address first.");
                          return;
                        }
                        setLoading(true);
                        const response = await resendVerification(email);
                        setLoading(false);
                        if (response.data) setSuccessMessage("If your account is unverified, a new verification email has been sent.");
                        else setErrorMessage(response.error?.error?.message || "Please try again shortly.");
                      }}
                      className="text-xs font-semibold hover:underline cursor-pointer"
                      style={{ color: "var(--primary)" }}
                    >
                      Resend verification email
                    </button>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Don&apos;t have an account?{" "}
                      <button
                        type="button"
                        onClick={() => changeMode("register")}
                        className="font-semibold hover:underline cursor-pointer"
                        style={{ color: "var(--primary)" }}
                      >
                        Create account
                      </button>
                    </p>
                  </div>
                </form>
              </div>
            )}

            {/* 2. REGISTER FORM */}
            {mode === "register" && (
              <div>
                <div className="mb-6 text-center">
                  <h2 className="text-xl font-bold" style={{ color: "var(--primary-dark)" }}>
                    Create account
                  </h2>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    Plan your day. Stay on track.
                  </p>
                </div>

                <form onSubmit={handleRegister} className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      Name
                    </label>
                    <div className="relative rounded-lg">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: "var(--text-muted)" }}>
                        <UserIcon className="h-4 w-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Enter your name"
                        className="block w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border rounded-lg bg-white"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      Email address
                    </label>
                    <div className="relative rounded-lg">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: "var(--text-muted)" }}>
                        <Mail className="h-4 w-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email address"
                        className="block w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border rounded-lg bg-white"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      Password
                    </label>
                    <div className="relative rounded-lg">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: "var(--text-muted)" }}>
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="block w-full pl-9 pr-10 py-2.5 text-xs sm:text-sm border rounded-lg bg-white"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                        style={{ color: "var(--text-muted)" }}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                      Confirm password
                    </label>
                    <div className="relative rounded-lg">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: "var(--text-muted)" }}>
                        <Lock className="h-4 w-4" />
                      </div>
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        minLength={8}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="block w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border rounded-lg bg-white"
                        style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading || Boolean(rateLimitCountdown)}
                    className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                    style={{ backgroundColor: "var(--primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-dark)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
                  >
                    {loading ? "Creating account..." : "Create account"}
                  </button>

                  <div className="text-center pt-4 border-t mt-5" style={{ borderColor: "var(--border-light)" }}>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      Already have an account?{" "}
                      <button
                        type="button"
                        onClick={() => changeMode("login")}
                        className="font-semibold hover:underline cursor-pointer"
                        style={{ color: "var(--primary)" }}
                      >
                        Sign in
                      </button>
                    </p>
                  </div>
                </form>
              </div>
            )}

            {/* 3. FORGOT PASSWORD */}
            {mode === "forgot" && (
              <form onSubmit={handleForgot} className="space-y-4">
                <div className="text-center mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 border"
                    style={{
                      backgroundColor: "var(--surface-soft)",
                      borderColor: "var(--border)",
                      color: "var(--primary)",
                    }}
                  >
                    <KeyRound className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--primary-dark)" }}>
                    Forgot password?
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    Enter your email address and we&apos;ll send you a reset link.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Email address
                  </label>
                  <div className="relative rounded-lg">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none" style={{ color: "var(--text-muted)" }}>
                      <Mail className="h-4 w-4" />
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="block w-full pl-9 pr-3 py-2.5 text-xs sm:text-sm border rounded-lg bg-white"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer"
                  style={{ backgroundColor: "var(--primary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-dark)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
                >
                  {loading ? "Sending..." : "Send reset link"}
                </button>

                <div className="text-center pt-4 border-t text-xs" style={{ borderColor: "var(--border-light)" }}>
                  <button
                    type="button"
                    onClick={() => changeMode("login")}
                    className="font-medium cursor-pointer"
                    style={{ color: "var(--primary)" }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )}

            {/* 4. RESET PASSWORD */}
            {mode === "reset" && (
              <form onSubmit={handleReset} className="space-y-4">
                <div className="text-center mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 border"
                    style={{
                      backgroundColor: "var(--surface-soft)",
                      borderColor: "var(--border)",
                      color: "var(--primary)",
                    }}
                  >
                    <Lock className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--primary-dark)" }}>
                    Set a new password
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    Choose a new password for your account.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Reset token
                  </label>
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter reset token"
                    className="block w-full px-3 py-2 text-xs sm:text-sm border rounded-lg bg-white"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    New password
                  </label>
                  <div className="relative rounded-lg">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="block w-full px-3 pr-10 py-2 text-xs sm:text-sm border rounded-lg bg-white"
                      style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Confirm password
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={confirmNewPassword}
                    onChange={(e) => setConfirmNewPassword(e.target.value)}
                    className="block w-full px-3 py-2 text-xs sm:text-sm border rounded-lg bg-white"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer"
                  style={{ backgroundColor: "var(--primary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-dark)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
                >
                  {loading ? "Updating password..." : "Update password"}
                </button>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => changeMode("login")}
                    className="text-xs font-medium cursor-pointer"
                    style={{ color: "var(--primary)" }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )}

            {/* 5. VERIFY EMAIL */}
            {mode === "verify" && (
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="text-center mb-5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 border"
                    style={{
                      backgroundColor: "var(--surface-soft)",
                      borderColor: "var(--border)",
                      color: "var(--primary)",
                    }}
                  >
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--primary-dark)" }}>
                    Verify your email
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    We&apos;ve sent a verification link to your email address.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Verification code
                  </label>
                  <input
                    type="text"
                    required
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="Enter verification code"
                    className="block w-full px-3 py-2 text-xs sm:text-sm border rounded-lg bg-white"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  />
                </div>

                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 rounded-lg text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer"
                    style={{ backgroundColor: "var(--primary)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-dark)")}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
                  >
                    {loading ? "Verifying..." : "Verify email"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!email) {
                        setErrorMessage("Please enter your email address to resend verification.");
                        return;
                      }
                      setErrorMessage(null);
                      try {
                        await api.request("/api/auth/resend-verification", {
                          method: "POST",
                          body: JSON.stringify({ email }),
                        });
                        setSuccessMessage("Verification email resent.");
                      } catch {
                        setErrorMessage("Unable to resend verification email.");
                      }
                    }}
                    className="py-2.5 px-4 rounded-lg text-xs sm:text-sm font-medium border transition-colors cursor-pointer"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Resend email
                  </button>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => changeMode("login")}
                    className="text-xs font-medium cursor-pointer"
                    style={{ color: "var(--primary)" }}
                  >
                    Back to sign in
                  </button>
                </div>
              </form>
            )}
          </div>

          {onBackToHome && (
            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={onBackToHome}
                className="text-xs font-medium transition-colors cursor-pointer"
                style={{ color: "var(--text-secondary)" }}
              >
                Back to home
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
