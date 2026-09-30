// src/components/admin/AdminRecordDetailsModal.tsx
import React from "react";
import {
  CheckSquare,
  Clock,
  MessageSquare,
  Shield,
  Calendar,
  AlertCircle,
  User,
  CheckCircle2,
  Tag,
  ArrowRight,
  Layers,
  Globe,
  Info,
} from "lucide-react";
import {
  DetailModal,
  DetailSection,
  DetailGrid,
  DetailRow,
  DetailCard,
  TechnicalDetails,
} from "../common/DetailModal";

export type AdminRecordType =
  | "activity"
  | "reminder"
  | "followup"
  | "audit_log"
  | "subtask"
  | "user";

interface AdminRecordDetailsModalProps {
  type: AdminRecordType;
  record: any | null;
  isOpen: boolean;
  onClose: () => void;
}

export function formatAuditAction(action: string): string {
  if (!action) return "Audit Event";
  const map: Record<string, string> = {
    USER_AUTHENTICATED: "User signed in",
    USER_REGISTERED: "User registered",
    USER_SUSPENDED: "User suspended",
    USER_RESTORED: "User restored",
    USER_REMOVED: "User removed",
    USER_ROLE_CHANGED: "User role changed",
    ACTIVITY_CREATED: "Activity created",
    ACTIVITY_UPDATED: "Activity updated",
    ACTIVITY_COMPLETED: "Activity completed",
    ACTIVITY_DELETED: "Activity deleted",
    REMINDER_SCHEDULED: "Reminder scheduled",
    REMINDER_DELIVERED: "Reminder delivered",
    REMINDER_TRIGGERED: "Reminder triggered",
    REMINDER_DISMISSED: "Reminder dismissed",
    REMINDER_DELETED: "Reminder deleted",
    FOLLOWUP_CREATED: "Follow-up scheduled",
    FOLLOWUP_COMPLETED: "Follow-up completed",
    FOLLOWUP_CANCELLED: "Follow-up cancelled",
    FOLLOWUP_DELETED: "Follow-up deleted",
    SUBTASK_CREATED: "Subtask created",
    SUBTASK_COMPLETED: "Subtask completed",
    SUBTASK_DELETED: "Subtask deleted",
    PASSWORD_RESET_REQUESTED: "Password reset requested",
    PASSWORD_RESET_COMPLETED: "Password reset completed",
  };
  if (map[action]) return map[action];
  return action
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatAuditHumanSummary(record: any): string {
  if (!record) return "";
  const { action, actor, admin_email, target_type, target_id, details } = record;
  const who = admin_email || actor || "System";
  const target = target_type ? `${target_type}${target_id ? ` #${target_id}` : ""}` : "";

  switch (action) {
    case "USER_AUTHENTICATED":
      return `Authentication successful for ${who}. Session established securely.`;
    case "USER_REGISTERED":
      return `New user account registration completed for ${target || who}.`;
    case "USER_SUSPENDED":
      return `Administrator ${who} suspended user account ${target}. Access revoked until restoration.`;
    case "USER_RESTORED":
      return `Administrator ${who} restored active account status for ${target}.`;
    case "USER_REMOVED":
      return `Administrator ${who} permanently removed user ${target} and related productivity data.`;
    case "ACTIVITY_CREATED":
      return `New activity record ${target} was created by ${who}.`;
    case "ACTIVITY_COMPLETED":
      return `Activity ${target} was marked completed.`;
    case "ACTIVITY_DELETED":
      return `Activity record ${target} was deleted from database.`;
    case "REMINDER_DELIVERED":
      return `Scheduled reminder notification delivered to user.`;
    case "REMINDER_TRIGGERED":
      return `Automated reminder alert triggered by notification service.`;
    case "FOLLOWUP_COMPLETED":
      return `Follow-up ${target} completed with recorded outcome.`;
    default:
      if (details && typeof details === "object" && details.message) {
        return String(details.message);
      }
      return `${formatAuditAction(action)} event was recorded in system logs.`;
  }
}

export const AdminRecordDetailsModal: React.FC<AdminRecordDetailsModalProps> = ({
  type,
  record,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !record) return null;

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

  const getModalConfig = () => {
    switch (type) {
      case "activity":
        return {
          icon: <CheckSquare className="w-4 h-4" />,
          subtitle: "Activity details",
          title: record.title || "Untitled Activity",
          identifier: record.id ? `#${record.id}` : undefined,
          badge: (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                record.status === "COMPLETED"
                  ? "bg-emerald-100 text-emerald-800"
                  : record.status === "IN_PROGRESS"
                  ? "bg-blue-100 text-blue-800"
                  : record.urgency === "OVERDUE"
                  ? "bg-red-100 text-red-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {record.status}
            </span>
          ),
        };

      case "reminder":
        return {
          icon: <Clock className="w-4 h-4" />,
          subtitle: "Reminder details",
          title: record.message || "Reminder",
          identifier: record.id ? `#${record.id}` : undefined,
          badge: (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#8BCDCF]/25 text-[#07383D]">
              {record.status}
            </span>
          ),
        };

      case "followup":
        return {
          icon: <MessageSquare className="w-4 h-4" />,
          subtitle: "Follow-up details",
          title: record.note || "Follow-up",
          identifier: record.id ? `#${record.id}` : undefined,
          badge: (
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#8BCDCF]/25 text-[#07383D]">
              {record.status}
            </span>
          ),
        };

      case "subtask":
        return {
          icon: <Layers className="w-4 h-4" />,
          subtitle: "Subtask details",
          title: record.title || "Subtask",
          identifier: record.id ? `#${record.id}` : undefined,
          badge: (
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                record.is_completed
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-700"
              }`}
            >
              {record.is_completed ? "Completed" : "Pending"}
            </span>
          ),
        };

      case "audit_log":
      default:
        return {
          icon: <Shield className="w-4 h-4" />,
          subtitle: "Audit log",
          title: formatAuditAction(record.action),
          identifier: record.id ? `#${record.id}` : undefined,
          badge: (
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-100 text-slate-700 border border-slate-200">
              {record.action}
            </span>
          ),
        };
    }
  };

  const config = getModalConfig();

  // Extract structured detail properties from audit log payload if available
  const details = record.details && typeof record.details === "object" ? record.details : null;
  const knownDetailEntries = details
    ? Object.entries(details).filter(
        ([key, val]) =>
          val !== null &&
          val !== undefined &&
          typeof val !== "object" &&
          !key.toLowerCase().includes("password") &&
          !key.toLowerCase().includes("token")
      )
    : [];

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      icon={config.icon}
      subtitle={config.subtitle}
      title={config.title}
      identifier={config.identifier}
      badge={config.badge}
      maxWidth="lg"
      footer={
        <div className="flex items-center justify-end w-full">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-full text-[13px] font-medium bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      }
    >
      {/* 1. AUDIT LOG DETAILS */}
      {type === "audit_log" && (
        <div className="space-y-3.5">
          {/* Natural Human Summary */}
          <DetailCard variant="accent">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-[#0F777A] shrink-0 mt-0.5" />
              <p className="text-[13px] leading-relaxed">
                {formatAuditHumanSummary(record)}
              </p>
            </div>
          </DetailCard>

          {/* Event Information Grid */}
          <DetailSection title="Event Information">
            <DetailGrid columns={2}>
              <DetailRow
                label="Action"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <span>{formatAuditAction(record.action)}</span>
                  </span>
                }
              />
              <DetailRow
                label="Actor"
                icon={<User className="w-3.5 h-3.5" />}
                value={record.admin_email || record.actor || "System"}
              />
              <DetailRow
                label="Target"
                value={
                  record.target_type
                    ? `${record.target_type}${record.target_id ? ` #${record.target_id}` : ""}`
                    : "System"
                }
              />
              <DetailRow
                label="Timestamp"
                icon={<Clock className="w-3.5 h-3.5" />}
                value={formatDateTime(record.created_at)}
              />
              <DetailRow
                label="IP Address"
                icon={<Globe className="w-3.5 h-3.5" />}
                value={record.ip_address || "Internal"}
              />
            </DetailGrid>
          </DetailSection>

          {/* Structured Event Parameters (if any key-values exist) */}
          {knownDetailEntries.length > 0 && (
            <DetailSection title="Event Parameters">
              <DetailGrid columns={2}>
                {knownDetailEntries.map(([key, val]) => (
                  <DetailRow
                    key={key}
                    label={key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    value={String(val)}
                  />
                ))}
              </DetailGrid>
            </DetailSection>
          )}

          {/* Collapsible Technical JSON Payload (Redacted & Collapsed by default) */}
          {record.details && (
            <TechnicalDetails data={record.details} label="Technical payload" />
          )}
        </div>
      )}

      {/* 2. ACTIVITY DETAILS */}
      {type === "activity" && (
        <div className="space-y-3.5">
          {record.description && (
            <DetailSection title="Description / Notes">
              <DetailCard>
                <p className="whitespace-pre-wrap">{record.description}</p>
              </DetailCard>
            </DetailSection>
          )}

          <DetailSection title="Plan & Timing">
            <DetailGrid columns={2}>
              <DetailRow label="Status" value={record.status} />
              <DetailRow label="Type" value={record.activity_type || "Task"} />
              <DetailRow
                label="Due Date"
                icon={<Calendar className="w-3.5 h-3.5" />}
                value={formatDateTime(record.deadline)}
              />
              <DetailRow label="Importance" value={`${record.importance || 3} / 5`} />
              <DetailRow
                label="Owner"
                icon={<User className="w-3.5 h-3.5" />}
                value={record.owner_email || `User #${record.user_id}`}
              />
              <DetailRow
                label="Created"
                icon={<Clock className="w-3.5 h-3.5" />}
                value={formatDateTime(record.created_at)}
              />
            </DetailGrid>
          </DetailSection>
        </div>
      )}

      {/* 3. REMINDER DETAILS */}
      {type === "reminder" && (
        <div className="space-y-3.5">
          <DetailSection title="Reminder Information">
            <DetailGrid columns={2}>
              <DetailRow label="Status" value={record.status} />
              <DetailRow
                label="Scheduled Time"
                icon={<Clock className="w-3.5 h-3.5" />}
                value={formatDateTime(record.remind_at)}
              />
              <DetailRow
                label="Related Activity"
                value={record.activity_title || `Activity #${record.activity_id}`}
                fullWidth={true}
              />
              <DetailRow
                label="Owner"
                icon={<User className="w-3.5 h-3.5" />}
                value={record.user_email || record.owner_email || `User #${record.user_id}`}
              />
              <DetailRow
                label="Created"
                icon={<Calendar className="w-3.5 h-3.5" />}
                value={formatDateTime(record.created_at)}
              />
              {record.snooze_until && (
                <DetailRow
                  label="Snooze Until"
                  icon={<Clock className="w-3.5 h-3.5" />}
                  value={formatDateTime(record.snooze_until)}
                  fullWidth={true}
                />
              )}
            </DetailGrid>
          </DetailSection>
        </div>
      )}

      {/* 4. FOLLOW-UP DETAILS */}
      {type === "followup" && (
        <div className="space-y-3.5">
          <DetailSection title="Follow-up Information">
            <DetailGrid columns={2}>
              <DetailRow label="Status" value={record.status} />
              <DetailRow
                label="Scheduled Date"
                icon={<Calendar className="w-3.5 h-3.5" />}
                value={formatDateTime(record.scheduled_at || record.scheduled_date)}
              />
              <DetailRow
                label="Related Activity"
                value={record.activity_title || `Activity #${record.activity_id}`}
                fullWidth={true}
              />
              <DetailRow
                label="Owner"
                icon={<User className="w-3.5 h-3.5" />}
                value={record.user_email || record.owner_email || `User #${record.user_id}`}
              />
              <DetailRow
                label="Created"
                icon={<Clock className="w-3.5 h-3.5" />}
                value={formatDateTime(record.created_at)}
              />
            </DetailGrid>
          </DetailSection>

          {record.outcome && (
            <DetailSection title="Recorded Outcome">
              <DetailCard variant="highlight">
                <p className="font-medium">{record.outcome}</p>
              </DetailCard>
            </DetailSection>
          )}
        </div>
      )}

      {/* 5. SUBTASK DETAILS */}
      {type === "subtask" && (
        <div className="space-y-3.5">
          <DetailSection title="Subtask Information">
            <DetailGrid columns={2}>
              <DetailRow
                label="Status"
                value={record.is_completed ? "Completed" : "Pending"}
              />
              <DetailRow
                label="Parent Activity"
                value={record.activity_title || `Activity #${record.activity_id}`}
              />
              <DetailRow
                label="Created"
                icon={<Clock className="w-3.5 h-3.5" />}
                value={formatDateTime(record.created_at)}
              />
            </DetailGrid>
          </DetailSection>
        </div>
      )}
    </DetailModal>
  );
};
