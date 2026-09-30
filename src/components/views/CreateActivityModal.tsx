// src/components/views/CreateActivityModal.tsx
import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Plus,
  Trash2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ListTodo,
  Bell,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { api } from "../../services/api";
import { useToast } from "../common/Toast";
import { useAuth } from "../../context/AuthContext";

interface CreateActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const OCCUPATION_SUGGESTIONS: Record<string, Array<{ title: string; type: string }>> = {
  Student: [
    { title: "Assignment", type: "Task" },
    { title: "Exam", type: "Deadline" },
    { title: "Study session", type: "Task" },
    { title: "Project", type: "Task" },
    { title: "Class", type: "Event" },
    { title: "Revision", type: "Task" },
  ],
  Employee: [
    { title: "Work task", type: "Task" },
    { title: "Meeting", type: "Event" },
    { title: "Report", type: "Task" },
    { title: "Review", type: "Task" },
    { title: "Deadline", type: "Deadline" },
    { title: "Follow-up", type: "Follow-up" },
  ],
  "Business owner": [
    { title: "Client follow-up", type: "Follow-up" },
    { title: "Invoice", type: "Task" },
    { title: "Payment", type: "Deadline" },
    { title: "Order", type: "Task" },
    { title: "Meeting", type: "Event" },
    { title: "Supplier follow-up", type: "Follow-up" },
  ],
  Professional: [
    { title: "Project task", type: "Task" },
    { title: "Meeting", type: "Event" },
    { title: "Research", type: "Task" },
    { title: "Review", type: "Task" },
    { title: "Appointment", type: "Event" },
    { title: "Deadline", type: "Deadline" },
  ],
  Other: [
    { title: "Task", type: "Task" },
    { title: "Meeting", type: "Event" },
    { title: "Follow-up", type: "Follow-up" },
    { title: "Review", type: "Task" },
  ],
};

