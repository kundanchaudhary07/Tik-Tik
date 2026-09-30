// src/components/common/DetailModal.tsx
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronDown, ChevronUp, Code, Copy, Check } from "lucide-react";

/**
 * Global utility to sanitize and redact sensitive credentials/tokens/secrets
 */
export function redactSensitiveData(data: any): any {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(redactSensitiveData);

  const redacted: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (
      lowerKey.includes("password") ||
      lowerKey.includes("hash") ||
      lowerKey.includes("token") ||
      lowerKey.includes("secret") ||
      lowerKey.includes("jwt") ||
      lowerKey.includes("api_key") ||
      lowerKey.includes("apikey") ||
      lowerKey.includes("credential") ||
      lowerKey.includes("auth_header") ||
      lowerKey.includes("cookie") ||
      lowerKey.includes("private_key")
    ) {
      redacted[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      redacted[key] = redactSensitiveData(value);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/* ========================================================================= */
/* DETAIL MODAL PROPS & MAIN WRAPPER                                         */
/* ========================================================================= */

export interface DetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  identifier?: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  children: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
}

export const DetailModal: React.FC<DetailModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  badge,
  identifier,
  maxWidth = "lg",
  children,
  footer,
  ariaLabel,
}) => {
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

      return () => {
        document.body.style.overflow = originalOverflow;
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Responsive widths aligned with the 560-720px desktop guidance
  let widthClass = "max-w-[620px]"; // default (~620px)
  if (maxWidth === "sm") widthClass = "max-w-[460px]";
  if (maxWidth === "md") widthClass = "max-w-[540px]";
  if (maxWidth === "lg") widthClass = "max-w-[640px]";
  if (maxWidth === "xl") widthClass = "max-w-[720px]";

  const modalNode = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity select-none"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel || (typeof title === "string" ? title : "Detail view")}
    >
      <div
        className={`w-full ${widthClass} max-w-[calc(100vw-24px)] sm:max-w-[calc(100vw-32px)] bg-white rounded-2xl shadow-xl border border-slate-200/90 overflow-hidden flex flex-col max-h-[calc(100vh-28px)] sm:max-h-[calc(100vh-48px)] transition-all animate-in fade-in zoom-in-95 duration-150 select-text my-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - Fixed & Compact */}
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/75 shrink-0 gap-3">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {icon && (
              <div className="w-8 h-8 rounded-lg bg-[#8BCDCF]/20 text-[#0F777A] border border-[#0F777A]/15 flex items-center justify-center shrink-0">
                {icon}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {subtitle && (
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B888B] block truncate leading-none">
                    {subtitle}
                  </span>
                )}
                {identifier && (
                  <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-200/70 text-slate-700 leading-none">
                    {identifier}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5 min-w-0">
                <h2 className="text-[17px] sm:text-[18px] font-semibold text-[#07383D] truncate leading-snug">
                  {title}
                </h2>
                {badge && <div className="shrink-0">{badge}</div>}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Scrollable Body - Self-sizing based on content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-3.5 sm:space-y-4 flex-1 min-h-0 text-[14px] leading-normal text-[#07383D]">
          {children}
        </div>

        {/* Footer Actions - Fixed at Bottom */}
        {footer && (
          <footer className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50/75 shrink-0 gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalNode, document.body)
    : modalNode;
};

/* ========================================================================= */
/* DETAIL SECTION, GRID & ROW COMPONENTS                                     */
/* ========================================================================= */

export interface DetailSectionProps {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const DetailSection: React.FC<DetailSectionProps> = ({
  title,
  subtitle,
  action,
  children,
  className = "",
}) => {
  return (
    <section className={`space-y-2 ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between pb-1 border-b border-slate-100">
          <div>
            {title && (
              <h3 className="text-[13px] sm:text-[14px] font-semibold uppercase tracking-wider text-[#5B888B]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-[11px] sm:text-[12px] text-[#5B888B]/80">{subtitle}</p>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div>{children}</div>
    </section>
  );
};

export const DetailGrid: React.FC<{ children: React.ReactNode; columns?: 2 | 3; className?: string }> = ({
  children,
  columns = 2,
  className = "",
}) => {
  const colClass = columns === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <div className={`grid grid-cols-1 ${colClass} gap-x-5 gap-y-2.5 sm:gap-x-6 sm:gap-y-3 ${className}`}>
      {children}
    </div>
  );
};

export interface DetailRowProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  fullWidth?: boolean;
  className?: string;
}

export const DetailRow: React.FC<DetailRowProps> = ({
  label,
  value,
  icon,
  fullWidth = false,
  className = "",
}) => {
  if (value === undefined || value === null || value === "") return null;

  return (
    <div className={`space-y-0.5 ${fullWidth ? "sm:col-span-2" : ""} ${className}`}>
      <span className="text-[11px] sm:text-[12px] font-medium text-[#5B888B] flex items-center gap-1.5 leading-none">
        {icon && <span className="text-[#0F777A]/75 shrink-0">{icon}</span>}
        <span>{label}</span>
      </span>
      <div className="text-[13px] sm:text-[14px] font-medium text-[#07383D] leading-snug break-words">
        {value}
      </div>
    </div>
  );
};

export interface DetailCardProps {
  children: React.ReactNode;
  variant?: "default" | "accent" | "highlight" | "danger";
  className?: string;
}

export const DetailCard: React.FC<DetailCardProps> = ({
  children,
  variant = "default",
  className = "",
}) => {
  let variantClasses = "bg-slate-50 border-slate-200/80 text-slate-800";
  if (variant === "accent") {
    variantClasses = "bg-[#8BCDCF]/10 border-[#0F777A]/20 text-[#07383D] border-l-4 border-l-[#0F777A]";
  } else if (variant === "highlight") {
    variantClasses = "bg-emerald-50/70 border-emerald-200/70 text-emerald-950";
  } else if (variant === "danger") {
    variantClasses = "bg-red-50/70 border-red-200/70 text-red-950";
  }

  return (
    <div className={`p-3 sm:p-3.5 rounded-xl border text-[13px] leading-relaxed ${variantClasses} ${className}`}>
      {children}
    </div>
  );
};

/* ========================================================================= */
/* COLLAPSIBLE TECHNICAL DETAILS                                             */
/* ========================================================================= */

export interface TechnicalDetailsProps {
  data: any;
  label?: string;
  defaultExpanded?: boolean;
}

export const TechnicalDetails: React.FC<TechnicalDetailsProps> = ({
  data,
  label = "Technical payload",
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  if (!data) return null;

  const safeData = redactSensitiveData(data);
  const jsonString = typeof safeData === "string" ? safeData : JSON.stringify(safeData, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="pt-2 border-t border-slate-100">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#0F777A] hover:text-[#07383D] cursor-pointer transition-colors py-1"
      >
        <Code className="w-3.5 h-3.5" />
        <span>{expanded ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()} (JSON)`}</span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {expanded && (
        <div className="mt-2 relative rounded-xl bg-slate-900 text-slate-100 p-3 overflow-hidden border border-slate-800 animate-in fade-in duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-[10px] text-slate-400 font-mono">
            <span>Payload (Redacted)</span>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1 text-slate-300 hover:text-white cursor-pointer transition-colors"
            >
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              <span>{copied ? "Copied" : "Copy"}</span>
            </button>
          </div>
          <pre className="text-[12px] font-mono leading-relaxed overflow-x-auto max-h-40 pt-2 select-all whitespace-pre">
            {jsonString}
          </pre>
        </div>
      )}
    </div>
  );
};
