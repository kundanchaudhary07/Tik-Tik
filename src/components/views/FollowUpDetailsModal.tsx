// src/components/views/FollowUpDetailsModal.tsx
import React, { useState } from "react";
import {
  MessageSquare,
  Calendar,
  CheckCircle2,
  Trash2,
  ExternalLink,
  Clock,
  Check,
} from "lucide-react";
import { FollowUp } from "../../types/productivity";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";
import { ConfirmDialog } from "../common/ConfirmDialog";
import {
  DetailModal,
  DetailSection,
  DetailGrid,
  DetailRow,
  DetailCard,
} from "../common/DetailModal";

interface FollowUpDetailsModalProps {
  followup: FollowUp | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
  onOpenActivity?: (activityId: number) => void;
}

export const FollowUpDetailsModal: React.FC<FollowUpDetailsModalProps> = ({
  followup,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
  onOpenActivity,
}) => {
  const { showToast } = useToast();
  const [outcomeInput, setOutcomeInput] = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !followup) return null;

  const handleComplete = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await api.request(`/api/followups/${followup.id}/complete`, {
        method: "POST",
        body: JSON.stringify({ outcome: outcomeInput.trim() || "Completed" }),
      });
      if (!res.error) {
        showToast("Follow-up completed.", "success");
        onUpdated();
        onClose();
      } else {
        showToast(res.error.error?.message || "Failed to complete follow-up.", "error");
      }
    } catch {
      showToast("Unable to complete follow-up.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    setLoading(true);
    try {
      const res = await api.request(`/api/followups/${followup.id}/cancel`, {
        method: "POST",
      });
      if (!res.error) {
        showToast("Follow-up marked as cancelled.", "info");
        onUpdated();
        onClose();
      } else {
        showToast(res.error.error?.message || "Failed to cancel follow-up.", "error");
      }
    } catch {
      showToast("Unable to cancel follow-up.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await api.request(`/api/followups/${followup.id}`, {
        method: "DELETE",
      });
      if (!res.error) {
        showToast("Follow-up deleted.", "info");
        setDeleteConfirmOpen(false);
        if (onDeleted) onDeleted();
        else onUpdated();
        onClose();
      } else {
        showToast(res.error.error?.message || "Failed to delete follow-up.", "error");
      }
    } catch {
      showToast("Unable to delete follow-up.", "error");
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (iso: string | null) => {
    if (!iso) return "None";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const isCompleted = followup.status === "COMPLETED";
  const isCancelled = followup.status === "CANCELLED";
  const isPending = followup.status === "PENDING";
  const isPastDue = isPending && new Date(followup.scheduled_at).getTime() < Date.now();

  return (
    <>
      <DetailModal
        isOpen={isOpen}
        onClose={onClose}
        icon={<MessageSquare className="w-4 h-4" />}
        subtitle="Follow-up details"
        title={followup.note || "Follow-up"}
        identifier={`#${followup.id}`}
        badge={
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              isCompleted
                ? "bg-emerald-100 text-emerald-800"
                : isPastDue
                ? "bg-amber-100 text-amber-900 border border-amber-200"
                : isCancelled
                ? "bg-slate-100 text-slate-600 border border-slate-200"
                : "bg-blue-100 text-blue-900 border border-blue-200"
            }`}
          >
            {followup.status}
          </span>
        }
        maxWidth="md"
        footer={
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>

            <div className="flex items-center gap-2">
              {isPending && !isCompleting && (
                <>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={handleCancel}
                    className="px-3.5 py-1.5 rounded-full text-[12px] font-medium border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel Follow-up
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => setIsCompleting(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-semibold bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Complete</span>
                  </button>
                </>
              )}

              {(!isPending || isCompleting) && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Close
                </button>
              )}
            </div>
          </div>
        }
      >
        <DetailSection title="Schedule & Timing">
          <DetailGrid columns={2}>
            <DetailRow
              label="Scheduled Date"
              value={formatDateTime(followup.scheduled_at)}
              icon={<Calendar className="w-3.5 h-3.5" />}
            />
            <DetailRow label="Status" value={followup.status} />
            <DetailRow
              label="Created"
              value={formatDateTime(followup.created_at)}
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            {followup.completed_at && (
              <DetailRow
                label="Completed At"
                value={formatDateTime(followup.completed_at)}
              />
            )}
          </DetailGrid>
        </DetailSection>

        {/* Associated Activity */}
        {followup.activity_title && (
          <DetailSection title="Related Activity">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-[#07383D] truncate">
                {followup.activity_title}
              </span>
              {onOpenActivity && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenActivity(followup.activity_id);
                  }}
                  className="text-[12px] font-medium text-[#0F777A] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <span>View activity</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
          </DetailSection>
        )}

        {/* Outcome */}
        {followup.outcome && (
          <DetailSection title="Recorded Outcome">
            <DetailCard variant="highlight">
              <p className="font-medium">{followup.outcome}</p>
            </DetailCard>
          </DetailSection>
        )}

        {/* Inline Completion Form */}
        {isPending && isCompleting && (
          <form
            onSubmit={handleComplete}
            className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-[12px]"
          >
            <label className="font-semibold text-[#07383D] block">
              Record Outcome (optional):
            </label>
            <input
              type="text"
              autoFocus
              value={outcomeInput}
              onChange={(e) => setOutcomeInput(e.target.value)}
              placeholder="What was the result or decision?"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F777A]"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCompleting(false)}
                className="px-3 py-1 rounded-lg text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-3.5 py-1 rounded-lg font-semibold bg-[#0F777A] text-white hover:bg-[#07383D] cursor-pointer"
              >
                Confirm Completion
              </button>
            </div>
          </form>
        )}
      </DetailModal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Follow-up"
        message="Are you sure you want to delete this follow-up? This cannot be undone."
        confirmLabel="Delete"
        isDestructive={true}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
};
