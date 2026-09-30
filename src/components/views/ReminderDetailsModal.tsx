// src/components/views/ReminderDetailsModal.tsx
import React, { useState } from "react";
import {
  Bell,
  Clock,
  Calendar,
  Trash2,
  ExternalLink,
  CheckCircle2,
} from "lucide-react";
import { Reminder } from "../../types/productivity";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";
import { ConfirmDialog } from "../common/ConfirmDialog";
import {
  DetailModal,
  DetailSection,
  DetailGrid,
  DetailRow,
} from "../common/DetailModal";

interface ReminderDetailsModalProps {
  reminder: Reminder | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
  onOpenActivity?: (activityId: number) => void;
}

export const ReminderDetailsModal: React.FC<ReminderDetailsModalProps> = ({
  reminder,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
  onOpenActivity,
}) => {
  const { showToast } = useToast();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!isOpen || !reminder) return null;

  const handleSnooze = async (minutes: number) => {
    setLoading(true);
    try {
      const res = await api.request(`/api/reminders/${reminder.id}/snooze`, {
        method: "POST",
        body: JSON.stringify({ minutes }),
      });
      if (!res.error) {
        showToast(
          minutes >= 60
            ? `Reminder snoozed for ${Math.round(minutes / 60)} hour(s).`
            : `Reminder snoozed for ${minutes} minutes.`,
          "info"
        );
        onUpdated();
        onClose();
      } else {
        showToast(res.error.error?.message || "Failed to snooze reminder.", "error");
      }
    } catch {
      showToast("Unable to snooze reminder.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = async () => {
    setLoading(true);
    try {
      const res = await api.request(`/api/reminders/${reminder.id}/dismiss`, {
        method: "POST",
      });
      if (!res.error) {
        showToast("Reminder dismissed.", "success");
        onUpdated();
        onClose();
      } else {
        showToast(res.error.error?.message || "Failed to dismiss reminder.", "error");
      }
    } catch {
      showToast("Unable to dismiss reminder.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await api.request(`/api/reminders/${reminder.id}`, {
        method: "DELETE",
      });
      if (!res.error) {
        showToast("Reminder deleted.", "info");
        setDeleteConfirmOpen(false);
        if (onDeleted) onDeleted();
        else onUpdated();
        onClose();
      } else {
        showToast(res.error.error?.message || "Failed to delete reminder.", "error");
      }
    } catch {
      showToast("Unable to delete reminder.", "error");
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

  const isDismissed = reminder.status === "DISMISSED";
  const isDue = reminder.status === "DUE";
  const isSnoozed = reminder.status === "SNOOZED";

  return (
    <>
      <DetailModal
        isOpen={isOpen}
        onClose={onClose}
        icon={<Bell className="w-4 h-4" />}
        subtitle="Reminder details"
        title={reminder.message || "Reminder"}
        identifier={`#${reminder.id}`}
        badge={
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              isDue
                ? "bg-amber-100 text-amber-900 border border-amber-200"
                : isSnoozed
                ? "bg-blue-100 text-blue-900 border border-blue-200"
                : isDismissed
                ? "bg-slate-100 text-slate-600 border border-slate-200"
                : "bg-[#8BCDCF]/30 text-[#0F777A] border border-[#0F777A]/20"
            }`}
          >
            {reminder.status}
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
              {!isDismissed && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleDismiss}
                  className="px-4 py-1.5 rounded-full text-[12px] font-semibold bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer"
                >
                  Dismiss
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        }
      >
        <DetailSection title="Schedule & Status">
          <DetailGrid columns={2}>
            <DetailRow
              label="Reminder Time"
              value={formatDateTime(reminder.remind_at)}
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            <DetailRow label="Status" value={reminder.status} />
            <DetailRow
              label="Delivery Channel"
              value={reminder.channel || "In-app notification"}
            />
            <DetailRow
              label="Created"
              value={formatDateTime(reminder.created_at)}
              icon={<Calendar className="w-3.5 h-3.5" />}
            />
            {reminder.snooze_until && (
              <DetailRow
                label="Snooze Until"
                value={formatDateTime(reminder.snooze_until)}
                fullWidth={true}
              />
            )}
            {reminder.dismissed_at && (
              <DetailRow
                label="Dismissed At"
                value={formatDateTime(reminder.dismissed_at)}
                fullWidth={true}
              />
            )}
          </DetailGrid>
        </DetailSection>

        {/* Associated Activity */}
        {reminder.activity_title && (
          <DetailSection title="Related Activity">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
              <span className="text-[13px] font-semibold text-[#07383D] truncate">
                {reminder.activity_title}
              </span>
              {onOpenActivity && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenActivity(reminder.activity_id);
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

        {/* Quick Snooze Actions */}
        {!isDismissed && (
          <DetailSection title="Quick Snooze">
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSnooze(15)}
                className="px-3 py-1 rounded-full text-[12px] font-medium bg-white border border-[#0F777A]/25 text-[#07383D] hover:bg-[#8BCDCF]/20 cursor-pointer transition-colors"
              >
                +15 minutes
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSnooze(60)}
                className="px-3 py-1 rounded-full text-[12px] font-medium bg-white border border-[#0F777A]/25 text-[#07383D] hover:bg-[#8BCDCF]/20 cursor-pointer transition-colors"
              >
                +1 hour
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => handleSnooze(1440)}
                className="px-3 py-1 rounded-full text-[12px] font-medium bg-white border border-[#0F777A]/25 text-[#07383D] hover:bg-[#8BCDCF]/20 cursor-pointer transition-colors"
              >
                +1 day
              </button>
            </div>
          </DetailSection>
        )}
      </DetailModal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Reminder"
        message="Are you sure you want to delete this reminder? This action cannot be undone."
        confirmLabel="Delete"
        isDestructive={true}
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
};
