// src/App.tsx
import React, { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./components/common/Toast";
import { AppLayout, NavTab } from "./components/layout/AppLayout";
import { DashboardView } from "./components/views/DashboardView";
import { ActivitiesView } from "./components/views/ActivitiesView";
import { RemindersView } from "./components/views/RemindersView";
import { FollowUpsView } from "./components/views/FollowUpsView";
import { NotificationsView } from "./components/views/NotificationsView";
import { SettingsView } from "./components/views/SettingsView";
import { AdminPortalView } from "./components/admin/AdminPortalView";
import { PublicAuthView, PublicAuthMode } from "./components/auth/PublicAuthView";
import { LandingPage } from "./components/landing/LandingPage";
import { AboutPage } from "./components/about/AboutPage";
import { ShieldAlert } from "lucide-react";
import { TikTikLogo } from "./components/common/TikTikLogo";

type PublicView = "landing" | "auth" | "about";

function MainAppContent() {
  const { user, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavTab>(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname.replace(/\/$/, "") || "/";
      if (path === "/admin") return "admin";
      if (path === "/activities" || path.startsWith("/activities/")) return "activities";
      if (path === "/reminders") return "reminders";
      if (path === "/follow-ups") return "follow-ups";
      if (path === "/notifications") return "notifications";
      if (path === "/settings") return "settings";
    }
    return "dashboard";
  });
  const [publicView, setPublicView] = useState<PublicView>("landing");
  const [authMode, setAuthMode] = useState<PublicAuthMode>("login");

  // Synchronize tab and auth state with URL path
  useEffect(() => {
    if (typeof window === "undefined") return;

    const path = window.location.pathname.replace(/\/$/, "") || "/";

    if (!user) {
      if (path === "/about") {
        setPublicView("about");
      } else if (path === "/register") {
        setPublicView("auth");
        setAuthMode("register");
      } else if (path === "/forgot-password") {
        setPublicView("auth");
        setAuthMode("forgot");
      } else if (path === "/reset-password") {
        setPublicView("auth");
        setAuthMode("reset");
      } else if (path === "/verify-email") {
        setPublicView("auth");
        setAuthMode("verify");
      } else if (path === "/login") {
        setPublicView("auth");
        setAuthMode("login");
      } else if (path === "/admin") {
        setPublicView("auth");
        setAuthMode("login");
      } else {
        setPublicView("landing");
      }
      return;
    }

    if (path === "/about") {
      setPublicView("about");
      return;
    }

    // Authenticated state: Route based on role and path
    if (path === "/login" || path === "/register" || path === "/" || path === "") {
      const targetTab: NavTab = user.role === "ADMIN" ? "admin" : "dashboard";
      setCurrentTab(targetTab);
      window.history.replaceState(null, "", `/${targetTab}`);
      return;
    }

    if (path === "/admin") {
      if (user.role === "ADMIN") {
        setCurrentTab("admin");
      } else {
        setCurrentTab("dashboard");
        window.history.replaceState(null, "", "/dashboard");
      }
    } else if (path === "/activities" || path.startsWith("/activities/")) {
      setCurrentTab("activities");
    } else if (path === "/reminders") {
      setCurrentTab("reminders");
    } else if (path === "/follow-ups") {
      setCurrentTab("follow-ups");
    } else if (path === "/notifications") {
      setCurrentTab("notifications");
    } else if (path === "/settings") {
      setCurrentTab("settings");
    } else {
      const targetTab: NavTab = user.role === "ADMIN" ? "admin" : "dashboard";
      setCurrentTab(targetTab);
    }
  }, [user]);

  // Handle browser back/forward buttons
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handlePopState = () => {
      const path = window.location.pathname.replace(/\/$/, "") || "/";
      if (!user) {
        if (path === "/about") {
          setPublicView("about");
        } else if (path === "/register" || path === "/login" || path === "/forgot-password" || path === "/reset-password" || path === "/verify-email" || path === "/admin") {
          setPublicView("auth");
          if (path === "/register") setAuthMode("register");
          else setAuthMode("login");
        } else {
          setPublicView("landing");
        }
      } else {
        if (path === "/about") {
          setPublicView("about");
        } else if (path === "/admin") {
          if (user.role === "ADMIN") setCurrentTab("admin");
          else setCurrentTab("dashboard");
        } else if (path === "/activities" || path.startsWith("/activities/")) {
          setCurrentTab("activities");
        } else if (path === "/reminders") {
          setCurrentTab("reminders");
        } else if (path === "/follow-ups") {
          setCurrentTab("follow-ups");
        } else if (path === "/notifications") {
          setCurrentTab("notifications");
        } else if (path === "/settings") {
          setCurrentTab("settings");
        } else {
          setCurrentTab(user.role === "ADMIN" ? "admin" : "dashboard");
        }
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [user]);

  // Update browser history when navigating tabs in authenticated view
  const handleNavigate = (tab: NavTab) => {
    setCurrentTab(tab);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", `/${tab}`);
    }
  };

  // 1. AUTH_LOADING STATE
  // The application is checking whether an existing session/token is valid.
  if (isLoading) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-4"
        style={{ backgroundColor: "var(--bg-light)" }}
      >
        <div className="flex flex-col items-center gap-4">
          <TikTikLogo size={44} showText={true} textClassName="text-xl font-bold text-[#07383D]" />
          <div
            className="flex items-center gap-2.5 text-xs font-medium px-4 py-2 rounded-full border shadow-2xs"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border-light)",
              color: "var(--primary-dark)",
            }}
          >
            <div
              className="w-3.5 h-3.5 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--border)",
                borderTopColor: "var(--primary)",
              }}
            />
            <span>Loading Tik Tik...</span>
          </div>
        </div>
      </div>
    );
  }

  // 2. PUBLIC / ABOUT VIEW (Available to unauthenticated users or when navigating to /about)
  if (publicView === "about") {
    return (
      <AboutPage
        isAuthenticated={!!user}
        onBackToHome={() => {
          if (user) {
            const targetTab: NavTab = user.role === "ADMIN" ? "admin" : "dashboard";
            setCurrentTab(targetTab);
            if (typeof window !== "undefined") {
              window.history.pushState(null, "", `/${targetTab}`);
            }
          } else {
            setPublicView("landing");
            if (typeof window !== "undefined") {
              window.history.pushState(null, "", "/");
            }
          }
        }}
        onSignIn={() => {
          setAuthMode("login");
          setPublicView("auth");
          if (typeof window !== "undefined") {
            window.history.pushState(null, "", "/login");
          }
        }}
        onRegister={() => {
          setAuthMode("register");
          setPublicView("auth");
          if (typeof window !== "undefined") {
            window.history.pushState(null, "", "/register");
          }
        }}
      />
    );
  }

  // 3. UNAUTHENTICATED STATE
  // Render Landing Page or Public Authentication
  if (!user) {
    if (publicView === "landing") {
      return (
        <LandingPage
          onAbout={() => {
            setPublicView("about");
            if (typeof window !== "undefined") {
              window.history.pushState(null, "", "/about");
            }
          }}
          onSignIn={() => {
            setAuthMode("login");
            setPublicView("auth");
            if (typeof window !== "undefined") {
              window.history.pushState(null, "", "/login");
            }
          }}
          onRegister={() => {
            setAuthMode("register");
            setPublicView("auth");
            if (typeof window !== "undefined") {
              window.history.pushState(null, "", "/register");
            }
          }}
        />
      );
    }

    return (
      <PublicAuthView
        initialMode={authMode}
        onBackToHome={() => {
          setPublicView("landing");
          if (typeof window !== "undefined") {
            window.history.pushState(null, "", "/");
          }
        }}
        onAuthenticated={(role) => {
          const targetTab: NavTab = role === "ADMIN" ? "admin" : "dashboard";
          setCurrentTab(targetTab);
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", `/${targetTab}`);
          }
        }}
      />
    );
  }

  // 4. AUTHENTICATED STATE
  // Render AppLayout and allow protected pages to load with real data
  return (
    <AppLayout
      currentTab={currentTab}
      onNavigate={handleNavigate}
      onOpenAuth={() => {}}
    >
      {currentTab === "dashboard" && <DashboardView />}
      {currentTab === "activities" && <ActivitiesView />}
      {currentTab === "reminders" && <RemindersView />}
      {currentTab === "follow-ups" && <FollowUpsView />}
      {currentTab === "notifications" && <NotificationsView />}
      {currentTab === "settings" && <SettingsView />}
      {currentTab === "admin" && (
        user.role === "ADMIN" ? (
          <AdminPortalView />
        ) : (
          <div className="p-8 max-w-xl mx-auto text-center mt-12">
            <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3 border border-red-200">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-semibold" style={{ color: "var(--primary-dark)" }}>
              Access restricted
            </h2>
            <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              You do not have administrative permission to view the Admin area.
            </p>
          </div>
        )
      )}
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <MainAppContent />
      </ToastProvider>
    </AuthProvider>
  );
}
