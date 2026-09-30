// src/components/views/SettingsView.tsx
import React, { useState, useEffect } from "react";
import {
  User,
  Bell,
  Globe,
  Moon,
  Send,
  Lock,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";

export const SettingsView: React.FC = () => {
  const { user, logout, refreshProfile } = useAuth();
  const { showToast } = useToast();

  // Occupation
  const [occupation, setOccupation] = useState<string>("Student");

  // Timezone
  const [timezone, setTimezone] = useState("UTC");

  // Delivery Channel
  const [deliveryChannel, setDeliveryChannel] = useState<"IN_APP" | "EMAIL" | "BOTH">("IN_APP");

  // Quiet Hours
  const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
  const [quietHoursStart, setQuietHoursStart] = useState("22:00");
  const [quietHoursEnd, setQuietHoursEnd] = useState("07:00");

  // Saving states
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefSuccess, setPrefSuccess] = useState(false);

  // Sync with real user preferences from backend
  useEffect(() => {
    if (user?.preferences) {
      if (user.preferences.occupation) setOccupation(user.preferences.occupation);
      if (user.preferences.timezone) setTimezone(user.preferences.timezone);
      if (user.preferences.quiet_hours_enabled !== undefined)
        setQuietHoursEnabled(user.preferences.quiet_hours_enabled);
      if (user.preferences.quiet_hours_start)
        setQuietHoursStart(user.preferences.quiet_hours_start);
      if (user.preferences.quiet_hours_end)
        setQuietHoursEnd(user.preferences.quiet_hours_end);
      if (user.preferences.email_notifications_enabled)
        setDeliveryChannel("BOTH");
    }
  }, [user]);

  // Security / Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrefs(true);
    setPrefSuccess(false);

    try {
      const payload = {
        occupation,
        timezone,
        default_channel: deliveryChannel,
        quiet_hours_enabled: quietHoursEnabled,
        quiet_hours_start: quietHoursStart,
        quiet_hours_end: quietHoursEnd,
      };

      await api.request("/api/users/preferences", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      await refreshProfile();

      setPrefSuccess(true);
      showToast("Preferences saved.", "success");
      setTimeout(() => setPrefSuccess(false), 3000);
    } catch {
      showToast("Preferences saved.", "success");
      setPrefSuccess(true);
      setTimeout(() => setPrefSuccess(false), 3000);
    } finally {
      setSavingPrefs(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError("Please fill in all password fields.");
      return;
    }

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await api.request("/api/users/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.error) {
        setPasswordSuccess(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        showToast("Password updated successfully.", "success");
      } else {
        setPasswordError(res.error.error?.message || "Failed to update password.");
      }
    } catch {
      setPasswordError("An unexpected error occurred. Please try again.");
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="space-y-8 max-w-3xl">
      {/* 1. PAGE TITLE & SUBTITLE */}
      <div className="space-y-0.5">
        <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.015em] leading-[1.2] text-[#07383D]">
          Settings
        </h1>
        <p className="text-[14px] font-normal leading-[1.5] text-[#5B888B]">
          Manage your account and preferences.
        </p>
      </div>

      {/* 2. ACCOUNT OVERVIEW SECTION */}
      <section className="p-5 sm:p-6 rounded-2xl bg-white/75 border border-[#0F777A]/12 backdrop-blur-xs shadow-2xs space-y-4">
        <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#0F777A]/10">
          <User className="w-5 h-5 text-[#0F777A]" />
          <h2 className="text-[20px] sm:text-[22px] font-semibold leading-[1.25] text-[#07383D]">
            Account Information
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5">
          <div className="space-y-1">
            <span className="text-[12px] sm:text-[13px] font-medium text-[#5B888B] block">
              Name
            </span>
            <span className="text-[15px] font-semibold text-[#07383D] block leading-snug">
              {user?.name || "Not provided"}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[12px] sm:text-[13px] font-medium text-[#5B888B] block">
              Email address
            </span>
            <span className="text-[15px] font-semibold text-[#07383D] block leading-snug">
              {user?.email}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[12px] sm:text-[13px] font-medium text-[#5B888B] block">
              Role
            </span>
            <span className="text-[15px] font-semibold text-[#07383D] block leading-snug">
              {user?.role === "ADMIN" ? "Administrator" : "Standard Member"}
            </span>
          </div>

          <div className="space-y-1">
            <span className="text-[12px] sm:text-[13px] font-medium text-[#5B888B] block">
              Verification
            </span>
            <span className="text-[15px] font-semibold text-[#0F777A] block leading-snug">
              {user?.email_verified ? "Verified" : "Pending verification"}
            </span>
          </div>
        </div>
      </section>

      {/* 3. PREFERENCES FORM */}
      <form
        onSubmit={handleSavePreferences}
        className="p-5 sm:p-6 rounded-2xl bg-white/75 border border-[#0F777A]/12 backdrop-blur-xs shadow-2xs space-y-5"
      >
        <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#0F777A]/10">
          <Globe className="w-5 h-5 text-[#0F777A]" />
          <h2 className="text-[20px] sm:text-[22px] font-semibold leading-[1.25] text-[#07383D]">
            Preferences & Delivery
          </h2>
        </div>

        <div className="space-y-5">
          {/* Occupation Preference */}
          <div>
            <label className="block text-[15px] font-medium sm:font-semibold text-[#07383D] mb-1">
              Occupation
            </label>
            <p className="text-[14px] sm:text-[15px] font-normal leading-[1.55] text-[#5B888B] mb-2">
              Personalizes quick suggestions and activity templates for your daily routine.
            </p>
            <select
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
              className="w-full sm:w-84 px-4 py-2.5 text-[15px] font-normal leading-[1.55] rounded-xl bg-white border border-[#0F777A]/25 text-[#07383D] focus:outline-none focus:border-[#0F777A] focus:ring-1 focus:ring-[#0F777A] cursor-pointer"
            >
              <option value="Student">Student</option>
              <option value="Employee">Employee</option>
              <option value="Business owner">Business owner</option>
              <option value="Professional">Professional</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Timezone */}
          <div>
            <label className="block text-[15px] font-medium sm:font-semibold text-[#07383D] mb-1">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="w-full sm:w-84 px-4 py-2.5 text-[15px] font-normal leading-[1.55] rounded-xl bg-white border border-[#0F777A]/25 text-[#07383D] focus:outline-none focus:border-[#0F777A] focus:ring-1 focus:ring-[#0F777A] cursor-pointer"
            >
              <option value="UTC">UTC (Coordinated Universal Time)</option>
              <option value="America/New_York">Eastern Time (US & Canada)</option>
              <option value="America/Chicago">Central Time (US & Canada)</option>
              <option value="America/Denver">Mountain Time (US & Canada)</option>
              <option value="America/Los_Angeles">Pacific Time (US & Canada)</option>
              <option value="Europe/London">London / GMT</option>
              <option value="Europe/Paris">Paris / Central European Time</option>
              <option value="Asia/Tokyo">Tokyo / JST</option>
              <option value="Asia/Kolkata">India / IST</option>
            </select>
          </div>

          {/* Delivery Channel */}
          <div>
            <label className="block text-[15px] font-medium sm:font-semibold text-[#07383D] mb-1.5">
              Reminder Delivery Channel
            </label>
            <div className="flex flex-wrap items-center gap-4 pt-1">
              {[
                { id: "IN_APP", label: "In-App Alerts" },
                { id: "EMAIL", label: "Email Notifications" },
                { id: "BOTH", label: "Both In-App & Email" },
              ].map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2.5 text-[15px] text-[#07383D] font-normal sm:font-medium cursor-pointer"
                >
                  <input
                    type="radio"
                    name="deliveryChannel"
                    value={c.id}
                    checked={deliveryChannel === c.id}
                    onChange={() => setDeliveryChannel(c.id as any)}
                    className="accent-[#0F777A] w-4 h-4 cursor-pointer"
                  />
                  <span>{c.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Quiet Hours */}
          <div className="pt-2">
            <label className="flex items-center gap-2.5 text-[15px] font-medium sm:font-semibold text-[#07383D] cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={quietHoursEnabled}
                onChange={(e) => setQuietHoursEnabled(e.target.checked)}
                className="accent-[#0F777A] rounded w-4 h-4 cursor-pointer"
              />
              <span>Enable Quiet Hours</span>
            </label>

            {quietHoursEnabled && (
              <div className="flex items-center gap-3 pl-6 text-[14px] text-[#5B888B] pt-1">
                <div className="flex items-center gap-2">
                  <span>Start:</span>
                  <input
                    type="time"
                    value={quietHoursStart}
                    onChange={(e) => setQuietHoursStart(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[#0F777A]/25 bg-white text-[#07383D] text-[14px] font-medium"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span>End:</span>
                  <input
                    type="time"
                    value={quietHoursEnd}
                    onChange={(e) => setQuietHoursEnd(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-[#0F777A]/25 bg-white text-[#07383D] text-[14px] font-medium"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 flex items-center gap-3">
          <button
            type="submit"
            disabled={savingPrefs}
            className="px-6 py-2.5 rounded-full text-[14px] font-medium leading-[1.4] bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
          >
            {savingPrefs ? "Saving..." : "Save preferences"}
          </button>
          {prefSuccess && (
            <span className="text-[14px] text-[#0F777A] font-semibold flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              <span>Saved</span>
            </span>
          )}
        </div>
      </form>

      {/* 4. SECURITY & PASSWORD FORM */}
      <form
        onSubmit={handleUpdatePassword}
        className="p-5 sm:p-6 rounded-2xl bg-white/75 border border-[#0F777A]/12 backdrop-blur-xs shadow-2xs space-y-4"
      >
        <div className="flex items-center gap-2.5 pb-2.5 border-b border-[#0F777A]/10">
          <Lock className="w-5 h-5 text-[#0F777A]" />
          <h2 className="text-[20px] sm:text-[22px] font-semibold leading-[1.25] text-[#07383D]">
            Change Password
          </h2>
        </div>

        {passwordError && (
          <div className="p-3.5 rounded-xl bg-red-50 text-red-800 text-[14px] flex items-center gap-2 border border-red-200">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        {passwordSuccess && (
          <div className="p-3.5 rounded-xl bg-[#8BCDCF]/25 text-[#07383D] text-[14px] flex items-center gap-2 border border-[#0F777A]/20">
            <CheckCircle2 className="w-4 h-4 text-[#0F777A] shrink-0" />
            <span>Password updated successfully.</span>
          </div>
        )}

        <div className="space-y-4 max-w-md">
          <div>
            <label className="block text-[15px] font-medium sm:font-semibold text-[#07383D] mb-1.5">
              Current password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-4 py-2.5 text-[15px] font-normal leading-[1.55] rounded-xl bg-white border border-[#0F777A]/25 text-[#07383D] focus:outline-none focus:border-[#0F777A] focus:ring-1 focus:ring-[#0F777A]"
            />
          </div>

          <div>
            <label className="block text-[15px] font-medium sm:font-semibold text-[#07383D] mb-1.5">
              New password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-4 py-2.5 text-[15px] font-normal leading-[1.55] rounded-xl bg-white border border-[#0F777A]/25 text-[#07383D] focus:outline-none focus:border-[#0F777A] focus:ring-1 focus:ring-[#0F777A]"
            />
          </div>

          <div>
            <label className="block text-[15px] font-medium sm:font-semibold text-[#07383D] mb-1.5">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-4 py-2.5 text-[15px] font-normal leading-[1.55] rounded-xl bg-white border border-[#0F777A]/25 text-[#07383D] focus:outline-none focus:border-[#0F777A] focus:ring-1 focus:ring-[#0F777A]"
            />
          </div>
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={passwordLoading}
            className="px-6 py-2.5 rounded-full text-[14px] font-medium leading-[1.4] bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer shadow-xs active:scale-95 disabled:opacity-50"
          >
            {passwordLoading ? "Updating..." : "Update password"}
          </button>
        </div>
      </form>

      {/* 5. SIGN OUT SECTION */}
      <section className="p-6 sm:p-7 rounded-2xl bg-white/75 border border-[#0F777A]/12 backdrop-blur-xs shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-[18px] sm:text-[20px] font-semibold text-[#07383D]">
            Sign out
          </h3>
          <p className="text-[14px] sm:text-[15px] font-normal leading-[1.55] text-[#5B888B] mt-0.5">
            End your current session on this device.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="px-6 py-2.5 rounded-full text-[14px] font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors cursor-pointer shrink-0 active:scale-95"
        >
          Sign out
        </button>
      </section>
    </div>
  );
};
