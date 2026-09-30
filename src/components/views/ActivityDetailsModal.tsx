// src/components/views/ActivityDetailsModal.tsx
import React, { useState } from "react";
import {
  CheckSquare,
  CheckCircle2,
  Clock,
  Trash2,
  Bell,
  MessageSquare,
  AlertCircle,
  Plus,
  Check,
  Calendar,
  Layers,
  Repeat,
} from "lucide-react";
import { Activity } from "../../types/productivity";
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

interface ActivityDetailsModalProps {
  activity: Activity | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdated: () => void;
  onDeleted?: () => void;
}

function getImportanceLabel(level: number): string {
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
}

export const ActivityDetailsModal: React.FC<ActivityDetailsModalProps> = ({
  activity,
  isOpen,
  onClose,
  onUpdated,
  onDeleted,
}) => {
  const { showToast } = useToast();
  const [subtaskInput, setSubtaskInput] = useState("");
  const [reminderAt, setReminderAt] = useState("");
  const [reminderMsg, setReminderMsg] = useState("");
  const [showAddReminder, setShowAddReminder] = useState(false);

  const [followupAt, setFollowupAt] = useState("");
  const [followupNote, setFollowupNote] = useState("");
  const [showAddFollowup, setShowAddFollowup] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [showForceComplete, setShowForceComplete] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  if (!isOpen || !activity) return null;

  const totalSubtasks = activity.subtasks?.length || 0;
  const completedSubtasks = activity.subtasks?.filter((s) => s.is_completed).length || 0;
  const isCompleted = activity.status === "COMPLETED";

  const handleToggleSubtask = async (subtaskId: number, currentStatus: boolean) => {
    setActionError(null);
    try {
      const res = await api.request(`/api/subtasks/${subtaskId}`, {
        method: "PATCH",
        body: JSON.stringify({ is_completed: !currentStatus }),
      });
      if (!res.error) {
        showToast(currentStatus ? "Subtask marked incomplete" : "Subtask completed", "success");
        onUpdated();
      } else {
        setActionError(res.error.error?.message || "Failed to update subtask.");
      }
    } catch {
      setActionError("Unable to update subtask.");
    }
  };

  const handleAddSubtask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtaskInput.trim()) return;
    setActionError(null);
    try {
      const nextOrder = (activity.subtasks?.length || 0) + 1;
      const res = await api.request(`/api/activities/${activity.id}/subtasks`, {
        method: "POST",
        body: JSON.stringify({ title: subtaskInput.trim(), order: nextOrder }),
      });
      if (!res.error) {
        setSubtaskInput("");
        showToast("Subtask added", "success");
        onUpdated();
      } else {
        setActionError(res.error.error?.message || "Failed to add subtask.");
      }
    } catch {
      setActionError("Unable to add subtask.");
    }
  };

  const handleDeleteSubtask = async (subtaskId: number) => {
    try {
      const res = await api.request(`/api/subtasks/${subtaskId}`, { method: "DELETE" });
      if (!res.error) {
        showToast("Subtask removed", "success");
        onUpdated();
      }
    } catch {
      setActionError("Unable to remove subtask.");
    }
  };

  const handleCompleteActivity = async (force: boolean = false) => {
    setActionError(null);
    setShowForceComplete(false);
    setLoading(true);

    try {
      const url = force
        ? `/api/activities/${activity.id}?force=true`
        : `/api/activities/${activity.id}`;

      const res = await api.request(url, {
        method: "PATCH",
        body: JSON.stringify({ status: "COMPLETED", force, force_complete: force }),
      });

      if (!res.error) {
        showToast("Activity completed.", "success");
        onUpdated();
        onClose();
      } else {
        const errorMsg = res.error.error?.message || "Could not complete activity.";
        setActionError(errorMsg);
        if (res.status === 409 || res.status === 400 || errorMsg.toLowerCase().includes("subtask")) {
          setShowForceComplete(true);
        }
      }
    } catch {
      setActionError("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const handleReopenActivity = async () => {
    setLoading(true);
    try {
      const res = await api.request(`/api/activities/${activity.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "IN_PROGRESS" }),
      });
      if (!res.error) {
        showToast("Activity reopened.", "info");
        onUpdated();
        onClose();
      }
    } catch {
      showToast("Unable to reopen activity.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteActivity = async () => {
    setLoading(true);
    try {
      const res = await api.request(`/api/activities/${activity.id}`, {
        method: "DELETE",
      });
      if (!res.error) {
        showToast("Activity deleted.", "info");
        setDeleteConfirmOpen(false);
        if (onDeleted) onDeleted();
        else onUpdated();
        onClose();
      } else {
        showToast(res.error.error?.message || "Delete failed.", "error");
      }
    } catch {
      showToast("Unable to delete activity.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAddReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reminderAt) return;
    try {
      const res = await api.request(`/api/activities/${activity.id}/reminders`, {
        method: "POST",
        body: JSON.stringify({
          remind_at: new Date(reminderAt).toISOString(),
          message: reminderMsg.trim() || `Reminder for ${activity.title}`,
        }),
      });
      if (!res.error) {
        showToast("Reminder scheduled", "success");
        setShowAddReminder(false);
        setReminderAt("");
        setReminderMsg("");
        onUpdated();
      } else {
        setActionError(res.error.error?.message || "Failed to schedule reminder.");
      }
    } catch {
      setActionError("Unable to schedule reminder.");
    }
  };

  const handleAddFollowup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!followupAt || !followupNote.trim()) return;
    try {
      const res = await api.request(`/api/activities/${activity.id}/followups`, {
        method: "POST",
        body: JSON.stringify({
          scheduled_at: new Date(followupAt).toISOString(),
          note: followupNote.trim(),
        }),
      });
      if (!res.error) {
        showToast("Follow-up scheduled", "success");
        setShowAddFollowup(false);
        setFollowupAt("");
        setFollowupNote("");
        onUpdated();
      } else {
        setActionError(res.error.error?.message || "Failed to schedule follow-up.");
      }
    } catch {
      setActionError("Unable to schedule follow-up.");
    }
  };

  const formatDateTime = (iso: string | null) => {
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
    <>
      <DetailModal
        isOpen={isOpen}
        onClose={onClose}
        icon={<CheckSquare className="w-4 h-4" />}
        subtitle="Activity details"
        title={activity.title}
        identifier={`#${activity.id}`}
        badge={
          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
              isCompleted
                ? "bg-emerald-100 text-emerald-800"
                : activity.urgency === "OVERDUE"
                ? "bg-red-100 text-red-800"
                : "bg-[#8BCDCF]/25 text-[#07383D]"
            }`}
          >
            {activity.status}
          </span>
        }
        maxWidth="lg"
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
              {isCompleted ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleReopenActivity}
                  className="px-3.5 py-1.5 rounded-full text-[12px] font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Reopen
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleCompleteActivity(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-semibold bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Complete</span>
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
        {/* Error Callout */}
        {actionError && (
          <div className="p-3 rounded-xl bg-red-50 text-red-900 text-[12px] flex flex-col gap-2 border border-red-200">
            <div className="flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{actionError}</span>
            </div>
            {showForceComplete && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handleCompleteActivity(true)}
                  className="px-3 py-1 rounded-lg text-[11px] font-bold bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                >
                  Force complete with incomplete subtasks
                </button>
              </div>
            )}
          </div>
        )}

        {/* 1. Plan & Timing Section */}
        <DetailSection title="Plan & Details">
          <DetailGrid columns={2}>
            <DetailRow
              label="Due Date"
              value={formatDateTime(activity.deadline)}
              icon={<Clock className="w-3.5 h-3.5" />}
            />
            <DetailRow
              label="Type"
              value={activity.activity_type || "Task"}
              icon={<Layers className="w-3.5 h-3.5" />}
            />
            <DetailRow
              label="Importance"
              value={`${getImportanceLabel(activity.importance)} (${activity.importance}/5)`}
            />
            <DetailRow label="Urgency" value={activity.urgency.replace(/_/g, " ")} />
            <DetailRow
              label="Progress"
              value={`${completedSubtasks} / ${totalSubtasks} subtasks completed`}
            />
            {activity.activity_type === "Habit" && (
              <DetailRow
                label="Recurrence"
                value="Recurring Habit"
                icon={<Repeat className="w-3.5 h-3.5 text-[#0F777A]" />}
              />
            )}
          </DetailGrid>
        </DetailSection>

        {/* 2. Notes / Description (if provided) */}
        {activity.description && (
          <DetailSection title="Notes">
            <DetailCard>
              <p className="whitespace-pre-wrap">{activity.description}</p>
            </DetailCard>
          </DetailSection>
        )}

        {/* 3. Subtasks Checklist */}
        <DetailSection
          title={`Subtasks (${completedSubtasks}/${totalSubtasks})`}
          action={
            <span className="text-[11px] text-[#5B888B]">
              {totalSubtasks > 0
                ? `${Math.round((completedSubtasks / totalSubtasks) * 100)}%`
                : "0%"}
            </span>
          }
        >
          <div className="space-y-1.5">
            {activity.subtasks && activity.subtasks.length > 0 ? (
              activity.subtasks.map((subtask) => (
                <div
                  key={subtask.id}
                  className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-200/60 hover:bg-slate-100/70 transition-colors group"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleSubtask(subtask.id, subtask.is_completed)}
                    className="flex items-center gap-2.5 text-left flex-1 min-w-0 cursor-pointer"
                  >
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        subtask.is_completed
                          ? "bg-[#0F777A] border-[#0F777A] text-white"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {subtask.is_completed && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span
                      className={`text-[13px] truncate ${
                        subtask.is_completed ? "line-through text-slate-400" : "text-[#07383D]"
                      }`}
                    >
                      {subtask.title}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteSubtask(subtask.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 transition-opacity cursor-pointer shrink-0"
                    title="Remove subtask"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            ) : (
              <span className="text-[12px] text-[#5B888B] block py-1">No subtasks yet.</span>
            )}

            {/* Add subtask inline input */}
            <form onSubmit={handleAddSubtask} className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                placeholder="Add a new subtask..."
                className="flex-1 px-3 py-1.5 text-[12px] rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#0F777A] focus:border-[#0F777A]"
              />
              <button
                type="submit"
                disabled={!subtaskInput.trim()}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer disabled:opacity-50"
              >
                Add
              </button>
            </form>
          </div>
        </DetailSection>

        {/* 4. Reminders & Follow-ups */}
        <DetailSection
          title="Reminders"
          action={
            !showAddReminder ? (
              <button
                type="button"
                onClick={() => setShowAddReminder(true)}
                className="text-[11px] font-medium text-[#0F777A] hover:underline cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Schedule reminder</span>
              </button>
            ) : null
          }
        >
          {showAddReminder && (
            <form
              onSubmit={handleAddReminder}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 mb-2 space-y-2 text-[12px]"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#07383D]">Schedule a Reminder</span>
                <button
                  type="button"
                  onClick={() => setShowAddReminder(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>
              <input
                type="datetime-local"
                required
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              />
              <input
                type="text"
                placeholder="Reminder message (optional)"
                value={reminderMsg}
                onChange={(e) => setReminderMsg(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[#0F777A] text-white hover:bg-[#07383D] cursor-pointer"
              >
                Save Reminder
              </button>
            </form>
          )}

          {activity.reminders && activity.reminders.length > 0 ? (
            <div className="space-y-1">
              {activity.reminders.map((r) => (
                <div
                  key={r.id}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-between text-[12px]"
                >
                  <span className="text-[#07383D] truncate">{r.message || "Reminder"}</span>
                  <span className="text-[#5B888B] text-[11px] shrink-0">
                    {formatDateTime(r.remind_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-[#5B888B] block">No reminders set.</span>
          )}
        </DetailSection>

        {/* 5. Follow-ups */}
        <DetailSection
          title="Follow-ups"
          action={
            !showAddFollowup ? (
              <button
                type="button"
                onClick={() => setShowAddFollowup(true)}
                className="text-[11px] font-medium text-[#0F777A] hover:underline cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add follow-up</span>
              </button>
            ) : null
          }
        >
          {showAddFollowup && (
            <form
              onSubmit={handleAddFollowup}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 mb-2 space-y-2 text-[12px]"
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#07383D]">Schedule Follow-up</span>
                <button
                  type="button"
                  onClick={() => setShowAddFollowup(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>
              <input
                type="datetime-local"
                required
                value={followupAt}
                onChange={(e) => setFollowupAt(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              />
              <input
                type="text"
                required
                placeholder="What to follow up on..."
                value={followupNote}
                onChange={(e) => setFollowupNote(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white"
              />
              <button
                type="submit"
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold bg-[#0F777A] text-white hover:bg-[#07383D] cursor-pointer"
              >
                Save Follow-up
              </button>
            </form>
          )}

          {activity.followups && activity.followups.length > 0 ? (
            <div className="space-y-1">
              {activity.followups.map((f) => (
                <div
                  key={f.id}
                  className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/60 flex items-center justify-between text-[12px]"
                >
                  <span className="text-[#07383D] truncate">{f.note}</span>
                  <span className="text-[#5B888B] text-[11px] shrink-0">
                    {formatDateTime(f.scheduled_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[12px] text-[#5B888B] block">No follow-ups scheduled.</span>
          )}
        </DetailSection>
      </DetailModal>

      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        title="Delete Activity"
        message="Are you sure you want to delete this activity? This will remove all associated subtasks and reminders."
        confirmLabel="Delete"
        isDestructive={true}
        onConfirm={handleDeleteActivity}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </>
  );
};
