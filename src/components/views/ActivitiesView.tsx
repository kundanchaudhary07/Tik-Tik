// src/components/views/ActivitiesView.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  Plus,
  Search,
  ArrowUpDown,
  Calendar,
  Clock,
  Bell,
  MessageSquare,
  CheckCircle2,
  Check,
  X,
  AlertTriangle,
  RotateCw,
  CheckSquare,
} from "lucide-react";
import { Activity } from "../../types/productivity";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";
import { InteractiveListCard } from "../common/InteractiveListCard";
import { ActivityDetailsModal } from "./ActivityDetailsModal";
import { CreateActivityModal } from "./CreateActivityModal";

export const ActivitiesView: React.FC = () => {
  const { showToast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [importanceFilter, setImportanceFilter] = useState("ALL");
  const [priorityFilter, setPriorityFilter] = useState("ALL");
  const [urgencyFilter, setUrgencyFilter] = useState("ALL");

  // Sort
  const [sortBy, setSortBy] = useState("deadline");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  // Modals
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let query = `/api/activities?sort_by=${sortBy}&sort_order=${sortOrder}`;
      if (statusFilter !== "ALL") query += `&status=${statusFilter}`;
      if (priorityFilter !== "ALL") query += `&priority=${priorityFilter}`;
      if (urgencyFilter !== "ALL") query += `&urgency=${urgencyFilter}`;
      if (search.trim()) query += `&search=${encodeURIComponent(search.trim())}`;

      const res = await api.request<Activity[]>(query);
      if (res.data) {
        let filtered = res.data;

        // Filter by Importance
        if (importanceFilter !== "ALL") {
          filtered = filtered.filter((a) => a.importance === Number(importanceFilter));
        }

        // Filter by Type
        if (typeFilter !== "ALL") {
          filtered = filtered.filter((a) => {
            const actType = a.activity_type || "Task";
            return actType.toLowerCase() === typeFilter.toLowerCase();
          });
        }

        setActivities(filtered);
      } else if (res.error) {
        setError(res.error.error?.message || "Failed to load activities.");
      }
    } catch {
      setError("Unable to load activities. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortOrder, statusFilter, priorityFilter, urgencyFilter, importanceFilter, typeFilter, search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadActivities();
    }, 120);
    return () => clearTimeout(timer);
  }, [loadActivities]);

  const handleOpenDetails = (activity: Activity) => {
    setSelectedActivity(activity);
    setIsDetailsOpen(true);
  };

  const handleQuickToggleComplete = async (e: React.MouseEvent, act: Activity) => {
    e.stopPropagation();

    // If activity is already completed, reopen to in progress
    if (act.status === "COMPLETED") {
      try {
        const res = await api.request(`/api/activities/${act.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: "IN_PROGRESS" }),
        });
        if (!res.error) {
          showToast("Activity reopened.", "info");
          loadActivities();
        }
      } catch {
        showToast("Unable to reopen activity.", "error");
      }
      return;
    }

    // If activity has incomplete subtasks, open details modal so user sees them clearly
    const pendingSubtasks = act.subtasks?.filter((s) => !s.is_completed).length || 0;
    if (pendingSubtasks > 0) {
      handleOpenDetails(act);
      return;
    }

    try {
      const res = await api.request(`/api/activities/${act.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      if (!res.error) {
        showToast("Activity completed.", "success");
        loadActivities();
      } else {
        handleOpenDetails(act);
      }
    } catch {
      showToast("Unable to complete activity.", "error");
    }
  };

  const clearFilters = () => {
    setStatusFilter("ALL");
    setTypeFilter("ALL");
    setImportanceFilter("ALL");
    setPriorityFilter("ALL");
    setUrgencyFilter("ALL");
    setSearch("");
  };

  const hasActiveFilters =
    statusFilter !== "ALL" ||
    typeFilter !== "ALL" ||
    importanceFilter !== "ALL" ||
    priorityFilter !== "ALL" ||
    urgencyFilter !== "ALL" ||
    search !== "";

  const formatDeadline = (iso: string | null) => {
    if (!iso) return "No due date";
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

  const getImportanceLabel = (level: number) => {
    switch (level) {
      case 5:
        return "Critical";
      case 4:
        return "Important";
      case 3:
        return "Normal";
      case 2:
        return "Low";
      default:
        return "Minimal";
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.015em] leading-[1.2] text-[#07383D]">
            Activities
          </h1>
          <p className="text-[14px] font-normal leading-[1.5] text-[#5B888B] mt-0.5">
            Plan and track your work.
          </p>
        </div>

        <button
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-[13px] sm:text-[14px] font-medium leading-[1.4] bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer shadow-xs shrink-0 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          <span>Add activity</span>
        </button>
      </div>

      {/* 2. SEARCH & COMPACT FILTERS */}
      <div className="space-y-3">
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#5B888B]">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activities..."
            className="w-full pl-10 pr-4 py-2 text-[14px] font-normal leading-[1.55] rounded-full bg-white/70 border border-[#0F777A]/15 text-[#07383D] placeholder-[#5B888B]/60 focus:outline-none focus:ring-2 focus:ring-[#0F777A]/30 focus:border-[#0F777A] transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-[#5B888B] hover:text-[#07383D] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Filter Dropdowns Row */}
        <div className="flex flex-wrap items-center gap-2 text-[12px] sm:text-[13px] font-normal">
          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-full bg-white/70 border border-[#0F777A]/15 text-[#07383D] font-medium focus:outline-none focus:border-[#0F777A] cursor-pointer"
          >
            <option value="ALL">Status: All</option>
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          {/* Type */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-full bg-white/70 border border-[#0F777A]/15 text-[#07383D] font-medium focus:outline-none focus:border-[#0F777A] cursor-pointer"
          >
            <option value="ALL">Type: All</option>
            <option value="Task">Task</option>
            <option value="Deadline">Deadline</option>
            <option value="Event">Event</option>
            <option value="Follow-up">Follow-up</option>
            <option value="Habit">Habit</option>
            <option value="Custom Activity">Custom Activity</option>
          </select>

          {/* Importance */}
          <select
            value={importanceFilter}
            onChange={(e) => setImportanceFilter(e.target.value)}
            className="px-3 py-1.5 rounded-full bg-white/70 border border-[#0F777A]/15 text-[#07383D] font-medium focus:outline-none focus:border-[#0F777A] cursor-pointer"
          >
            <option value="ALL">Importance: All</option>
            <option value="5">Critical</option>
            <option value="4">Important</option>
            <option value="3">Normal</option>
            <option value="2">Low</option>
          </select>

          {/* Priority */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 rounded-full bg-white/70 border border-[#0F777A]/15 text-[#07383D] font-medium focus:outline-none focus:border-[#0F777A] cursor-pointer"
          >
            <option value="ALL">Priority: All</option>
            <option value="P1_CRITICAL">Critical (P1)</option>
            <option value="P2_HIGH">High (P2)</option>
            <option value="P3_MEDIUM">Medium (P3)</option>
            <option value="P4_LOW">Low (P4)</option>
          </select>

          {/* Urgency */}
          <select
            value={urgencyFilter}
            onChange={(e) => setUrgencyFilter(e.target.value)}
            className="px-3 py-1.5 rounded-full bg-white/70 border border-[#0F777A]/15 text-[#07383D] font-medium focus:outline-none focus:border-[#0F777A] cursor-pointer"
          >
            <option value="ALL">Urgency: All</option>
            <option value="OVERDUE">Overdue</option>
            <option value="DUE_TODAY">Due Today</option>
            <option value="DUE_SOON">Due Soon</option>
            <option value="MODERATE">Moderate</option>
            <option value="LOW">Low</option>
          </select>

          {/* Sort By & Order Toggle */}
          <div className="flex items-center gap-1 sm:ml-auto">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-1.5 rounded-full bg-white/70 border border-[#0F777A]/15 text-[#07383D] font-medium focus:outline-none focus:border-[#0F777A] cursor-pointer"
            >
              <option value="deadline">Due date</option>
              <option value="created_at">Created date</option>
              <option value="importance">Importance</option>
              <option value="priority">Priority</option>
            </select>

            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="p-1.5 rounded-full bg-white/70 border border-[#0F777A]/15 text-[#07383D] hover:bg-white cursor-pointer"
              title={`Sort order: ${sortOrder === "asc" ? "Ascending" : "Descending"}`}
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
            </button>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-2.5 py-1 text-[13px] text-[#0F777A] hover:underline font-medium cursor-pointer"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* 3. ACTIVITY LIST OR EMPTY STATE */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#0F777A]/20 border-t-[#0F777A] animate-spin" />
          <span className="text-[14px] font-normal leading-[1.5] text-[#5B888B]">
            Loading activities...
          </span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-white/70 border border-red-200 text-center space-y-2 max-w-md mx-auto">
          <p className="text-[14px] font-semibold text-red-900">{error}</p>
          <button
            onClick={loadActivities}
            className="px-4 py-2 rounded-full text-[14px] font-medium leading-[1.4] text-white bg-[#0F777A] hover:bg-[#07383D] cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : activities.length === 0 ? (
        <div className="py-20 text-center max-w-sm mx-auto space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#8BCDCF]/20 border border-[#0F777A]/15 flex items-center justify-center mx-auto text-[#0F777A]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[16px] sm:text-[18px] font-semibold leading-[1.3] text-[#07383D]">
              {hasActiveFilters ? "No matching activities" : "No activities yet"}
            </h3>
            <p className="text-[14px] sm:text-[15px] font-normal leading-[1.55] text-[#5B888B]">
              {hasActiveFilters
                ? "Try adjusting your filters to see more results."
                : "Create an activity to start planning your day."}
            </p>
          </div>
          {hasActiveFilters ? (
            <button
              onClick={clearFilters}
              className="px-4 py-2 rounded-full text-[14px] font-medium leading-[1.4] text-[#0F777A] bg-white border border-[#0F777A]/20 hover:bg-[#8BCDCF]/15 transition-colors cursor-pointer"
            >
              Clear filters
            </button>
          ) : (
            <button
              onClick={() => setIsCreateOpen(true)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-[14px] font-medium leading-[1.4] bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add activity</span>
            </button>
          )}
        </div>
      ) : (
        /* INTERACTIVE ACTIVITY CARDS */
        <div className="space-y-2">
          {activities.map((act) => {
            const isCompleted = act.status === "COMPLETED";
            const isCancelled = act.status === "CANCELLED";
            const isOverdue = act.urgency === "OVERDUE" && !isCompleted && !isCancelled;
            const actType = act.activity_type || "Task";

            // Variant
            let cardVariant: "default" | "urgent" | "completed" = "default";
            if (isCompleted) cardVariant = "completed";
            else if (isOverdue) cardVariant = "urgent";

            // Construct secondary subtitle line
            const subtitleParts: string[] = [];
            if (act.total_subtasks > 0) {
              subtitleParts.push(`${act.completed_subtasks}/${act.total_subtasks} subtasks`);
            }
            if (act.reminders && act.reminders.length > 0) {
              subtitleParts.push(`${act.reminders.length} reminder${act.reminders.length > 1 ? "s" : ""}`);
            }
            if (act.followups && act.followups.length > 0) {
              subtitleParts.push(`${act.followups.length} follow-up${act.followups.length > 1 ? "s" : ""}`);
            }
            if (act.description) {
              subtitleParts.push(act.description);
            }
            const subtitleText = subtitleParts.length > 0 ? subtitleParts.join(" · ") : getImportanceLabel(act.importance);

            return (
              <InteractiveListCard
                key={act.id}
                variant={cardVariant}
                icon={<CheckSquare className="w-4 h-4" />}
                leadingAction={
                  <button
                    type="button"
                    onClick={(e) => handleQuickToggleComplete(e, act)}
                    title={isCompleted ? "Mark incomplete" : "Complete activity"}
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                      isCompleted
                        ? "bg-[#0F777A] border-[#0F777A] text-white"
                        : "border-[#0F777A]/30 bg-white hover:border-[#0F777A]"
                    }`}
                  >
                    {isCompleted && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                }
                title={act.title}
                subtitle={subtitleText}
                badges={
                  <>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#8BCDCF]/25 text-[#07383D]">
                      {actType}
                    </span>
                    {isCompleted && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#8BCDCF]/30 text-[#0F777A]">
                        Completed
                      </span>
                    )}
                    {isOverdue && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-800">
                        Overdue
                      </span>
                    )}
                    {act.urgency === "DUE_TODAY" && !isCompleted && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 text-amber-800">
                        Due today
                      </span>
                    )}
                    {act.priority_quadrant === "P1_CRITICAL" && !isCompleted && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-100 text-red-800">
                        Critical
                      </span>
                    )}
                  </>
                }
                trailingMeta={
                  <div className="flex items-center gap-1.5 text-[#5B888B]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDeadline(act.deadline)}</span>
                  </div>
                }
                onClick={() => handleOpenDetails(act)}
              />
            );
          })}
        </div>
      )}

      {/* ACTIVITY DETAILS MODAL */}
      {selectedActivity && (
        <ActivityDetailsModal
          activity={selectedActivity}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedActivity(null);
          }}
          onUpdated={loadActivities}
          onDeleted={loadActivities}
        />
      )}

      {/* CREATE ACTIVITY MODAL */}
      <CreateActivityModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreated={loadActivities}
      />
    </div>
  );
};
