// src/components/common/InteractiveListCard.tsx
import React from "react";
import { ChevronRight } from "lucide-react";

export interface InteractiveListCardProps {
  /** Optional icon rendered on the left inside a subtle rounded container */
  icon?: React.ReactNode;
  /** Optional custom leading element (e.g. checkbox or toggle button) */
  leadingAction?: React.ReactNode;
  /** Primary title string or node (14-16px semi-bold) */
  title: React.ReactNode;
  /** Secondary subtitle or metadata line (12-13px muted) */
  subtitle?: React.ReactNode;
  /** Optional badges shown beside title (e.g., status, priority) */
  badges?: React.ReactNode;
  /** Optional metadata displayed on the right (e.g., date, count) */
  trailingMeta?: React.ReactNode;
  /** Optional quick action buttons on the right (will have e.stopPropagation()) */
  trailingAction?: React.ReactNode;
  /** Click handler to open detail view / popup */
  onClick: () => void;
  /** Whether to show the chevron icon (default true) */
  showChevron?: boolean;
  /** Highlight style variant: default, urgent/overdue, completed, warning, muted */
  variant?: "default" | "urgent" | "completed" | "warning" | "muted";
  /** Optional extra CSS classes */
  className?: string;
  /** Accessible label */
  ariaLabel?: string;
}

export const InteractiveListCard: React.FC<InteractiveListCardProps> = ({
  icon,
  leadingAction,
  title,
  subtitle,
  badges,
  trailingMeta,
  trailingAction,
  onClick,
  showChevron = true,
  variant = "default",
  className = "",
  ariaLabel,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onClick();
    }
  };

  // Border & background styling based on variant
  let variantClasses = "bg-white/80 border-[#0F777A]/12 hover:border-[#0F777A]/30 hover:bg-white text-[#07383D]";
  let iconContainerClasses = "bg-[#8BCDCF]/20 border-[#0F777A]/15 text-[#0F777A]";

  if (variant === "urgent") {
    variantClasses = "bg-red-50/70 border-red-200/90 hover:border-red-300 hover:bg-red-50 text-red-950";
    iconContainerClasses = "bg-red-100 text-red-700 border-red-200";
  } else if (variant === "completed") {
    variantClasses = "bg-white/45 border-slate-200/80 hover:bg-white/70 text-slate-500 opacity-80";
    iconContainerClasses = "bg-emerald-50 text-emerald-600 border-emerald-200";
  } else if (variant === "warning") {
    variantClasses = "bg-amber-50/70 border-amber-200/90 hover:border-amber-300 hover:bg-amber-50 text-amber-950";
    iconContainerClasses = "bg-amber-100 text-amber-700 border-amber-200";
  } else if (variant === "muted") {
    variantClasses = "bg-white/50 border-slate-200/70 hover:bg-white text-slate-600";
    iconContainerClasses = "bg-slate-100 text-slate-600 border-slate-200";
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel || (typeof title === "string" ? title : undefined)}
      className={`group w-full min-h-[72px] px-4 py-3 rounded-xl sm:rounded-2xl border transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs active:scale-[0.99] select-none flex items-center justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-[#0F777A]/30 ${variantClasses} ${className}`}
    >
      {/* Left side: Leading Action / Icon + Text content */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {/* Leading custom action (e.g. toggle check) */}
        {leadingAction && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="shrink-0 flex items-center"
          >
            {leadingAction}
          </div>
        )}

        {/* Standard Icon container */}
        {icon && (
          <div
            className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${iconContainerClasses}`}
          >
            {icon}
          </div>
        )}

        {/* Title, Badges, and Subtitle */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`text-[15px] sm:text-[16px] font-semibold leading-[1.3] truncate ${
                variant === "completed" ? "line-through text-slate-500" : "text-[#07383D]"
              }`}
            >
              {title}
            </span>
            {badges && <div className="flex items-center gap-1.5 shrink-0">{badges}</div>}
          </div>

          {subtitle && (
            <div className="text-[12px] sm:text-[13px] text-[#5B888B] font-normal leading-[1.45] truncate">
              {subtitle}
            </div>
          )}
        </div>
      </div>

      {/* Right side: Trailing Action, Trailing Meta, and Chevron */}
      <div className="flex items-center gap-2.5 sm:gap-3 shrink-0 ml-1">
        {trailingAction && (
          <div
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            className="flex items-center"
          >
            {trailingAction}
          </div>
        )}

        {trailingMeta && (
          <div className="text-[12px] sm:text-[13px] font-medium text-[#5B888B]">
            {trailingMeta}
          </div>
        )}

        {showChevron && (
          <ChevronRight className="w-4 h-4 text-[#0F777A]/70 group-hover:text-[#0F777A] group-hover:translate-x-0.5 transition-all shrink-0" />
        )}
      </div>
    </div>
  );
};