export const CreateActivityModal: React.FC<CreateActivityModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  // 1. Core Fields
  const [activityType, setActivityType] = useState<string>("Task");
  const [habitFrequency, setHabitFrequency] = useState<"DAILY" | "WEEKDAYS" | "MWF" | "WEEKLY">("DAILY");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [importance, setImportance] = useState<number>(3); // 2: Low, 3: Normal, 4: Important, 5: Critical
  const [estimatedTime, setEstimatedTime] = useState<string>("30 minutes");
  const [customTime, setCustomTime] = useState<string>("");

  // 2. Due Date & Time
  const [dueDate, setDueDate] = useState<string>("");
  const [dueTime, setDueTime] = useState<string>("17:00");

  // 3. Collapsible Sections
  const [subtasksOpen, setSubtasksOpen] = useState(false);
  const [subtasks, setSubtasks] = useState<string[]>([]);
  const [newSubtaskInput, setNewSubtaskInput] = useState("");

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderOption, setReminderOption] = useState<string>("30m_before");
  const [reminderNote, setReminderNote] = useState<string>("");

  const [followupOpen, setFollowupOpen] = useState(false);
  const [enableFollowup, setEnableFollowup] = useState(false);
  const [followupDate, setFollowupDate] = useState<string>("");
  const [followupTime, setFollowupTime] = useState<string>("10:00");
  const [followupNote, setFollowupNote] = useState<string>("");

  // Validation & Loading
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // User Occupation
  const occupation = user?.preferences?.occupation || "Other";
  const suggestions = OCCUPATION_SUGGESTIONS[occupation] || OCCUPATION_SUGGESTIONS.Other;

  // Helper date formatter
  function toLocalDateString(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // Initialize dates when opened & lock background scroll
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          onClose();
        }
      };
      window.addEventListener("keydown", handleKeyDown);

      const now = new Date();
      setDueDate(toLocalDateString(now));

      const future = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      setFollowupDate(toLocalDateString(future));

      // Reset form states
      setActivityType("Task");
      setHabitFrequency("DAILY");
      setTitle("");
      setDescription("");
      setImportance(3);
      setEstimatedTime("30 minutes");
      setCustomTime("");
      setDueTime("17:00");
      setSubtasks([]);
      setNewSubtaskInput("");
      setSubtasksOpen(false);
      setReminderOption("30m_before");
      setReminderNote("");
      setReminderOpen(false);
      setEnableFollowup(false);
      setFollowupNote("");
      setFollowupOpen(false);
      setErrorMessage(null);

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Subtask helpers
  const handleAddSubtask = () => {
    if (newSubtaskInput.trim()) {
      setSubtasks([...subtasks, newSubtaskInput.trim()]);
      setNewSubtaskInput("");
    }
  };

  const handleRemoveSubtask = (index: number) => {
    setSubtasks(subtasks.filter((_, i) => i !== index));
  };

  // Deadline calculation
  const getFullDeadline = (): string | null => {
    if (!dueDate) return null;
    const timePart = dueTime || "17:00";
    try {
      const combined = new Date(`${dueDate}T${timePart}:00`);
      if (isNaN(combined.getTime())) return null;
      return combined.toISOString();
    } catch {
      return null;
    }
  };

  // Reminder calculation
  const getReminderTimestamp = (): string | null => {
    if (reminderOption === "none" || reminderOption === "adaptive") return null;

    const deadlineIso = getFullDeadline();
    if (!deadlineIso) return null;
    const deadlineTime = new Date(deadlineIso).getTime();

    let offsetMinutes = 30;
    if (reminderOption === "5m_before") offsetMinutes = 5;
    else if (reminderOption === "15m_before") offsetMinutes = 15;
    else if (reminderOption === "30m_before") offsetMinutes = 30;
    else if (reminderOption === "1h_before") offsetMinutes = 60;
    else if (reminderOption === "3h_before") offsetMinutes = 180;
    else if (reminderOption === "1d_before") offsetMinutes = 1440;

    const remindAtTime = deadlineTime - offsetMinutes * 60 * 1000;
    return new Date(remindAtTime).toISOString();
  };

  // Follow-up calculation
  const getFollowupTimestamp = (): string | null => {
    if (!enableFollowup || !followupDate) return null;
    try {
      const d = new Date(`${followupDate}T${followupTime || "10:00"}:00`);
      return isNaN(d.getTime()) ? null : d.toISOString();
    } catch {
      return null;
    }
  };

  // Form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage("Activity title is required.");
      return;
    }

    const deadlineIso = getFullDeadline();

    if (reminderOption !== "none" && reminderOption !== "adaptive" && !deadlineIso) {
      setErrorMessage("Please select a due date before setting a reminder.");
      return;
    }

    if (enableFollowup && !followupDate) {
      setErrorMessage("Please select a date for your follow-up.");
      return;
    }

    setLoading(true);
    try {
      const finalEstimatedTime =
        estimatedTime === "Custom"
          ? customTime.trim() || null
          : estimatedTime !== "none"
          ? estimatedTime
          : null;

      const payload: any = {
        title: title.trim(),
        description: description.trim() || null,
        importance,
        deadline: deadlineIso,
        activity_type: activityType,
        estimated_time: finalEstimatedTime,
        is_adaptive_reminder: reminderOption === "adaptive",
      };

      if (activityType === "Habit") {
        if (habitFrequency === "MWF") {
          payload.recurrence = { frequency: "CUSTOM_DAYS", days_of_week: [1, 3, 5] };
        } else {
          payload.recurrence = { frequency: habitFrequency };
        }
      }

      const res = await api.request<any>("/api/activities", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (res.data?.id) {
        const activityId = res.data.id;

        // Subtasks
        for (let i = 0; i < subtasks.length; i++) {
          await api.request(`/api/activities/${activityId}/subtasks`, {
            method: "POST",
            body: JSON.stringify({ title: subtasks[i], order: i + 1 }),
          });
        }

        // Reminder
        if (reminderOption !== "none" && reminderOption !== "adaptive") {
          const reminderIso = getReminderTimestamp();
          if (reminderIso) {
            const finalReminderMsg = reminderNote.trim() || `Reminder: ${title.trim()}`;
            await api.request(`/api/activities/${activityId}/reminders`, {
              method: "POST",
              body: JSON.stringify({
                remind_at: reminderIso,
                message: finalReminderMsg,
              }),
            });
          }
        }

        // Follow-up
        if (enableFollowup) {
          const followupIso = getFollowupTimestamp();
          if (followupIso) {
            await api.request(`/api/activities/${activityId}/followups`, {
              method: "POST",
              body: JSON.stringify({
                scheduled_at: followupIso,
                note: followupNote.trim() || "Follow-up",
              }),
            });
          }
        }

        showToast("Activity added.", "success");
        onCreated();
        onClose();
      } else {
        setErrorMessage(
          res.error?.error?.message || "Please complete the required fields."
        );
      }
    } catch {
      setErrorMessage("Unable to save activity. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Section summary labels
  const getSubtasksSummary = () => {
    if (subtasks.length === 0) return "Optional";
    if (subtasks.length === 1) return "1 step";
    return `${subtasks.length} steps`;
  };

  const getReminderSummary = () => {
    switch (reminderOption) {
      case "adaptive":
        return "Adaptive";
      case "5m_before":
        return "5 minutes before";
      case "15m_before":
        return "15 minutes before";
      case "30m_before":
        return "30 minutes before";
      case "1h_before":
        return "1 hour before";
      case "3h_before":
        return "3 hours before";
      case "1d_before":
        return "1 day before";
      default:
        return "No reminder";
    }
  };

  const getFollowupSummary = () => {
    if (!enableFollowup) return "Not set";
    return followupDate ? followupDate : "Enabled";
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#07383D]/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Main Form Card */}
      <div className="relative w-full max-w-lg bg-white border border-[#0F777A]/20 rounded-2xl shadow-xl z-10 flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#0F777A]/10 bg-white shrink-0">
          <h2 id="modal-title" className="text-[18px] sm:text-[20px] font-semibold text-[#07383D] tracking-tight">
            Add activity
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#5B888B] hover:text-[#07383D] hover:bg-[#8BCDCF]/15 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Validation error display */}
        {errorMessage && (
          <div className="mx-6 mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-[14px] font-normal leading-[1.5] flex items-center gap-2 shrink-0">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form Body - Scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {/* 1. What are you adding? */}
            <div>
              <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D] mb-1.5">
                What are you adding?
              </label>
              <select
                value={activityType}
                onChange={(e) => setActivityType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] focus:outline-none focus:border-[#0F777A] focus:ring-1 focus:ring-[#0F777A] transition-colors cursor-pointer"
              >
                <option value="Task">Task</option>
                <option value="Event">Event</option>
                <option value="Deadline">Deadline</option>
                <option value="Reminder">Reminder</option>
                <option value="Habit">Habit</option>
                <option value="Follow-up">Follow-up</option>
                <option value="Custom Activity">Custom Activity</option>
              </select>
            </div>

            {/* Habit Recurrence Frequency (only when Habit is chosen) */}
            {activityType === "Habit" && (
              <div className="p-3 rounded-lg bg-[#F0F9F9] border border-[#0F777A]/15 space-y-2">
                <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D]">
                  Habit repeat frequency
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                  {[
                    { id: "DAILY", label: "Every day" },
                    { id: "WEEKDAYS", label: "Weekdays" },
                    { id: "MWF", label: "Mon, Wed, Fri" },
                    { id: "WEEKLY", label: "Weekly" },
                  ].map((freq) => (
                    <button
                      key={freq.id}
                      type="button"
                      onClick={() => setHabitFrequency(freq.id as any)}
                      className={`px-2.5 py-1.5 rounded-md text-[13px] font-medium leading-[1.4] transition-colors cursor-pointer text-center ${
                        habitFrequency === freq.id
                          ? "bg-[#0F777A] text-white"
                          : "bg-white text-[#07383D] border border-[#0F777A]/20 hover:bg-[#DDF2F2]"
                      }`}
                    >
                      {freq.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 2. What do you need to do? */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D]">
                  What do you need to do?
                </label>
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Activity title"
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] placeholder:text-[#5B888B]/60 focus:outline-none focus:border-[#0F777A] focus:ring-1 focus:ring-[#0F777A] transition-colors"
                autoFocus
              />

              {/* Quick suggestions based on occupation preference */}
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <span className="text-[12px] uppercase font-medium tracking-[0.06em] text-[#5B888B] mr-0.5">
                  Quick add:
                </span>
                {suggestions.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTitle(item.title);
                      setActivityType(item.type);
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[13px] font-medium leading-[1.4] bg-[#E4F5F5] hover:bg-[#DDF2F2] text-[#0F777A] border border-[#0F777A]/20 transition-colors cursor-pointer"
                  >
                    {item.title}
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Add some details */}
            <div>
              <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D] mb-1.5">
                Add some details
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional details"
                rows={2}
                className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] placeholder:text-[#5B888B]/60 focus:outline-none focus:border-[#0F777A] focus:ring-1 focus:ring-[#0F777A] transition-colors resize-none"
              />
            </div>

            {/* 4. Schedule Section */}
            <div className="pt-2 border-t border-[#0F777A]/10 space-y-3">
              <span className="text-[12px] font-medium text-[#5B888B] uppercase tracking-[0.06em] block">
                Schedule
              </span>

              {/* Due Date & Time */}
              <div>
                <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D] mb-1">
                  When is it due?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] focus:outline-none focus:border-[#0F777A] transition-colors cursor-pointer"
                  />
                  <input
                    type="time"
                    value={dueTime}
                    onChange={(e) => setDueTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] focus:outline-none focus:border-[#0F777A] transition-colors cursor-pointer"
                  />
                </div>
              </div>

              {/* Importance */}
              <div>
                <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D] mb-1">
                  How important is this?
                </label>
                <select
                  value={importance}
                  onChange={(e) => setImportance(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] focus:outline-none focus:border-[#0F777A] transition-colors cursor-pointer"
                >
                  <option value={2}>Low</option>
                  <option value={3}>Normal</option>
                  <option value={4}>Important</option>
                  <option value={5}>Critical</option>
                </select>
              </div>

              {/* Estimated Time */}
              <div>
                <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D] mb-1">
                  How much time will this take?
                </label>
                <select
                  value={estimatedTime}
                  onChange={(e) => setEstimatedTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] focus:outline-none focus:border-[#0F777A] transition-colors cursor-pointer"
                >
                  <option value="15 minutes">15 minutes</option>
                  <option value="30 minutes">30 minutes</option>
                  <option value="1 hour">1 hour</option>
                  <option value="2 hours">2 hours</option>
                  <option value="Half day">Half day</option>
                  <option value="Full day">Full day</option>
                  <option value="Custom">Custom</option>
                </select>

                {estimatedTime === "Custom" && (
                  <div className="mt-2">
                    <input
                      type="text"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      placeholder="e.g. 45 mins, 3 hours"
                      className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] focus:outline-none focus:border-[#0F777A] transition-colors"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 5. Optional Progressive Sections */}
            <div className="pt-2 border-t border-[#0F777A]/10 space-y-2">
              <span className="text-[12px] font-medium text-[#5B888B] uppercase tracking-[0.06em] block mb-1">
                Optional
              </span>

              {/* Subtasks Collapsible */}
              <div className="border border-[#0F777A]/15 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setSubtasksOpen(!subtasksOpen)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {subtasksOpen ? (
                      <ChevronDown className="w-4 h-4 text-[#0F777A]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#0F777A]" />
                    )}
                    <span className="text-[16px] font-semibold leading-[1.3] text-[#07383D]">Subtasks</span>
                  </div>
                  <span className="text-[14px] text-[#5B888B] font-normal leading-[1.5]">
                    {getSubtasksSummary()}
                  </span>
                </button>

                {subtasksOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 bg-[#F7FCFC]/50">
                    {subtasks.length > 0 && (
                      <div className="space-y-1.5">
                        {subtasks.map((st, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white border border-slate-200"
                          >
                            <span className="text-[15px] font-normal leading-[1.55] text-[#07383D] truncate">{st}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveSubtask(idx)}
                              className="text-slate-400 hover:text-red-600 transition-colors p-1 cursor-pointer"
                              aria-label="Remove step"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSubtaskInput}
                        onChange={(e) => setNewSubtaskInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleAddSubtask();
                          }
                        }}
                        placeholder="Add subtask step"
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[14px] font-normal text-[#07383D] focus:outline-none focus:border-[#0F777A]"
                      />
                      <button
                        type="button"
                        onClick={handleAddSubtask}
                        className="px-3 py-1.5 rounded-lg bg-[#0F777A] text-white text-[14px] font-medium leading-[1.4] hover:bg-[#07383D] transition-colors cursor-pointer shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Reminder Collapsible */}
              <div className="border border-[#0F777A]/15 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setReminderOpen(!reminderOpen)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {reminderOpen ? (
                      <ChevronDown className="w-4 h-4 text-[#0F777A]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#0F777A]" />
                    )}
                    <span className="text-[16px] font-semibold leading-[1.3] text-[#07383D]">Reminder</span>
                  </div>
                  <span className="text-[14px] text-[#5B888B] font-normal leading-[1.5]">
                    {getReminderSummary()}
                  </span>
                </button>

                {reminderOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 bg-[#F7FCFC]/50">
                    <div>
                      <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D] mb-1">
                        When should Tik Tik remind you?
                      </label>
                      <select
                        value={reminderOption}
                        onChange={(e) => setReminderOption(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white border border-[#0F777A]/25 text-[#07383D] text-[15px] font-normal leading-[1.55] focus:outline-none focus:border-[#0F777A] transition-colors cursor-pointer"
                      >
                        <option value="none">No reminder</option>
                        <option value="5m_before">5 minutes before</option>
                        <option value="15m_before">15 minutes before</option>
                        <option value="30m_before">30 minutes before</option>
                        <option value="1h_before">1 hour before</option>
                        <option value="3h_before">3 hours before</option>
                        <option value="1d_before">1 day before</option>
                        <option value="adaptive">Adaptive</option>
                      </select>
                    </div>

                    {reminderOption === "adaptive" && (
                      <div className="p-2.5 rounded-lg bg-[#E4F5F5] border border-[#0F777A]/20 text-[#07383D] text-[14px] font-normal leading-[1.5]">
                        Reminders become more frequent as the deadline approaches.
                      </div>
                    )}

                    {reminderOption !== "none" && reminderOption !== "adaptive" && (
                      <div>
                        <label className="block text-[12px] font-medium leading-[1.3] text-[#07383D] mb-1">
                          Optional reminder note
                        </label>
                        <input
                          type="text"
                          value={reminderNote}
                          onChange={(e) => setReminderNote(e.target.value)}
                          placeholder="e.g. Check submission portal"
                          className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[14px] font-normal text-[#07383D] focus:outline-none focus:border-[#0F777A]"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Follow-up Collapsible */}
              <div className="border border-[#0F777A]/15 rounded-xl overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setFollowupOpen(!followupOpen)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-50 transition-colors text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    {followupOpen ? (
                      <ChevronDown className="w-4 h-4 text-[#0F777A]" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-[#0F777A]" />
                    )}
                    <span className="text-[16px] font-semibold leading-[1.3] text-[#07383D]">Follow-up</span>
                  </div>
                  <span className="text-[14px] text-[#5B888B] font-normal leading-[1.5]">
                    {getFollowupSummary()}
                  </span>
                </button>

                {followupOpen && (
                  <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3 bg-[#F7FCFC]/50">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableFollowup}
                        onChange={(e) => setEnableFollowup(e.target.checked)}
                        className="rounded border-[#0F777A]/30 text-[#0F777A] focus:ring-[#0F777A] cursor-pointer"
                      />
                      <span className="text-[14px] font-normal leading-[1.5] text-[#07383D]">
                        Schedule a follow-up check after due date
                      </span>
                    </label>

                    {enableFollowup && (
                      <div className="space-y-2 pt-1">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[12px] font-medium leading-[1.3] text-[#5B888B] mb-1">
                              Follow-up date
                            </label>
                            <input
                              type="date"
                              value={followupDate}
                              onChange={(e) => setFollowupDate(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[14px] font-normal text-[#07383D] focus:outline-none focus:border-[#0F777A]"
                            />
                          </div>
                          <div>
                            <label className="block text-[12px] font-medium leading-[1.3] text-[#5B888B] mb-1">
                              Time
                            </label>
                            <input
                              type="time"
                              value={followupTime}
                              onChange={(e) => setFollowupTime(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[14px] font-normal text-[#07383D] focus:outline-none focus:border-[#0F777A]"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[12px] font-medium leading-[1.3] text-[#5B888B] mb-1">
                            Follow-up note
                          </label>
                          <input
                            type="text"
                            value={followupNote}
                            onChange={(e) => setFollowupNote(e.target.value)}
                            placeholder="e.g. Verify receipt / check feedback"
                            className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-[14px] font-normal text-[#07383D] focus:outline-none focus:border-[#0F777A]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions: [ Cancel ] [ Add activity ] */}
          <div className="px-6 py-3.5 border-t border-[#0F777A]/10 bg-slate-50/50 flex items-center justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[14px] font-medium leading-[1.4] text-[#5B888B] hover:text-[#07383D] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-lg text-[14px] font-medium leading-[1.4] text-white bg-[#0F777A] hover:bg-[#07383D] focus:outline-none focus:ring-2 focus:ring-[#0F777A] transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              {loading ? "Adding activity..." : "Add activity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
