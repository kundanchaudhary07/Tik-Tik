// src/components/views/NotificationDetailsModal.tsx
import React, { useEffect } from "react";
import { Bell, CheckSquare, MessageSquare, Clock } from "lucide-react";
import { InAppNotification } from "../../types";
import {
  DetailModal,
  DetailSection,
  DetailGrid,
  DetailRow,
  DetailCard,
} from "../common/DetailModal";

interface NotificationDetailsModalProps {
  notification: InAppNotification | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkRead: (id: number) => void;
}

export const NotificationDetailsModal: React.FC<NotificationDetailsModalProps> = ({
  notification,
  isOpen,
  onClose,
  onMarkRead,
}) => {
  useEffect(() => {
    if (isOpen && notification) {
      if (!notification.read && !notification.is_read) {
        onMarkRead(notification.id);
      }
    }
  }, [isOpen, notification, onMarkRead]);

  if (!isOpen || !notification) return null;

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

  const getIcon = () => {
    const type = notification.type || "";
    if (type.includes("FOLLOWUP")) return <MessageSquare className="w-4 h-4" />;
    if (type.includes("ACTIVITY")) return <CheckSquare className="w-4 h-4" />;
    return <Bell className="w-4 h-4" />;
  };

  const isRead = Boolean(notification.read || notification.is_read);

  return (
    <DetailModal
      isOpen={isOpen}
      onClose={onClose}
      icon={getIcon()}
      subtitle="Notification"
      title={notification.title}
      identifier={`#${notification.id}`}
      badge={
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            isRead ? "bg-slate-100 text-slate-600" : "bg-emerald-100 text-emerald-800"
          }`}
        >
          {isRead ? "Read" : "Unread"}
        </span>
      }
      maxWidth="md"
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
      <DetailSection title="Details">
        <DetailGrid columns={2}>
          <DetailRow label="Type" value={notification.type || "System Alert"} />
          <DetailRow label="Status" value={isRead ? "Read" : "Unread"} />
          <DetailRow
            label="Received"
            value={formatDateTime(notification.created_at)}
            icon={<Clock className="w-3.5 h-3.5" />}
            fullWidth={true}
          />
        </DetailGrid>
      </DetailSection>

      <DetailSection title="Message">
        <DetailCard>
          <p className="whitespace-pre-wrap">
            {notification.message || notification.body || "No message content."}
          </p>
        </DetailCard>
      </DetailSection>
    </DetailModal>
  );
};
