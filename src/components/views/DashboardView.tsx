// src/components/views/DashboardView.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  Clock,
  Calendar,
  AlertTriangle,
  Plus,
  CheckCircle2,
  Check,
  Bell,
  MessageSquare,
  RefreshCw,
  CheckSquare,
  Sparkles,
} from "lucide-react";
import { Activity, Reminder, FollowUp } from "../../types/productivity";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../common/Toast";
import { InteractiveListCard } from "../common/InteractiveListCard";
import { ActivityDetailsModal } from "./ActivityDetailsModal";
import { ReminderDetailsModal } from "./ReminderDetailsModal";
import { FollowUpDetailsModal } from "./FollowUpDetailsModal";
import { CreateActivityModal } from "./CreateActivityModal";

export const DashboardView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected item states for detail modals
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isActivityDetailsOpen, setIsActivityDetailsOpen] = useState(false);

  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [isReminderDetailsOpen, setIsReminderDetailsOpen] = useState(false);

  const [selectedFollowup, setSelectedFollowup] = useState<FollowUp | null>(null);
  const [isFollowupDetailsOpen, setIsFollowupDetailsOpen] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const loadData = useCallback(async () => {
    if (!api.getToken()) return;
    setLoading(true);
    setError(null);
    try {
      const [actRes, remRes, fuRes] = await Promise.all([
        api.request<Activity[]>("/api/activities"),
        api.request<Reminder[]>("/api/reminders"),
        api.request<FollowUp[]>("/api/followups"),
      ]);

      if (actRes.data) {
        setActivities(actRes.data);
      } else if (actRes.error) {
        setError(actRes.error.error?.message || "Unable to load activities.");
      }

      if (remRes.data) {
        setReminders(remRes.data);
      }

      if (fuRes.data) {
        setFollowups(fuRes.data);
      }
    } catch {
      setError("Unable to load dashboard data. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenActivity = (act: Activity) => {
    setSelectedActivity(act);
    setIsActivityDetailsOpen(true);
  };

  const handleOpenReminder = (rem: Reminder) => {
    setSelectedReminder(rem);
    setIsReminderDetailsOpen(true);
  };

  const handleOpenFollowup = (fu: FollowUp) => {
    setSelectedFollowup(fu);
    setIsFollowupDetailsOpen(true);
  };

  const handleQuickToggleActivity = async (e: React.MouseEvent, act: Activity) => {
    e.stopPropagation();
    if (act.status === "COMPLETED") {
      try {
        const res = await api.request(`/api/activities/${act.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        });
        if (!res.error) {
          showToast("Activity reopened.", "info");
          loadData();
        }
      } catch {
        showToast("Unable to reopen activity.", "error");
      }
      return;
    }

    const pendingSubtasks = act.subtasks?.filter((s) => !s.is_completed).length || 0;
    if (pendingSubtasks > 0) {
      handleOpenActivity(act);
      return;
    }

    try {
      const res = await api.request(`/api/activities/${act.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.error) {
        showToast("Activity completed.", "success");
        loadData();
      } else {
        handleOpenActivity(act);
      }
    } catch {
      showToast("Unable to complete activity.", "error");
    }
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const displayName = user?.name ? user.name.split(" ")[0] : "";

  // Real backend calculations
  const todayActivities = activities.filter(
    (a) => a.urgency === "DUE_TODAY" && a.status !== "COMPLETED" && a.status !== "CANCELLED"
  );

  const upcomingActivities = activities.filter(
    (a) =>
      (a.urgency === "DUE_SOON" || a.urgency === "MODERATE" || a.urgency === "LOW") &&
      a.status !== "COMPLETED" &&
      a.status !== "CANCELLED"
  );

  const overdueActivities = activities.filter(
    (a) => a.urgency === "OVERDUE" && a.status !== "COMPLETED" && a.status !== "CANCELLED"
  );

  const completedActivities = activities.filter((a) => a.status === "COMPLETED");

  const activeReminders = reminders
    .filter((r) => r.status === "SCHEDULED" || r.status === "DUE" || r.status === "SNOOZED")
    .slice(0, 5);

  const activeFollowups = followups
    .filter((f) => f.status === "PENDING")
    .slice(0, 5);

  const formatDeadline = (iso: string | null) => {
    if (!iso) return "No deadline";
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

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center space-y-3">
        <div className="w-8 h-8 rounded-full border-2 border-[#0F777A]/20 border-t-[#0F777A] animate-spin" />
        <span className="text-[14px] font-normal leading-[1.5] text-[#5B888B]">
          Loading your dashboard...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-white/70 border border-red-200 backdrop-blur-xs max-w-md mx-auto text-center space-y-3">
        <p className="text-[16px] font-semibold leading-[1.3] text-red-900">Unable to load dashboard</p>
        <p className="text-[14px] font-normal leading-[1.5] text-red-700">{error}</p>
        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[14px] font-medium leading-[1.4] text-white bg-[#0F777A] hover:bg-[#07383D] transition-colors cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      {/* 1. HERO GREETING & ADD ACTIVITY */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-1">
        <div className="space-y-0.5">
          <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.015em] leading-[1.2] text-[#07383D]">
            {displayName ? `${getGreeting()}, ${displayName}` : getGreeting()}
          </h1>
          <p className="text-[14px] font-normal leading-[1.5] text-[#5B888B]">
            Here's what you need to focus on today.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium leading-[1.4] bg-[#0F777A] text-white hover:bg-[#07383D] transition-all cursor-pointer shadow-xs shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add activity</span>
        </button>
      </div>

      {/* 2. REAL METRIC TILES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/70 border border-[#0F777A]/10 backdrop-blur-xs shadow-2xs">
          <span className="text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.06em] text-[#5B888B] block">
            Today
          </span>
          <span className="text-[26px] sm:text-[30px] font-semibold leading-[1.1] text-[#07383D] block mt-1">
            {todayActivities.length}
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/70 border border-[#0F777A]/10 backdrop-blur-xs shadow-2xs">
          <span className="text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.06em] text-[#5B888B] block">
            Upcoming
          </span>
          <span className="text-[26px] sm:text-[30px] font-semibold leading-[1.1] text-[#07383D] block mt-1">
            {upcomingActivities.length}
          </span>
        </div>

        <div
          className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border backdrop-blur-xs shadow-2xs transition-colors ${
            overdueActivities.length > 0
              ? "bg-red-50/70 border-red-200 text-red-900"
              : "bg-white/70 border-[#0F777A]/10 text-[#07383D]"
          }`}
        >
          <span className="text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.06em] text-[#5B888B] block">
            Overdue
          </span>
          <span className="text-[26px] sm:text-[30px] font-semibold leading-[1.1] block mt-1">
            {overdueActivities.length}
          </span>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/70 border border-[#0F777A]/10 backdrop-blur-xs shadow-2xs">
          <span className="text-[11px] sm:text-[12px] font-medium uppercase tracking-[0.06em] text-[#5B888B] block">
            Completed
          </span>
          <span className="text-[26px] sm:text-[30px] font-semibold leading-[1.1] text-[#07383D] block mt-1">
            {completedActivities.length}
          </span>
        </div>
      </div>

      {/* 3. OVERDUE CALLOUT (If overdue items exist) */}
      {overdueActivities.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 text-red-900">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <h2 className="text-[18px] sm:text-[20px] font-semibold text-red-900 leading-[1.25]">
              Overdue ({overdueActivities.length})
            </h2>
          </div>

          <div className="space-y-2">
            {overdueActivities.map((act) => (
              <InteractiveListCard
                key={act.id}
                variant="urgent"
                icon={<AlertTriangle className="w-4 h-4 text-red-600" />}
                leadingAction={
                  <button
                    type="button"
                    onClick={(e) => handleQuickToggleActivity(e, act)}
                    className="w-5 h-5 rounded-md border border-red-300 bg-white hover:border-red-500 flex items-center justify-center shrink-0 cursor-pointer"
                    title="Mark complete"
                  >
                    {act.status === "COMPLETED" && <Check className="w-3.5 h-3.5 text-[#0F777A]" />}
                  </button>
                }
                title={act.title}
                subtitle={act.description || "Overdue activity requiring your attention"}
                badges={
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-200/80 text-red-800">
                    Overdue
                  </span>
                }
                trailingMeta={
                  <div className="flex items-center gap-1.5 text-red-700">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDeadline(act.deadline)}</span>
                  </div>
                }
                onClick={() => handleOpenActivity(act)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 4. TODAY'S ACTIVITIES */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[20px] sm:text-[22px] font-semibold text-[#07383D]">
            Today's activities ({todayActivities.length})
          </h2>
        </div>

        {todayActivities.length === 0 ? (
          <div className="p-7 rounded-2xl bg-white/50 border border-[#0F777A]/10 text-center max-w-md mx-auto space-y-2.5">
            <div className="w-9 h-9 rounded-full bg-[#8BCDCF]/20 border border-[#0F777A]/15 flex items-center justify-center mx-auto text-[#0F777A]">
              <Clock className="w-4 h-4" />
            </div>
            <div className="space-y-0.5">
              <h3 className="text-[15px] font-semibold text-[#07383D]">
                {activities.length === 0 ? "No activities yet" : "No activities for today"}
              </h3>
              <p className="text-[13px] text-[#5B888B]">
                Create an activity to organize your schedule.
              </p>
            </div>
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[13px] font-medium bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add activity</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {todayActivities.map((act) => (
              <InteractiveListCard
                key={act.id}
                icon={<CheckSquare className="w-4 h-4 text-[#0F777A]" />}
                leadingAction={
                  <button
                    type="button"
                    onClick={(e) => handleQuickToggleActivity(e, act)}
                    className="w-5 h-5 rounded-md border border-[#0F777A]/30 bg-white hover:border-[#0F777A] flex items-center justify-center shrink-0 cursor-pointer"
                    title="Mark complete"
                  >
                    {act.status === "COMPLETED" && <Check className="w-3.5 h-3.5 text-[#0F777A] stroke-[3]" />}
                  </button>
                }
                title={act.title}
                subtitle={
                  act.total_subtasks > 0
                    ? `${act.completed_subtasks}/${act.total_subtasks} subtasks · ${act.description || "Today"}`
                    : act.description || "Due today"
                }
                badges={
                  <>
                    {act.activity_type && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#8BCDCF]/20 text-[#07383D]">
                        {act.activity_type}
                      </span>
                    )}
                    {act.priority_quadrant === "P1_CRITICAL" && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-800">
                        Critical
                      </span>
                    )}
                  </>
                }
                trailingMeta={
                  <div className="flex items-center gap-1.5 text-[#5B888B]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatDeadline(act.deadline)}</span>
                  </div>
                }
                onClick={() => handleOpenActivity(act)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 5. UPCOMING ACTIVITIES */}
      {upcomingActivities.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] sm:text-[22px] font-semibold text-[#07383D]">
              Upcoming ({upcomingActivities.length})
            </h2>
          </div>

          <div className="space-y-2">
            {upcomingActivities.slice(0, 5).map((act) => (
              <InteractiveListCard
                key={act.id}
                icon={<Calendar className="w-4 h-4 text-[#0F777A]" />}
                leadingAction={
                  <button
                    type="button"
                    onClick={(e) => handleQuickToggleActivity(e, act)}
                    className="w-5 h-5 rounded-md border border-[#0F777A]/30 bg-white hover:border-[#0F777A] flex items-center justify-center shrink-0 cursor-pointer"
                    title="Mark complete"
                  >
                    {act.status === "COMPLETED" && <Check className="w-3.5 h-3.5 text-[#0F777A] stroke-[3]" />}
                  </button>
                }
                title={act.title}
                subtitle={
                  act.total_subtasks > 0
                    ? `${act.completed_subtasks}/${act.total_subtasks} subtasks · ${act.description || "Upcoming"}`
                    : act.description || "Scheduled for later"
                }
                badges={
                  act.activity_type ? (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#8BCDCF]/20 text-[#07383D]">
                      {act.activity_type}
                    </span>
                  ) : null
                }
                trailingMeta={
                  <div className="flex items-center gap-1.5 text-[#5B888B]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDeadline(act.deadline)}</span>
                  </div>
                }
                onClick={() => handleOpenActivity(act)}
              />
            ))}
          </div>
        </section>
      )}

      {/* 6. UPCOMING REMINDERS & UPCOMING FOLLOW-UPS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
        {/* UPCOMING REMINDERS */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 text-[#07383D]">
            <Bell className="w-4 h-4 text-[#0F777A]" />
            <h2 className="text-[18px] sm:text-[20px] font-semibold text-[#07383D] leading-[1.25]">
              Upcoming reminders ({activeReminders.length})
            </h2>
          </div>

          {activeReminders.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white/50 border border-[#0F777A]/10 text-center text-[13px] text-[#5B888B]">
              No reminders scheduled.
            </div>
          ) : (
            <div className="space-y-2">
              {activeReminders.map((r) => (
                <InteractiveListCard
                  key={r.id}
                  icon={<Bell className="w-4 h-4 text-[#0F777A]" />}
                  title={r.message || "Reminder"}
                  subtitle={r.activity_title || "Tik Tik Reminder"}
                  trailingMeta={
                    <div className="flex items-center gap-1.5 text-[#0F777A]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{formatDeadline(r.snooze_until || r.remind_at)}</span>
                    </div>
                  }
                  onClick={() => handleOpenReminder(r)}
                />
              ))}
            </div>
          )}
        </section>

        {/* UPCOMING FOLLOW-UPS */}
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 text-[#07383D]">
            <MessageSquare className="w-4 h-4 text-[#0F777A]" />
            <h2 className="text-[18px] sm:text-[20px] font-semibold text-[#07383D] leading-[1.25]">
              Upcoming follow-ups ({activeFollowups.length})
            </h2>
          </div>

          {activeFollowups.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white/50 border border-[#0F777A]/10 text-center text-[13px] text-[#5B888B]">
              No follow-ups scheduled.
            </div>
          ) : (
            <div className="space-y-2">
              {activeFollowups.map((f) => (
                <InteractiveListCard
                  key={f.id}
                  icon={<MessageSquare className="w-4 h-4 text-[#0F777A]" />}
                  title={f.note || "Follow-up"}
                  subtitle={f.activity_title || "Tik Tik Follow-up"}
                  trailingMeta={
                    <div className="flex items-center gap-1.5 text-[#0F777A]">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDeadline(f.scheduled_at)}</span>
                    </div>
                  }
                  onClick={() => handleOpenFollowup(f)}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* DETAIL MODALS */}
      {selectedActivity && (
        <ActivityDetailsModal
          activity={selectedActivity}
          isOpen={isActivityDetailsOpen}
          onClose={() => {
            setIsActivityDetailsOpen(false);
            setSelectedActivity(null);
          }}
          onUpdated={loadData}
          onDeleted={loadData}
        />
      )}

      {selectedReminder && (
        <ReminderDetailsModal
          reminder={selectedReminder}
          isOpen={isReminderDetailsOpen}
          onClose={() => {
            setIsReminderDetailsOpen(false);
            setSelectedReminder(null);
          }}
          onUpdated={loadData}
          onDeleted={loadData}
          onOpenActivity={(activityId) => {
            const act = activities.find((a) => a.id === activityId);
            if (act) handleOpenActivity(act);
          }}
        />
      )}

      {selectedFollowup && (
        <FollowUpDetailsModal
          followup={selectedFollowup}
          isOpen={isFollowupDetailsOpen}
          onClose={() => {
            setIsFollowupDetailsOpen(false);
            setSelectedFollowup(null);
          }}
          onUpdated={loadData}
          onDeleted={loadData}
          onOpenActivity={(activityId) => {
            const act = activities.find((a) => a.id === activityId);
            if (act) handleOpenActivity(act);
          }}
        />
      )}

      <CreateActivityModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={loadData}
      />
    </div>
  );
};
