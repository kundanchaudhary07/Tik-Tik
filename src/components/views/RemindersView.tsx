// src/components/views/RemindersView.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  Bell,
  Clock,
  CheckCircle2,
  Trash2,
  AlertCircle,
  Search,
  X,
  Plus,
} from "lucide-react";
import { Reminder } from "../../types/productivity";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";
import { InteractiveListCard } from "../common/InteractiveListCard";
import { ReminderDetailsModal } from "./ReminderDetailsModal";

export const RemindersView: React.FC = () => {
  const { showToast } = useToast();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const loadReminders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<Reminder[]>("/api/reminders");
      if (res.data) {
        setReminders(res.data);
      } else if (res.error) {
        setError(res.error.error?.message || "Unable to load reminders.");
      }
    } catch {
      setError("Unable to load reminders. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReminders();
  }, [loadReminders]);

  const handleOpenDetails = (r: Reminder) => {
    setSelectedReminder(r);
    setIsDetailsOpen(true);
  };

  const handleQuickDismiss = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      const res = await api.request(`/api/reminders/${id}/dismiss`, {
        method: "POST",
      });
      if (!res.error) {
        showToast("Reminder dismissed.", "success");
        loadReminders();
      } else {
        showToast(res.error.error?.message || "Dismiss failed.", "error");
      }
    } catch {
      showToast("Unable to dismiss reminder.", "error");
    }
  };

  const filtered = reminders.filter((r) => {
    const effective = r.effective_status || r.status;
    if (statusFilter !== "ALL" && r.status !== statusFilter && effective !== statusFilter) return false;
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchMsg = r.message?.toLowerCase().includes(term);
      const matchAct = r.activity_title?.toLowerCase().includes(term);
      return matchMsg || matchAct;
    }
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

  return (
    <div className="space-y-6">
      {/* 1. HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.015em] leading-[1.2] text-[#07383D]">
            Reminders
          </h1>
          <p className="text-[14px] font-normal leading-[1.5] text-[#5B888B] mt-0.5">
            Keep track of things you don't want to miss.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-[12px] sm:text-[13px]">
          {["ALL", "SCHEDULED", "DUE", "SNOOZED", "DISMISSED"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-full font-medium transition-all cursor-pointer ${
                statusFilter === s
                  ? "bg-[#8BCDCF]/30 text-[#07383D] border border-[#0F777A]/20"
                  : "bg-white/60 text-[#5B888B] border border-transparent hover:text-[#07383D] hover:bg-white"
              }`}
            >
              {s === "ALL" ? "All" : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* 2. SEARCH BAR */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#5B888B]">
          <Search className="w-4 h-4" />
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reminders..."
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

      {/* 3. CONTENT */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#0F777A]/20 border-t-[#0F777A] animate-spin" />
          <span className="text-[14px] font-normal leading-[1.5] text-[#5B888B]">
            Loading reminders...
          </span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-white/70 border border-red-200 text-center space-y-2 max-w-md mx-auto">
          <p className="text-[14px] font-semibold text-red-900">{error}</p>
          <button
            onClick={loadReminders}
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
              {statusFilter !== "ALL" || search ? "No matching reminders" : "No reminders scheduled"}
            </h3>
            <p className="text-[14px] sm:text-[15px] font-normal leading-[1.55] text-[#5B888B]">
              {statusFilter !== "ALL" || search
                ? "Try clearing your filters or search."
                : "Add a reminder when creating or editing an activity."}
            </p>
          </div>
        </div>
      ) : (
        /* REMINDERS LIST WITH INTERACTIVE CARDS */
        <div className="space-y-2">
          {filtered.map((rem) => {
            const isDismissed = rem.status === "DISMISSED";
            const isDue = rem.status === "DUE";
            const isSnoozed = rem.status === "SNOOZED";

            let variant: "default" | "warning" | "completed" = "default";
            if (isDismissed) variant = "completed";
            else if (isDue) variant = "warning";

            return (
              <InteractiveListCard
                key={rem.id}
                variant={variant}
                icon={<Bell className="w-4 h-4 text-[#0F777A]" />}
                title={rem.message || "Reminder"}
                subtitle={rem.activity_title ? `Activity: ${rem.activity_title}` : "Tik Tik Reminder"}
                badges={
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      isDue
                        ? "bg-amber-100 text-amber-900 border border-amber-200"
                        : isSnoozed
                        ? "bg-blue-100 text-blue-900 border border-blue-200"
                        : isDismissed
                        ? "bg-neutral-100 text-neutral-600"
                        : "bg-[#8BCDCF]/30 text-[#0F777A]"
                    }`}
                  >
                    {rem.status}
                  </span>
                }
                trailingMeta={
                  <div className="flex items-center gap-1.5 text-[#5B888B]">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatTime(rem.snooze_until || rem.remind_at)}</span>
                  </div>
                }
                trailingAction={
                  !isDismissed ? (
                    <button
                      type="button"
                      onClick={(e) => handleQuickDismiss(e, rem.id)}
                      className="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer hidden sm:inline-block"
                    >
                      Dismiss
                    </button>
                  ) : null
                }
                onClick={() => handleOpenDetails(rem)}
              />
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedReminder && (
        <ReminderDetailsModal
          reminder={selectedReminder}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedReminder(null);
          }}
          onUpdated={loadReminders}
          onDeleted={loadReminders}
        />
      )}
    </div>
  );
};
