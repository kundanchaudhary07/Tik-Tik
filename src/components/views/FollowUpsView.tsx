// src/components/views/FollowUpsView.tsx
import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Clock,
  RotateCw,
  XCircle,
  Trash2,
} from "lucide-react";
import { FollowUp } from "../../types/productivity";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";
import { InteractiveListCard } from "../common/InteractiveListCard";
import { FollowUpDetailsModal } from "./FollowUpDetailsModal";

export const FollowUpsView: React.FC = () => {
  const { showToast } = useToast();
  const [followups, setFollowups] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [selectedFollowup, setSelectedFollowup] = useState<FollowUp | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const loadFollowups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.request<FollowUp[]>("/api/followups");
      if (res.data) {
        setFollowups(res.data);
      } else if (res.error) {
        setError(res.error.error?.message || "Unable to load follow-ups.");
      }
    } catch {
      setError("Unable to load follow-ups. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFollowups();
  }, [loadFollowups]);

  const handleOpenDetails = (fu: FollowUp) => {
    setSelectedFollowup(fu);
    setIsDetailsOpen(true);
  };

  const handleQuickComplete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try {
      const res = await api.request(`/api/followups/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ outcome: "Completed" }),
      });
      if (!res.error) {
        showToast("Follow-up completed.", "success");
        loadFollowups();
      } else {
        showToast(res.error.error?.message || "Unable to complete follow-up.", "error");
      }
    } catch {
      showToast("Unable to complete follow-up.", "error");
    }
  };

  const filtered = followups.filter((f) => {
    if (statusFilter === "ALL") return true;
    return f.status === statusFilter;
  });

  const formatDate = (iso: string) => {
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
            Follow-ups
          </h1>
          <p className="text-[14px] font-normal leading-[1.5] text-[#5B888B] mt-0.5">
            Remember what needs your attention later.
          </p>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 text-[12px] sm:text-[13px]">
          {["ALL", "PENDING", "COMPLETED", "CANCELLED"].map((s) => (
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

      {/* 2. CONTENT */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#0F777A]/20 border-t-[#0F777A] animate-spin" />
          <span className="text-[14px] font-normal leading-[1.5] text-[#5B888B]">
            Loading follow-ups...
          </span>
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-white/70 border border-red-200 text-center space-y-2 max-w-md mx-auto">
          <p className="text-[14px] font-semibold text-red-900">{error}</p>
          <button
            onClick={loadFollowups}
            className="px-4 py-2 rounded-full text-[14px] font-medium leading-[1.4] text-white bg-[#0F777A] hover:bg-[#07383D] cursor-pointer"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center max-w-sm mx-auto space-y-3">
          <div className="w-12 h-12 rounded-full bg-[#8BCDCF]/20 border border-[#0F777A]/15 flex items-center justify-center mx-auto text-[#0F777A]">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-[16px] sm:text-[18px] font-semibold leading-[1.3] text-[#07383D]">
              {statusFilter !== "ALL" ? "No matching follow-ups" : "No follow-ups yet"}
            </h3>
            <p className="text-[14px] sm:text-[15px] font-normal leading-[1.55] text-[#5B888B]">
              {statusFilter !== "ALL"
                ? "Try selecting 'All' to view all follow-ups."
                : "Schedule a follow-up on an activity to stay on track."}
            </p>
          </div>
        </div>
      ) : (
        /* INTERACTIVE FOLLOW-UP CARDS */
        <div className="space-y-2">
          {filtered.map((fu) => {
            const isCompleted = fu.status === "COMPLETED";
            const isCancelled = fu.status === "CANCELLED";
            const isPending = fu.status === "PENDING";
            const isPastDue = isPending && new Date(fu.scheduled_at).getTime() < Date.now();

            let variant: "default" | "warning" | "completed" = "default";
            if (isCompleted) variant = "completed";
            else if (isPastDue) variant = "warning";

            const subtitle = fu.activity_title
              ? `Activity: ${fu.activity_title}${fu.outcome ? ` · Outcome: ${fu.outcome}` : ""}`
              : fu.outcome
              ? `Outcome: ${fu.outcome}`
              : "Tik Tik Follow-up";

            return (
              <InteractiveListCard
                key={fu.id}
                variant={variant}
                icon={<MessageSquare className="w-4 h-4 text-[#0F777A]" />}
                title={fu.note || "Follow-up note"}
                subtitle={subtitle}
                badges={
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      isCompleted
                        ? "bg-[#8BCDCF]/30 text-[#0F777A]"
                        : isPastDue
                        ? "bg-amber-100 text-amber-900 border border-amber-200"
                        : isCancelled
                        ? "bg-neutral-100 text-neutral-600"
                        : "bg-blue-100 text-blue-900"
                    }`}
                  >
                    {fu.status}
                  </span>
                }
                trailingMeta={
                  <div className="flex items-center gap-1.5 text-[#5B888B]">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{formatDate(fu.scheduled_at)}</span>
                  </div>
                }
                trailingAction={
                  isPending ? (
                    <button
                      type="button"
                      onClick={(e) => handleQuickComplete(e, fu.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer hidden sm:inline-flex"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Complete</span>
                    </button>
                  ) : null
                }
                onClick={() => handleOpenDetails(fu)}
              />
            );
          })}
        </div>
      )}

      {/* DETAIL MODAL */}
      {selectedFollowup && (
        <FollowUpDetailsModal
          followup={selectedFollowup}
          isOpen={isDetailsOpen}
          onClose={() => {
            setIsDetailsOpen(false);
            setSelectedFollowup(null);
          }}
          onUpdated={loadFollowups}
          onDeleted={loadFollowups}
        />
      )}
    </div>
  );
};
