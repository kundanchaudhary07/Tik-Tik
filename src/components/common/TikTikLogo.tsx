// src/components/common/TikTikLogo.tsx
import React, { useState } from "react";

interface TikTikLogoProps {
  size?: number | "sm" | "md" | "lg" | "xl";
  className?: string;
  showText?: boolean;
  textClassName?: string;
  textColor?: string;
  variant?: "default" | "inverted";
  isReducedMotion?: boolean;
}

export const TikTikLogo: React.FC<TikTikLogoProps> = ({
  size = "md",
  className = "",
  showText = false,
  textClassName = "",
  textColor,
  variant = "default",
  isReducedMotion = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);

  // Determine pixel size
  let pixelSize = 32;
  if (typeof size === "number") {
    pixelSize = size;
  } else {
    switch (size) {
      case "sm":
        pixelSize = 24;
        break;
      case "md":
        pixelSize = 32;
        break;
      case "lg":
        pixelSize = 40;
        break;
      case "xl":
        pixelSize = 48;
        break;
      default:
        pixelSize = 32;
    }
  }

  const isInverted = variant === "inverted";

  return (
    <div
      className={`inline-flex items-center gap-2.5 select-none ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Precision Mini Alarm Clock SVG Logo */}
      <div
        style={{ width: pixelSize, height: pixelSize }}
        className="relative shrink-0 flex items-center justify-center"
      >
        <svg
          viewBox="0 0 40 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`w-full h-full transition-transform duration-300 ease-out ${
            isHovered && !isReducedMotion
              ? "animate-[logoMicroChime_0.5s_ease-in-out]"
              : !isReducedMotion
              ? "animate-[logoSubtlePulse_8s_ease-in-out_infinite]"
              : ""
          }`}
          aria-hidden="true"
        >
          {/* 1. Ground feet */}
          <path
            d="M13 36 L9 42 C8.5 42.6 9 43.5 9.8 43.5 L11 43.5 L15 37 Z"
            fill={isInverted ? "#8BCDCF" : "#07383D"}
          />
          <path
            d="M27 36 L31 42 C31.5 42.6 31 43.5 30.2 43.5 L29 43.5 L25 37 Z"
            fill={isInverted ? "#8BCDCF" : "#07383D"}
          />

          {/* 2. Top Striker Loop Handle */}
          <path
            d="M17 11 C17 7, 23 7, 23 11"
            stroke={isInverted ? "#8BCDCF" : "#07383D"}
            strokeWidth="1.8"
            strokeLinecap="round"
            fill="none"
          />
          <circle cx="20" cy="8.5" r="1.5" fill={isInverted ? "#FFFFFF" : "#0F777A"} />

          {/* 3. Twin Bells */}
          {/* Left Bell */}
          <g
            transform="translate(10, 11) rotate(-32)"
            className={
              isHovered && !isReducedMotion
                ? "animate-[bellRingLeft_0.25s_ease-in-out_infinite]"
                : ""
            }
          >
            <rect x="-1" y="0" width="2" height="3" fill={isInverted ? "#8BCDCF" : "#0F777A"} />
            <path
              d="M -6 0 C -6 -5.5, 6 -5.5, 6 0 Z"
              fill={isInverted ? "#0F777A" : "#0F777A"}
              stroke={isInverted ? "#8BCDCF" : "#07383D"}
              strokeWidth="0.8"
            />
            <circle cx="0" cy="-5" r="0.8" fill={isInverted ? "#FFFFFF" : "#8BCDCF"} />
          </g>

          {/* Right Bell */}
          <g
            transform="translate(30, 11) rotate(32)"
            className={
              isHovered && !isReducedMotion
                ? "animate-[bellRingRight_0.25s_ease-in-out_infinite]"
                : ""
            }
          >
            <rect x="-1" y="0" width="2" height="3" fill={isInverted ? "#8BCDCF" : "#0F777A"} />
            <path
              d="M -6 0 C -6 -5.5, 6 -5.5, 6 0 Z"
              fill={isInverted ? "#0F777A" : "#0F777A"}
              stroke={isInverted ? "#8BCDCF" : "#07383D"}
              strokeWidth="0.8"
            />
            <circle cx="0" cy="-5" r="0.8" fill={isInverted ? "#FFFFFF" : "#8BCDCF"} />
          </g>

          {/* 4. Main Body Casing */}
          <circle cx="20" cy="24" r="15" fill={isInverted ? "#0F777A" : "#07383D"} />
          <circle cx="20" cy="24" r="13.8" fill={isInverted ? "#8BCDCF" : "#0F777A"} />
          <circle cx="20" cy="24" r="12.5" fill={isInverted ? "#07383D" : "#FFFFFF"} />

          {/* Dial Face Inner Rim */}
          <circle
            cx="20"
            cy="24"
            r="11.8"
            fill={isInverted ? "#07383D" : "#F7FCFC"}
            stroke={isInverted ? "#0F777A" : "#DDF2F2"}
            strokeWidth="0.8"
          />

          {/* Cardinal Ticks */}
          <line x1="20" y1="13.5" x2="20" y2="15.5" stroke={isInverted ? "#8BCDCF" : "#0F777A"} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="20" y1="32.5" x2="20" y2="34.5" stroke={isInverted ? "#8BCDCF" : "#0F777A"} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="9.5" y1="24" x2="11.5" y2="24" stroke={isInverted ? "#8BCDCF" : "#0F777A"} strokeWidth="1.2" strokeLinecap="round" />
          <line x1="28.5" y1="24" x2="30.5" y2="24" stroke={isInverted ? "#8BCDCF" : "#0F777A"} strokeWidth="1.2" strokeLinecap="round" />

          {/* Hour & Minute Hands (Pointing elegantly to 10:10) */}
          {/* Hour Hand */}
          <line
            x1="20"
            y1="24"
            x2="15.5"
            y2="19.5"
            stroke={isInverted ? "#FFFFFF" : "#07383D"}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          {/* Minute Hand */}
          <line
            x1="20"
            y1="24"
            x2="25.5"
            y2="18"
            stroke={isInverted ? "#8BCDCF" : "#0F777A"}
            strokeWidth="1.4"
            strokeLinecap="round"
          />

          {/* Center Pinion */}
          <circle cx="20" cy="24" r="1.5" fill={isInverted ? "#8BCDCF" : "#07383D"} />
          <circle cx="20" cy="24" r="0.8" fill={isInverted ? "#FFFFFF" : "#8BCDCF"} />
        </svg>
      </div>

      {showText && (
        <span
          className={`font-bold tracking-tight block leading-tight ${textClassName}`}
          style={{ color: textColor || (isInverted ? "#FFFFFF" : "inherit") }}
        >
          Tik Tik
        </span>
      )}
    </div>
  );
};
