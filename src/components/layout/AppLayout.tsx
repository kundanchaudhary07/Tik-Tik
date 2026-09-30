// src/components/layout/AppLayout.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard,
  CheckSquare,
  Clock,
  MessageSquare,
  Bell,
  Settings,
  Shield,
  Menu,
  X,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { TikTikLogo } from "../common/TikTikLogo";

export type NavTab =
  | "dashboard"
  | "activities"
  | "reminders"
  | "follow-ups"
  | "notifications"
  | "settings"
  | "admin";

interface AppLayoutProps {
  currentTab: NavTab;
  onNavigate: (tab: NavTab) => void;
  onOpenAuth: (mode?: "login" | "register") => void;
  children: React.ReactNode;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  currentTab,
  onNavigate,
  onOpenAuth,
  children,
}) => {
  const { user, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  // Poll notifications only if authenticated
  const checkNotifications = useCallback(async () => {
    if (!user || !api.getToken()) return;
    try {
      const res = await api.request<any[]>("/api/notifications");
      if (res.data) {
        const unread = res.data.filter((n) => !n.read && !n.is_read).length;
        setUnreadCount(unread);
      }
    } catch {
      // Silently ignore notification poll errors
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      checkNotifications();
    }
    const notifInterval = user ? setInterval(checkNotifications, 20000) : null;
    return () => {
      if (notifInterval) clearInterval(notifInterval);
    };
  }, [user, checkNotifications]);

  interface NavLinkItem {
    id: NavTab;
    label: string;
    icon: any;
    badge?: number | null;
  }

  const navLinks: NavLinkItem[] = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "activities", label: "Activities", icon: CheckSquare },
    { id: "reminders", label: "Reminders", icon: Clock },
    { id: "follow-ups", label: "Follow-ups", icon: MessageSquare },
    {
      id: "notifications",
      label: "Notifications",
      icon: Bell,
      badge: unreadCount > 0 ? unreadCount : null,
    },
    { id: "settings", label: "Settings", icon: Settings },
  ];

  if (user?.role === "ADMIN") {
    navLinks.push({ id: "admin", label: "Admin", icon: Shield });
  }

  const handleSelectNav = (tab: NavTab) => {
    onNavigate(tab);
    setMobileMenuOpen(false);
  };

  const userInitial = user?.name ? user.name[0].toUpperCase() : user?.email ? user.email[0].toUpperCase() : "U";
  const userDisplayName = user?.name || user?.email?.split("@")[0] || "User";

  return (
    <div
      className="min-h-screen flex flex-col selection:bg-[#B8DEDF] selection:text-[#07383D] relative"
      style={{
        backgroundColor: "#F7FCFC",
        color: "#07383D",
      }}
    >
      {/* Background Atmosphere (Zero Hard Box, Blended Radial Cyan Glow) */}
      <div
        className="fixed inset-0 pointer-events-none select-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 90% 60% at 50% -10%, rgba(184, 222, 223, 0.35), rgba(247, 252, 252, 0) 70%), radial-gradient(ellipse 60% 40% at 90% 30%, rgba(221, 242, 242, 0.25), rgba(247, 252, 252, 0) 60%)",
        }}
        aria-hidden="true"
      />

      {/* 
        NEW AUTHENTICATED HEADER:
        - Transparent header (page background continues seamlessly behind it)
        - LEFT: Tik Tik animated alarm logo + Tik Tik
        - CENTER: Horizontally centered navigation
        - RIGHT: Notification badge, user avatar/name, sign out
      */}
      <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#F7FCFC]/80 border-b border-[#0F777A]/10 transition-all">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-18">
            {/* LEFT: Brand Identity */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-2 rounded-xl text-[#07383D] hover:bg-[#8BCDCF]/20 cursor-pointer transition-colors"
                aria-label="Open navigation menu"
              >
                <Menu className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => handleSelectNav("dashboard")}
                className="flex items-center gap-2.5 cursor-pointer select-none text-left focus:outline-none"
              >
                <TikTikLogo size={30} />
                <span className="font-semibold text-lg tracking-tight text-[#07383D] block leading-none">
                  Tik Tik
                </span>
              </button>
            </div>

            {/* CENTER: Horizontally Centered Navigation Bar (Desktop) */}
            <nav className="hidden lg:flex items-center justify-center gap-1 xl:gap-2 px-2 py-1 rounded-full bg-white/40 border border-[#0F777A]/10 shadow-2xs backdrop-blur-xs">
              {navLinks.map((link) => {
                const isActive = currentTab === link.id;
                return (
                  <button
                    key={link.id}
                    onClick={() => handleSelectNav(link.id)}
                    className={`relative px-3.5 py-1.5 text-[14px] font-medium leading-[1.4] rounded-full transition-all cursor-pointer flex items-center gap-1.5 select-none ${
                      isActive
                        ? "text-[#07383D] bg-[#8BCDCF]/25 shadow-2xs"
                        : "text-[#2C6367] hover:text-[#07383D] hover:bg-white/60"
                    }`}
                  >
                    <span>{link.label}</span>
                    {Boolean(link.badge) && (
                      <span className="px-1.5 py-0.2 text-[11px] font-medium rounded-full bg-[#0F777A] text-white">
                        {link.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {/* RIGHT: User Profile & Actions */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              {/* Notification icon button */}
              {user && (
                <button
                  type="button"
                  onClick={() => handleSelectNav("notifications")}
                  className="relative p-2 rounded-full text-[#2C6367] hover:text-[#07383D] hover:bg-white/60 cursor-pointer transition-all"
                  aria-label="Notifications"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#0F777A] ring-2 ring-[#F7FCFC]" />
                  )}
                </button>
              )}

              {/* User Avatar + Name */}
              {user ? (
                <div className="flex items-center gap-2 sm:gap-3 pl-1 sm:pl-2 border-l border-[#0F777A]/15">
                  <div className="hidden sm:flex flex-col text-right">
                    <span className="text-[14px] font-medium text-[#07383D] truncate max-w-[130px] leading-tight">
                      {userDisplayName}
                    </span>
                    <span className="text-[12px] font-normal text-[#5B888B] leading-tight">
                      {user.role === "ADMIN" ? "Administrator" : "Member"}
                    </span>
                  </div>

                  <div className="w-8 h-8 rounded-full bg-[#8BCDCF]/25 border border-[#0F777A]/20 flex items-center justify-center text-[13px] font-medium text-[#07383D] select-none">
                    {userInitial}
                  </div>

                  {/* Sign out */}
                  <button
                    type="button"
                    onClick={logout}
                    title="Sign out"
                    className="p-1.5 rounded-full text-[#5B888B] hover:text-[#991b1b] hover:bg-red-50 transition-colors cursor-pointer"
                    aria-label="Sign out"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenAuth("login")}
                  className="px-4 py-2 text-[14px] font-medium leading-[1.4] rounded-full bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer"
                >
                  Sign in
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* MOBILE NAVIGATION DRAWER */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-[#07383D]/30 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer content */}
          <div className="relative w-4/5 max-w-xs bg-[#F7FCFC] border-r border-[#0F777A]/15 h-full flex flex-col p-6 shadow-xl z-10">
            <div className="flex items-center justify-between pb-6 border-b border-[#0F777A]/10">
              <div className="flex items-center gap-2.5">
                <TikTikLogo size={28} />
                <span className="font-semibold text-base tracking-tight text-[#07383D]">
                  Tik Tik
                </span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-[#5B888B] hover:text-[#07383D] hover:bg-[#8BCDCF]/20 cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mobile Nav Links */}
            <div className="flex-1 py-6 space-y-1.5 overflow-y-auto">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = currentTab === link.id;
                return (
                  <button
                    key={link.id}
                    onClick={() => handleSelectNav(link.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[14px] font-medium leading-[1.4] transition-all cursor-pointer ${
                      isActive
                        ? "bg-[#8BCDCF]/30 text-[#07383D]"
                        : "text-[#2C6367] hover:bg-white/60 hover:text-[#07383D]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{link.label}</span>
                    </div>
                    {Boolean(link.badge) && (
                      <span className="px-1.5 py-0.2 text-[11px] font-medium rounded-full bg-[#0F777A] text-white">
                        {link.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* User footer on mobile */}
            {user && (
              <div className="pt-4 border-t border-[#0F777A]/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-[#8BCDCF]/30 border border-[#0F777A]/20 flex items-center justify-center text-[13px] font-medium text-[#07383D] shrink-0">
                    {userInitial}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[14px] font-medium text-[#07383D] block truncate">
                      {userDisplayName}
                    </span>
                    <span className="text-[12px] font-normal text-[#5B888B] block">
                      {user.email}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={logout}
                  className="p-2 rounded-lg text-[#5B888B] hover:text-[#991b1b] hover:bg-red-50 cursor-pointer"
                  aria-label="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 z-10">
        {children}
      </main>

      {/* MINIMAL TRANSPARENT FOOTER */}
      <footer className="w-full py-8 px-4 sm:px-6 lg:px-8 max-w-[1360px] mx-auto border-t border-[#0F777A]/10 text-[14px] leading-[1.5] text-[#5B888B] z-10">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <TikTikLogo size={18} />
            <span className="font-semibold text-[#07383D]">Tik Tik</span>
            <span>·</span>
            <span>Plan your day. Stay on track.</span>
          </div>

          <div className="flex items-center gap-4 text-[14px] font-medium leading-[1.4]">
            <button
              onClick={() => handleSelectNav("activities")}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              Activities
            </button>
            <button
              onClick={() => handleSelectNav("reminders")}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              Reminders
            </button>
            <button
              onClick={() => handleSelectNav("follow-ups")}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              Follow-ups
            </button>
            <button
              onClick={() => handleSelectNav("settings")}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              Settings
            </button>
          </div>

          <span className="text-[12px] font-normal text-[#5B888B]/70">© Tik Tik</span>
        </div>
      </footer>
    </div>
  );
};
