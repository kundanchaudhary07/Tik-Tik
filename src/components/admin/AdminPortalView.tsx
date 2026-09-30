// src/components/admin/AdminPortalView.tsx
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  Clock,
  MessageSquare,
  Shield,
  RotateCw,
  Search,
  X,
  AlertTriangle,
  UserCheck,
  UserX,
  Trash2,
  Calendar,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Activity as ActivityIcon,
} from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";
import { ConfirmDialog } from "../common/ConfirmDialog";
import { InteractiveListCard } from "../common/InteractiveListCard";
import {
  DetailModal,
  DetailSection,
  DetailGrid,
  DetailRow,
} from "../common/DetailModal";
import { AdminRecordDetailsModal, AdminRecordType } from "./AdminRecordDetailsModal";

export type AdminSection =
  | "overview"
  | "users"
  | "activities"
  | "reminders"
  | "followups"
  | "audit-logs";

function formatAuditAction(action: string): string {
  const map: Record<string, string> = {
    USER_AUTHENTICATED: "User signed in",
    USER_REGISTERED: "User registered",
    USER_SUSPENDED: "User suspended",
    USER_RESTORED: "User restored",
    USER_REMOVED: "User removed",
    ACTIVITY_CREATED: "Activity created",
    ACTIVITY_UPDATED: "Activity updated",
    ACTIVITY_COMPLETED: "Activity completed",
    ACTIVITY_DELETED: "Activity deleted",
    REMINDER_SCHEDULED: "Reminder scheduled",
    REMINDER_DELIVERED: "Reminder delivered",
    REMINDER_TRIGGERED: "Reminder triggered",
    REMINDER_DISMISSED: "Reminder dismissed",
    FOLLOWUP_CREATED: "Follow-up scheduled",
    FOLLOWUP_COMPLETED: "Follow-up completed",
    PASSWORD_RESET_REQUESTED: "Password reset requested",
    PASSWORD_RESET_COMPLETED: "Password reset completed",
  };
  return map[action] || action.replace(/_/g, " ").toLowerCase();
}

function formatImportance(val: number | string): string {
  const n = Number(val);
  if (n === 5) return "Critical";
  if (n === 4) return "Important";
  if (n === 3) return "Normal";
  return "Low";
}

