// src/components/views/NotificationsView.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  CheckCheck,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  CheckSquare,
} from "lucide-react";
import { InAppNotification } from "../../types";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";
import { InteractiveListCard } from "../common/InteractiveListCard";
import { NotificationDetailsModal } from "./NotificationDetailsModal";

export const NotificationsView: React.FC = () => {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"ALL" | "UNREAD" | "READ">("ALL");

  const [selectedNotif, setSelectedNotif] = useState<InAppNotification | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<InAppNotification[]>("/api/notifications");
      if (res.data) {
        setNotifications(res.data);
      } else if (res.error) {
        setError(res.error.error?.message || "Unable to load notifications.");
      }
    } catch {
      setError("Unable to load notifications. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkAsRead = async (id: number) => {
    try {
      const res = await api.request(`/api/notifications/${id}/read`, {
        method: "PATCH",
      });
      if (!res.error) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, read: true, is_read: true } : n))
        );
      }
    } catch {
      // silently handle
    }
  };

  const handleMarkAllRead = async () => {
    try {
      const res = await api.request("/api/notifications/read-all", {
        method: "PATCH",
      });
      if (!res.error) {
        showToast("All notifications marked as read.", "success");
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, read: true, is_read: true }))
        );
      }
    } catch {
      showToast("Unable to mark notifications as read.", "error");
    }
  };

  const handleOpenDetails = (notif: InAppNotification) => {
    setSelectedNotif(notif);
    setIsDetailsOpen(true);
  };

  const unreadCount = notifications.filter((n) => !n.read && !n.is_read).length;

  const filtered = notifications.filter((n) => {
    const isRead = Boolean(n.read || n.is_read);
    if (tab === "UNREAD") return !isRead;
    if (tab === "READ") return isRead;
    return true;
  });

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const getNotifIcon = (type?: string) => {
    if (type?.includes("FOLLOWUP")) {
      return <MessageSquare className="w-4 h-4 text-[#0F777A]" />;
    }
    if (type?.includes("ACTIVITY")) {
      return <CheckSquare className="w-4 h-4 text-[#0F777A]" />;
    }
    return <Bell className="w-4 h-4 text-[#0F777A]" />;
  };

  return (
    <div className="space-y-6">
      {/* 1. HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.015em] leading-[1.2] text-[#07383D]">
            Notifications
          </h1>
          <p className="text-[14px] font-normal leading-[1.5] text-[#5B888B] mt-0.5">
            Updates and reminders from Tik Tik.
          </p>
        </div>

        {/* Actions & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] sm:text-[13px] font-medium bg-white/70 border border-[#0F777A]/20 text-[#07383D] hover:bg-white transition-colors cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          )}

          {/* Tabs: All / Unread / Read */}
          <div className="flex items-center gap-1 text-[12px] sm:text-[13px]">
            {(["ALL", "UNREAD", "READ"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-full font-medium transition-all cursor-pointer ${
                  tab === t
                    ? "bg-[#8BCDCF]/30 text-[#07383D] border border-[#0F777A]/20"
                    : "bg-white/60 text-[#5B888B] border border-transparent hover:text-[#07383D] hover:bg-white"
                }`}
              >
                {t === "ALL" && "All"}
                {t === "UNREAD" && `Unread ${unreadCount > 0 ? `(${unreadCount})` : ""}`}
                {t === "READ" && "Read"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. NOTIFICATIONS FEED */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#0F777A]/20 border-t-[#0F777A] animate-spin" />
          <span className="text-[14px] font-normal leading-[1.5] text-[#5B888B]">
            Loading notifications...
          </span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-white/70 border border-red-200 text-center space-y-2 max-w-md mx-auto">
          <p className="text-[14px] font-semibold text-red-900">{error}</p>
          <button
            onClick={loadNotifications}
            className="px-4 py-2 rounded-full text-[14px] font-medium leading-[1.4] text-white bg-[#0F777A] hover:bg-[#07383D] cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center max-w-sm mx-auto space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#8BCDCF]/20 border border-[#0F777A]/15 flex items-center justify-center mx-auto text-[#0F777A]">
            <Bell className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[16px] sm:text-[18px] font-semibold leading-[1.3] text-[#07383D]">
              {tab === "UNREAD" ? "No unread notifications" : "No notifications"}
            </h3>
            <p className="text-[14px] sm:text-[15px] font-normal leading-[1.55] text-[#5B888B]">
              You will be alerted here when tasks, deadlines, or reminders trigger.
            </p>
          </div>
        </div>
      ) : (
        /* NOTIFICATION STREAM WITH INTERACTIVE LIST CARDS */
        <div className="space-y-2">
          {filtered.map((notif) => {
            const isRead = Boolean(notif.read || notif.is_read);

            return (
              <InteractiveListCard
                key={notif.id}
                variant={isRead ? "muted" : "default"}
                icon={getNotifIcon(notif.type)}
                leadingAction={
                  !isRead ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-[#0F777A] shrink-0" />
                  ) : null
                }
                title={notif.title}
                subtitle={notif.message || notif.body || "Notification alert"}
                badges={
                  !isRead ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#8BCDCF]/30 text-[#0F777A]">
                      New
                    </span>
                  ) : null
                }
                trailingMeta={
                  <div className="flex items-center gap-1.5 text-[#5B888B]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTime(notif.created_at)}</span>
                  </div>
                }
                trailingAction={
                  !isRead ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(notif.id);
                      }}
                      className="p-1 rounded-full text-[#5B888B] hover:text-[#0F777A] hover:bg-[#8BCDCF]/20 transition-colors shrink-0"
                      title="Mark as read"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                    </button>
                  ) : null
                }
                onClick={() => handleOpenDetails(notif)}
              />
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedNotif && (
        <NotificationDetailsModal
          notification={selectedNotif}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedNotif(null);
          }}
          onMarkRead={handleMarkAsRead}
        />
      )}
    </div>
  );
};