export const AdminPortalView: React.FC = () => {
  const { showToast } = useToast();
  const [activeSection, setActiveSection] = useState<AdminSection>("overview");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states from Postgres
  const [metrics, setMetrics] = useState<any>(null);
  const [usersList, setUsersList] = useState<any[]>([]);
  const [activitiesList, setActivitiesList] = useState<any[]>([]);
  const [remindersList, setRemindersList] = useState<any[]>([]);
  const [followupsList, setFollowupsList] = useState<any[]>([]);
  const [auditLogsList, setAuditLogsList] = useState<any[]>([]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<string>("ALL");
  const [userStatusFilter, setUserStatusFilter] = useState<string>("ALL");
  const [activityStatusFilter, setActivityStatusFilter] = useState<string>("ALL");
  const [reminderStatusFilter, setReminderStatusFilter] = useState<string>("ALL");
  const [followupStatusFilter, setFollowupStatusFilter] = useState<string>("ALL");
  const [auditActionFilter, setAuditActionFilter] = useState<string>("ALL");

  // User details view modal state
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [userDetails, setUserDetails] = useState<any | null>(null);
  const [loadingUserDetails, setLoadingUserDetails] = useState(false);
  const [userToRemove, setUserToRemove] = useState<any | null>(null);
  const [removingUser, setRemovingUser] = useState(false);

  // Generic admin record details modal
  const [recordModalType, setRecordModalType] = useState<AdminRecordType>("activity");
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  const fetchSectionData = useCallback(async (section: AdminSection) => {
    setLoading(true);
    setError(null);
    try {
      if (section === "overview") {
        const res = await api.request<any>("/api/admin/overview");
        if (res.data) {
          setMetrics(res.data);
        }
      } else if (section === "users") {
        const res = await api.request<any[]>("/api/admin/users");
        if (res.data) setUsersList(res.data);
        else if (res.error) setError(res.error.error?.message || "Failed to load users.");
      } else if (section === "activities") {
        const res = await api.request<any[]>("/api/admin/activities");
        if (res.data) setActivitiesList(res.data);
        else if (res.error) setError(res.error.error?.message || "Failed to load activities.");
      } else if (section === "reminders") {
        const res = await api.request<any[]>("/api/admin/reminders");
        if (res.data) setRemindersList(res.data);
        else if (res.error) setError(res.error.error?.message || "Failed to load reminders.");
      } else if (section === "followups") {
        const res = await api.request<any[]>("/api/admin/follow-ups");
        if (res.data) setFollowupsList(res.data);
        else if (res.error) setError(res.error.error?.message || "Failed to load follow-ups.");
      } else if (section === "audit-logs") {
        const res = await api.request<any[]>("/api/admin/audit-logs");
        if (res.data) setAuditLogsList(res.data);
        else if (res.error) setError(res.error.error?.message || "Failed to load audit logs.");
      }
    } catch {
      setError("Unable to load data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSectionData(activeSection);
    setSearchTerm("");
  }, [activeSection, fetchSectionData]);

  // Fetch real details for selected user
  const handleOpenUserDetails = async (u: any) => {
    setSelectedUser(u);
    setUserDetails(null);
    setLoadingUserDetails(true);
    try {
      const res = await api.request<any>(`/api/admin/users/${u.id}/details`);
      if (res.data) {
        setUserDetails(res.data);
      } else {
        showToast("Unable to load user details.", "error");
      }
    } catch {
      showToast("Unable to load user details.", "error");
    } finally {
      setLoadingUserDetails(false);
    }
  };

  const handleSuspendUser = async (u: any) => {
    try {
      const res = await api.request(`/api/admin/users/${u.id}/suspend`, { method: "PATCH" });
      if (!res.error) {
        showToast(`User ${u.email} suspended.`, "info");
        fetchSectionData("users");
        if (selectedUser?.id === u.id) {
          handleOpenUserDetails(u);
        }
      } else {
        showToast(res.error.error?.message || "Failed to suspend user.", "error");
      }
    } catch {
      showToast("Unable to suspend user.", "error");
    }
  };

  const handleRestoreUser = async (u: any) => {
    try {
      const res = await api.request(`/api/admin/users/${u.id}/restore`, { method: "PATCH" });
      if (!res.error) {
        showToast(`User ${u.email} restored.`, "success");
        fetchSectionData("users");
        if (selectedUser?.id === u.id) {
          handleOpenUserDetails(u);
        }
      } else {
        showToast(res.error.error?.message || "Failed to restore user.", "error");
      }
    } catch {
      showToast("Unable to restore user.", "error");
    }
  };

  const handleRemoveUser = async () => {
    if (!userToRemove) return;
    setRemovingUser(true);
    try {
      const res = await api.request(`/api/admin/users/${userToRemove.id}`, { method: "DELETE" });
      if (!res.error) {
        showToast(`User ${userToRemove.email} removed.`, "success");
        setUserToRemove(null);
        if (selectedUser?.id === userToRemove.id) {
          setSelectedUser(null);
          setUserDetails(null);
        }
        fetchSectionData("users");
      } else {
        showToast(res.error.error?.message || "Failed to remove user.", "error");
      }
    } catch {
      showToast("Unable to remove user.", "error");
    } finally {
      setRemovingUser(false);
    }
  };

  const handleOpenRecordModal = (type: AdminRecordType, record: any) => {
    setRecordModalType(type);
    setSelectedRecord(record);
    setIsRecordModalOpen(true);
  };

  // Filtered lists
  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      const matchesSearch = searchTerm
        ? (u.email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (u.name || "").toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      const matchesRole = userRoleFilter === "ALL" || u.role === userRoleFilter;
      const matchesStatus =
        userStatusFilter === "ALL" ||
        (userStatusFilter === "ACTIVE" && u.is_active) ||
        (userStatusFilter === "SUSPENDED" && !u.is_active);
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [usersList, searchTerm, userRoleFilter, userStatusFilter]);

  const filteredActivities = useMemo(() => {
    return activitiesList.filter((a) => {
      const matchesSearch = searchTerm
        ? (a.title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (a.owner_email || "").toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      const matchesStatus =
        activityStatusFilter === "ALL" || a.status === activityStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [activitiesList, searchTerm, activityStatusFilter]);

  const filteredReminders = useMemo(() => {
    return remindersList.filter((r) => {
      const matchesSearch = searchTerm
        ? (r.activity_title || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.user_email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (r.message || "").toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      const matchesStatus =
        reminderStatusFilter === "ALL" || r.status === reminderStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [remindersList, searchTerm, reminderStatusFilter]);

  const filteredFollowups = useMemo(() => {
    return followupsList.filter((f) => {
      const matchesSearch = searchTerm
        ? (f.note || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (f.user_email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (f.activity_title || "").toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      const matchesStatus =
        followupStatusFilter === "ALL" || f.status === followupStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [followupsList, searchTerm, followupStatusFilter]);

  const filteredAuditLogs = useMemo(() => {
    return auditLogsList.filter((l) => {
      const matchesSearch = searchTerm
        ? (l.admin_email || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (l.action || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
          (l.target_id || "").toLowerCase().includes(searchTerm.toLowerCase())
        : true;
      const matchesAction =
        auditActionFilter === "ALL" || l.action.startsWith(auditActionFilter);
      return matchesSearch && matchesAction;
    });
  }, [auditLogsList, searchTerm, auditActionFilter]);

  // Clean Navigation: 6 core administration sections
  const navItems: { id: AdminSection; label: string; icon: any }[] = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "users", label: "Users", icon: Users },
    { id: "activities", label: "Activities", icon: CheckSquare },
    { id: "reminders", label: "Reminders", icon: Clock },
    { id: "followups", label: "Follow-ups", icon: MessageSquare },
    { id: "audit-logs", label: "Audit Logs", icon: Shield },
  ];

  const formatDeadline = (iso: string | null) => {
    if (!iso) return "None";
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

  return (
    <div className="space-y-6">
      {/* Admin Header & Clean 6-Section Navigation */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.015em] leading-[1.2] text-[#07383D]">
              Admin Portal
            </h1>
            <p className="text-[14px] font-normal leading-[1.5] text-[#5B888B] mt-0.5">
              Supervise Tik Tik accounts, user activities, and recent events.
            </p>
          </div>

          <button
            onClick={() => fetchSectionData(activeSection)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold rounded-full bg-white border border-[#0F777A]/20 text-[#07383D] hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 shrink-0 shadow-2xs active:scale-95"
          >
            <RotateCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[13px] border-b border-[#0F777A]/10">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 font-medium rounded-full transition-all shrink-0 cursor-pointer ${
                  isActive
                    ? "bg-[#0F777A] text-white shadow-2xs"
                    : "bg-white/70 text-[#5B888B] hover:text-[#07383D] hover:bg-white border border-transparent"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Admin Content */}
      <main className="w-full">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-[13px] font-medium flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* ============================================================== */}
        {/* 1. OVERVIEW: 8 MEANINGFUL KPIS + ACTIVITY DISTRIBUTION + RECENT*/}
        {/* ============================================================== */}
        {activeSection === "overview" && (
          <div className="space-y-7">
            {/* 8 Focused Real KPI Cards */}
            <div>
              <div className="mb-3">
                <h2 className="text-[12px] font-bold uppercase tracking-wider text-[#5B888B]">
                  Platform KPIs
                </h2>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <div className="p-4 rounded-xl sm:rounded-2xl bg-white/75 border border-[#0F777A]/12 shadow-2xs">
                  <span className="text-[11px] text-[#5B888B] font-medium uppercase tracking-[0.05em] block">
                    Users
                  </span>
                  <span className="text-[26px] sm:text-[28px] font-semibold text-[#07383D] block mt-1 leading-none">
                    {metrics?.total_users ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5B888B] mt-1.5 block">
                    Registered accounts
                  </span>
                </div>

                <div className="p-4 rounded-xl sm:rounded-2xl bg-white/75 border border-[#0F777A]/12 shadow-2xs">
                  <span className="text-[11px] text-[#5B888B] font-medium uppercase tracking-[0.05em] block">
                    Active Users
                  </span>
                  <span className="text-[26px] sm:text-[28px] font-semibold text-emerald-700 block mt-1 leading-none">
                    {metrics?.active_users ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5B888B] mt-1.5 block">
                    In good standing
                  </span>
                </div>

                <div className="p-4 rounded-xl sm:rounded-2xl bg-white/75 border border-[#0F777A]/12 shadow-2xs">
                  <span className="text-[11px] text-[#5B888B] font-medium uppercase tracking-[0.05em] block">
                    Activities
                  </span>
                  <span className="text-[26px] sm:text-[28px] font-semibold text-[#07383D] block mt-1 leading-none">
                    {metrics?.total_activities ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5B888B] mt-1.5 block">
                    Total tasks & plans
                  </span>
                </div>

                <div className="p-4 rounded-xl sm:rounded-2xl bg-white/75 border border-[#0F777A]/12 shadow-2xs">
                  <span className="text-[11px] text-[#5B888B] font-medium uppercase tracking-[0.05em] block">
                    Completed
                  </span>
                  <span className="text-[26px] sm:text-[28px] font-semibold text-[#0F777A] block mt-1 leading-none">
                    {metrics?.completed_activities ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5B888B] mt-1.5 block">
                    Finished items
                  </span>
                </div>

                <div className="p-4 rounded-xl sm:rounded-2xl bg-white/75 border border-[#0F777A]/12 shadow-2xs">
                  <span className="text-[11px] text-[#5B888B] font-medium uppercase tracking-[0.05em] block">
                    Pending
                  </span>
                  <span className="text-[26px] sm:text-[28px] font-semibold text-[#07383D] block mt-1 leading-none">
                    {metrics?.pending_activities ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5B888B] mt-1.5 block">
                    In progress & queued
                  </span>
                </div>

                <div
                  className={`p-4 rounded-xl sm:rounded-2xl border shadow-2xs ${
                    metrics?.overdue_activities > 0
                      ? "bg-red-50/70 border-red-200 text-red-950"
                      : "bg-white/75 border-[#0F777A]/12"
                  }`}
                >
                  <span className="text-[11px] text-[#5B888B] font-medium uppercase tracking-[0.05em] block">
                    Overdue
                  </span>
                  <span
                    className={`text-[26px] sm:text-[28px] font-semibold block mt-1 leading-none ${
                      metrics?.overdue_activities > 0 ? "text-red-700" : "text-[#07383D]"
                    }`}
                  >
                    {metrics?.overdue_activities ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5B888B] mt-1.5 block">
                    Past deadline
                  </span>
                </div>

                <div className="p-4 rounded-xl sm:rounded-2xl bg-white/75 border border-[#0F777A]/12 shadow-2xs">
                  <span className="text-[11px] text-[#5B888B] font-medium uppercase tracking-[0.05em] block">
                    Reminders
                  </span>
                  <span className="text-[26px] sm:text-[28px] font-semibold text-[#0F777A] block mt-1 leading-none">
                    {metrics?.scheduled_reminders ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5B888B] mt-1.5 block">
                    Scheduled reminders
                  </span>
                </div>

                <div className="p-4 rounded-xl sm:rounded-2xl bg-white/75 border border-[#0F777A]/12 shadow-2xs">
                  <span className="text-[11px] text-[#5B888B] font-medium uppercase tracking-[0.05em] block">
                    Follow-ups
                  </span>
                  <span className="text-[26px] sm:text-[28px] font-semibold text-[#07383D] block mt-1 leading-none">
                    {metrics?.pending_followups ?? 0}
                  </span>
                  <span className="text-[11px] text-[#5B888B] mt-1.5 block">
                    Active follow-ups
                  </span>
                </div>
              </div>
            </div>

            {/* Activity Overview: Distribution by Status */}
            <div className="p-5 rounded-2xl bg-white/80 border border-[#0F777A]/12 shadow-2xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#07383D]">
                    Activity Distribution
                  </h3>
                  <p className="text-[12px] text-[#5B888B]">
                    Breakdown of user activities by status
                  </p>
                </div>
                <span className="text-[13px] font-medium text-[#0F777A]">
                  Total: {metrics?.total_activities ?? 0}
                </span>
              </div>

              {metrics?.total_activities > 0 ? (
                <div className="space-y-3">
                  {/* Segmented bar */}
                  <div className="w-full h-3 rounded-full bg-slate-100 flex overflow-hidden">
                    <div
                      style={{
                        width: `${Math.round(((metrics?.completed_activities || 0) / metrics.total_activities) * 100)}%`,
                      }}
                      className="bg-[#0F777A] h-full"
                      title="Completed"
                    />
                    <div
                      style={{
                        width: `${Math.round(((metrics?.pending_activities || 0) / metrics.total_activities) * 100)}%`,
                      }}
                      className="bg-[#8BCDCF] h-full"
                      title="Pending"
                    />
                    <div
                      style={{
                        width: `${Math.round(((metrics?.overdue_activities || 0) / metrics.total_activities) * 100)}%`,
                      }}
                      className="bg-red-400 h-full"
                      title="Overdue"
                    />
                  </div>

                  {/* Legend with percentages */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-[12px]">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#0F777A] shrink-0" />
                      <div>
                        <span className="font-semibold text-[#07383D] block">Completed</span>
                        <span className="text-[#5B888B]">
                          {metrics.completed_activities || 0} ({Math.round(((metrics.completed_activities || 0) / metrics.total_activities) * 100)}%)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#8BCDCF] shrink-0" />
                      <div>
                        <span className="font-semibold text-[#07383D] block">Pending</span>
                        <span className="text-[#5B888B]">
                          {metrics.pending_activities || 0} ({Math.round(((metrics.pending_activities || 0) / metrics.total_activities) * 100)}%)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-400 shrink-0" />
                      <div>
                        <span className="font-semibold text-[#07383D] block">Overdue</span>
                        <span className="text-[#5B888B]">
                          {metrics.overdue_activities || 0} ({Math.round(((metrics.overdue_activities || 0) / metrics.total_activities) * 100)}%)
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-slate-300 shrink-0" />
                      <div>
                        <span className="font-semibold text-[#07383D] block">Other / Cancelled</span>
                        <span className="text-[#5B888B]">
                          {Math.max(
                            0,
                            metrics.total_activities -
                              (metrics.completed_activities || 0) -
                              (metrics.pending_activities || 0) -
                              (metrics.overdue_activities || 0)
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-[13px] text-[#5B888B]">
                  No activities created in the system yet.
                </div>
              )}
            </div>

            {/* Recent Meaningful Events List */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-[16px] font-semibold text-[#07383D]">
                    Recent System Events
                  </h3>
                  <p className="text-[12px] text-[#5B888B]">
                    Supervisory log of recent user actions and system events
                  </p>
                </div>
                <button
                  onClick={() => setActiveSection("audit-logs")}
                  className="text-[13px] font-medium text-[#0F777A] hover:underline"
                >
                  View all audit logs
                </button>
              </div>

              {metrics?.recent_activity && metrics.recent_activity.length > 0 ? (
                <div className="space-y-2">
                  {metrics.recent_activity.slice(0, 6).map((log: any) => (
                    <InteractiveListCard
                      key={log.id}
                      icon={<Shield className="w-4 h-4 text-[#0F777A]" />}
                      title={formatAuditAction(log.action)}
                      subtitle={`Actor: ${log.actor || "System"}${log.target_type ? ` · ${log.target_type} #${log.target_id || ""}` : ""}`}
                      trailingMeta={formatDeadline(log.created_at)}
                      onClick={() => handleOpenRecordModal("audit_log", log)}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-white/50 border border-slate-200 text-center text-[13px] text-[#5B888B]">
                  No recent activity logged.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* 2. USERS: INTERACTIVE CARDS & USER DETAILS MODAL               */}
        {/* ============================================================== */}
        {activeSection === "users" && (
          <div className="space-y-4">
            {/* Search and Filters */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5B888B]" />
                <input
                  type="text"
                  placeholder="Search users by email or name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-[14px] rounded-full bg-white/80 border border-[#0F777A]/15 focus:outline-none focus:ring-2 focus:ring-[#0F777A]/30"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={userRoleFilter}
                  onChange={(e) => setUserRoleFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-full bg-white/80 border border-[#0F777A]/15 text-[13px] font-medium cursor-pointer"
                >
                  <option value="ALL">Role: All</option>
                  <option value="USER">User</option>
                  <option value="ADMIN">Admin</option>
                </select>

                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="px-3 py-1.5 rounded-full bg-white/80 border border-[#0F777A]/15 text-[13px] font-medium cursor-pointer"
                >
                  <option value="ALL">Status: All</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                </select>
              </div>
            </div>

            {/* Users List with InteractiveListCard */}
            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-[#5B888B] text-[14px] bg-white/50 rounded-2xl border border-slate-200">
                No users match your criteria.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map((u) => {
                  const initial = u.name ? u.name[0].toUpperCase() : u.email[0].toUpperCase();

                  return (
                    <InteractiveListCard
                      key={u.id}
                      icon={<span className="font-bold text-[14px] text-[#0F777A]">{initial}</span>}
                      title={u.name ? `${u.name} (${u.email})` : u.email}
                      subtitle={`${u.activities_count || 0} activities · ${u.reminders_count || 0} reminders · ${u.followups_count || 0} follow-ups`}
                      badges={
                        <>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              u.role === "ADMIN"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {u.role}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              u.is_active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800"
                            }`}
                          >
                            {u.is_active ? "Active" : "Suspended"}
                          </span>
                        </>
                      }
                      trailingMeta={`Joined ${formatDeadline(u.created_at)}`}
                      onClick={() => handleOpenUserDetails(u)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 3. ACTIVITIES: INTERACTIVE LIST CARDS                           */}
        {/* ============================================================== */}
        {activeSection === "activities" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5B888B]" />
                <input
                  type="text"
                  placeholder="Search activities by title or owner email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-[14px] rounded-full bg-white/80 border border-[#0F777A]/15 focus:outline-none focus:ring-2 focus:ring-[#0F777A]/30"
                />
              </div>

              <select
                value={activityStatusFilter}
                onChange={(e) => setActivityStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full bg-white/80 border border-[#0F777A]/15 text-[13px] font-medium cursor-pointer"
              >
                <option value="ALL">Status: All</option>
                <option value="PENDING">Pending</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {filteredActivities.length === 0 ? (
              <div className="p-12 text-center text-[#5B888B] text-[14px] bg-white/50 rounded-2xl border border-slate-200">
                No activities found.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredActivities.map((act) => {
                  const isCompleted = act.status === "COMPLETED";

                  return (
                    <InteractiveListCard
                      key={act.id}
                      variant={isCompleted ? "completed" : "default"}
                      icon={<CheckSquare className="w-4 h-4 text-[#0F777A]" />}
                      title={act.title}
                      subtitle={`Owner: ${act.owner_email || "User #" + act.user_id} · Type: ${act.activity_type || "Task"}`}
                      badges={
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                            isCompleted
                              ? "bg-[#8BCDCF]/30 text-[#0F777A]"
                              : act.status === "IN_PROGRESS"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {act.status}
                        </span>
                      }
                      trailingMeta={formatDeadline(act.deadline)}
                      onClick={() => handleOpenRecordModal("activity", act)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 4. REMINDERS: INTERACTIVE LIST CARDS                            */}
        {/* ============================================================== */}
        {activeSection === "reminders" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5B888B]" />
                <input
                  type="text"
                  placeholder="Search reminders by message, activity, or user..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-[14px] rounded-full bg-white/80 border border-[#0F777A]/15 focus:outline-none focus:ring-2 focus:ring-[#0F777A]/30"
                />
              </div>

              <select
                value={reminderStatusFilter}
                onChange={(e) => setReminderStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full bg-white/80 border border-[#0F777A]/15 text-[13px] font-medium cursor-pointer"
              >
                <option value="ALL">Status: All</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="DUE">Due</option>
                <option value="SNOOZED">Snoozed</option>
                <option value="DISMISSED">Dismissed</option>
              </select>
            </div>

            {filteredReminders.length === 0 ? (
              <div className="p-12 text-center text-[#5B888B] text-[14px] bg-white/50 rounded-2xl border border-slate-200">
                No reminders found.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredReminders.map((rem) => (
                  <InteractiveListCard
                    key={rem.id}
                    icon={<Clock className="w-4 h-4 text-[#0F777A]" />}
                    title={rem.message || "Reminder"}
                    subtitle={`Activity: ${rem.activity_title || "Unknown"} · User: ${rem.user_email || "User #" + rem.user_id}`}
                    badges={
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#8BCDCF]/25 text-[#07383D]">
                        {rem.status}
                      </span>
                    }
                    trailingMeta={formatDeadline(rem.remind_at)}
                    onClick={() => handleOpenRecordModal("reminder", rem)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 5. FOLLOW-UPS: INTERACTIVE LIST CARDS                           */}
        {/* ============================================================== */}
        {activeSection === "followups" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5B888B]" />
                <input
                  type="text"
                  placeholder="Search follow-ups by note, activity, or user..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-[14px] rounded-full bg-white/80 border border-[#0F777A]/15 focus:outline-none focus:ring-2 focus:ring-[#0F777A]/30"
                />
              </div>

              <select
                value={followupStatusFilter}
                onChange={(e) => setFollowupStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full bg-white/80 border border-[#0F777A]/15 text-[13px] font-medium cursor-pointer"
              >
                <option value="ALL">Status: All</option>
                <option value="PENDING">Pending</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>

            {filteredFollowups.length === 0 ? (
              <div className="p-12 text-center text-[#5B888B] text-[14px] bg-white/50 rounded-2xl border border-slate-200">
                No follow-ups found.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFollowups.map((fu) => (
                  <InteractiveListCard
                    key={fu.id}
                    icon={<MessageSquare className="w-4 h-4 text-[#0F777A]" />}
                    title={fu.note || "Follow-up"}
                    subtitle={`Activity: ${fu.activity_title || "Unknown"} · User: ${fu.user_email || "User #" + fu.user_id}`}
                    badges={
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#8BCDCF]/25 text-[#07383D]">
                        {fu.status}
                      </span>
                    }
                    trailingMeta={formatDeadline(fu.scheduled_at)}
                    onClick={() => handleOpenRecordModal("followup", fu)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* 6. AUDIT LOGS: INTERACTIVE LIST CARDS + PAYLOAD INSPECTION      */}
        {/* ============================================================== */}
        {activeSection === "audit-logs" && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#5B888B]" />
                <input
                  type="text"
                  placeholder="Search audit logs by actor, action, or target ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 text-[14px] rounded-full bg-white/80 border border-[#0F777A]/15 focus:outline-none focus:ring-2 focus:ring-[#0F777A]/30"
                />
              </div>

              <select
                value={auditActionFilter}
                onChange={(e) => setAuditActionFilter(e.target.value)}
                className="px-3 py-1.5 rounded-full bg-white/80 border border-[#0F777A]/15 text-[13px] font-medium cursor-pointer"
              >
                <option value="ALL">Action: All</option>
                <option value="USER">User Events</option>
                <option value="ACTIVITY">Activity Events</option>
                <option value="REMINDER">Reminder Events</option>
                <option value="FOLLOWUP">Follow-up Events</option>
              </select>
            </div>

            {filteredAuditLogs.length === 0 ? (
              <div className="p-12 text-center text-[#5B888B] text-[14px] bg-white/50 rounded-2xl border border-slate-200">
                No audit logs found.
              </div>
            ) : (
              <div className="space-y-2">
                {filteredAuditLogs.map((log) => (
                  <InteractiveListCard
                    key={log.id}
                    icon={<Shield className="w-4 h-4 text-[#0F777A]" />}
                    title={formatAuditAction(log.action)}
                    subtitle={`Actor: ${log.admin_email || "System"}${log.target_type ? ` · ${log.target_type} #${log.target_id || ""}` : ""}`}
                    badges={
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-700">
                        {log.action}
                      </span>
                    }
                    trailingMeta={formatDeadline(log.created_at)}
                    onClick={() => handleOpenRecordModal("audit_log", log)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* USER DETAILS MODAL */}
      {selectedUser && (
        <DetailModal
          isOpen={Boolean(selectedUser)}
          onClose={() => {
            setSelectedUser(null);
            setUserDetails(null);
          }}
          icon={<span className="font-bold text-[14px] text-[#0F777A]">{selectedUser.name ? selectedUser.name[0].toUpperCase() : selectedUser.email[0].toUpperCase()}</span>}
          subtitle="User details"
          title={selectedUser.name || selectedUser.email}
          identifier={`#${selectedUser.id}`}
          badge={
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                selectedUser.is_active
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {selectedUser.is_active ? "Active" : "Suspended"}
            </span>
          }
          maxWidth="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <button
                type="button"
                onClick={() => setUserToRemove(selectedUser)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Remove user</span>
              </button>

              <div className="flex items-center gap-2">
                {selectedUser.is_active ? (
                  <button
                    type="button"
                    onClick={() => handleSuspendUser(selectedUser)}
                    className="px-3.5 py-1.5 rounded-full text-[12px] font-medium bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <UserX className="w-3.5 h-3.5" />
                    <span>Suspend</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRestoreUser(selectedUser)}
                    className="px-3.5 py-1.5 rounded-full text-[12px] font-medium bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 transition-colors cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Restore</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setUserDetails(null);
                  }}
                  className="px-4 py-1.5 rounded-full text-[12px] font-semibold bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          }
        >
          {loadingUserDetails ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-2">
              <div className="w-6 h-6 rounded-full border-2 border-[#0F777A]/20 border-t-[#0F777A] animate-spin" />
              <span className="text-[#5B888B] text-[13px]">Loading user details...</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Account Section */}
              <DetailSection title="Account Information">
                <DetailGrid columns={2}>
                  <DetailRow label="Full Name" value={selectedUser.name || "None set"} />
                  <DetailRow label="Email Address" value={selectedUser.email} />
                  <DetailRow label="Role" value={selectedUser.role} />
                  <DetailRow label="Status" value={selectedUser.is_active ? "Active" : "Suspended"} />
                  <DetailRow label="Email Verified" value={selectedUser.email_verified ? "Yes" : "No"} />
                  <DetailRow label="Joined" value={formatDeadline(selectedUser.created_at)} />
                </DetailGrid>
              </DetailSection>

              {/* Activity Summary */}
              <DetailSection title="Activity Summary">
                <div className="grid grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                    <span className="text-[11px] text-[#5B888B] font-medium uppercase block">Activities</span>
                    <span className="text-[18px] font-bold text-[#07383D] mt-0.5 block leading-none">
                      {userDetails?.activities?.length ?? selectedUser.activities_count ?? 0}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                    <span className="text-[11px] text-[#5B888B] font-medium uppercase block">Reminders</span>
                    <span className="text-[18px] font-bold text-[#0F777A] mt-0.5 block leading-none">
                      {userDetails?.reminders?.length ?? selectedUser.reminders_count ?? 0}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                    <span className="text-[11px] text-[#5B888B] font-medium uppercase block">Follow-ups</span>
                    <span className="text-[18px] font-bold text-[#07383D] mt-0.5 block leading-none">
                      {userDetails?.followups?.length ?? selectedUser.followups_count ?? 0}
                    </span>
                  </div>
                </div>
              </DetailSection>

              {/* User's Recent Activities Preview */}
              {userDetails?.activities && userDetails.activities.length > 0 && (
                <DetailSection title={`Recent User Activities (${userDetails.activities.length})`}>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {userDetails.activities.slice(0, 5).map((act: any) => (
                      <div
                        key={act.id}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-between text-[12px]"
                      >
                        <span className="font-semibold text-[#07383D] truncate">{act.title}</span>
                        <span className="text-[11px] font-medium text-[#5B888B] shrink-0 ml-2">
                          {act.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </DetailSection>
              )}
            </div>
          )}
        </DetailModal>
      )}

      {/* GENERIC RECORD DETAILS MODAL */}
      <AdminRecordDetailsModal
        type={recordModalType}
        record={selectedRecord}
        isOpen={isRecordModalOpen}
        onClose={() => {
          setIsRecordModalOpen(false);
          setSelectedRecord(null);
        }}
      />

      {/* REMOVE USER CONFIRMATION DIALOG */}
      <ConfirmDialog
        isOpen={Boolean(userToRemove)}
        title="Remove User Account"
        message={`Are you sure you want to permanently remove ${userToRemove?.email}? All their activities, reminders, and follow-ups will be deleted. This cannot be undone.`}
        confirmLabel="Remove User"
        isDestructive={true}
        onConfirm={handleRemoveUser}
        onCancel={() => setUserToRemove(null)}
      />
    </div>
  );
};
