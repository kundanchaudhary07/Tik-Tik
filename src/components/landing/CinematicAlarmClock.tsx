// src/components/landing/CinematicAlarmClock.tsx
import React, { useState, useEffect, useCallback } from "react";

export interface SceneData {
  id: number;
  number: string;
  name: string;
  timeString: string;
  timeLabel: string;
  hourAngle: number;
  minuteAngle: number;
  headline: string;
  subheadline: string;
  badgeLabel: string;
  badgeIcon: "plan" | "remind" | "focus" | "done";
  badgeDetail: string;
  isRinging?: boolean;
  isCompleted?: boolean;
  bgGradient: string;
  auraColor: string;
}

interface CinematicAlarmClockProps {
  scene?: SceneData;
  auraColor?: string;
  isReducedMotion: boolean;
  isRinging?: boolean;
  onRingToggle?: () => void;
}

interface RealTimeState {
  timeLabel: string;
  hourAngle: number;
  minuteAngle: number;
  secondAngle: number;
}

const getRealTimeState = (): RealTimeState => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const ms = now.getMilliseconds();

  const hour12 = hours % 12 || 12;
  const padHour = String(hour12).padStart(2, "0");
  const padMin = String(minutes).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  const timeLabel = `${padHour}:${padMin} ${ampm}`;

  // Precise analog hand angles
  const hourAngle = (hours % 12) * 30 + minutes * 0.5 + (seconds * 0.5) / 60;
  const minuteAngle = minutes * 6 + seconds * 0.1;
  const secondAngle = (seconds + ms / 1000) * 6;

  return {
    timeLabel,
    hourAngle,
    minuteAngle,
    secondAngle,
  };
};

export const CinematicAlarmClock: React.FC<CinematicAlarmClockProps> = ({
  scene,
  auraColor: customAura,
  isReducedMotion,
  isRinging: controlledRinging,
  onRingToggle,
}) => {
  const [timeState, setTimeState] = useState<RealTimeState>(getRealTimeState);
  const [localRinging, setLocalRinging] = useState(false);

  // Real-time synchronization loop: lightweight, continuous, zero drift
  useEffect(() => {
    if (isReducedMotion) {
      const interval = setInterval(() => {
        setTimeState(getRealTimeState());
      }, 1000);
      return () => clearInterval(interval);
    }

    let animId: number;
    let lastTime = 0;

    const tick = (nowTime: number) => {
      if (nowTime - lastTime >= 30) {
        lastTime = nowTime;
        setTimeState(getRealTimeState());
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    const handleVisibility = () => {
      if (!document.hidden) {
        setTimeState(getRealTimeState());
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(animId);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isReducedMotion]);

  // Periodic subtle demonstration ring if not controlled from outside
  useEffect(() => {
    if (isReducedMotion || controlledRinging !== undefined) return;

    // Rings every ~11s for 1.4s, then smoothly returns to resting float
    const interval = setInterval(() => {
      setLocalRinging(true);
      const timer = setTimeout(() => {
        setLocalRinging(false);
      }, 1400);
      return () => clearTimeout(timer);
    }, 11000);

    return () => clearInterval(interval);
  }, [isReducedMotion, controlledRinging]);

  const isRinging = controlledRinging ?? localRinging ?? Boolean(scene?.isRinging);
  const auraColor = customAura || scene?.auraColor || "rgba(184, 222, 223, 0.45)";
  const isCompleted = Boolean(scene?.isCompleted);

  const handleClick = useCallback(() => {
    if (onRingToggle) {
      onRingToggle();
    } else if (!isReducedMotion) {
      setLocalRinging(true);
      setTimeout(() => setLocalRinging(false), 1400);
    }
  }, [onRingToggle, isReducedMotion]);

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title="Tik Tik alarm (click to ring)"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className="relative flex items-center justify-center select-none mx-auto cursor-pointer focus:outline-none"
      style={{
        height: "100%",
        maxHeight: "clamp(270px, 58svh, 560px)",
        aspectRatio: "400 / 460",
        maxWidth: "min(90vw, 520px)",
        width: "auto",
      }}
    >
      {/* Ringing Waves Effect when Active */}
      {isRinging && !isReducedMotion && (
        <>
          <div
            className="absolute inset-1 sm:inset-3 rounded-full border-2 pointer-events-none animate-ping opacity-35"
            style={{
              borderColor: "var(--primary)",
              animationDuration: "2s",
            }}
          />
          <div
            className="absolute -inset-3 sm:-inset-5 rounded-full border pointer-events-none animate-pulse opacity-40"
            style={{
              borderColor: "var(--accent)",
              animationDuration: "1.5s",
            }}
          />
        </>
      )}

      {/* Completion Halo Effect */}
      {isCompleted && (
        <div
          className="absolute inset-0 rounded-full pointer-events-none transition-all duration-700"
          style={{
            boxShadow: "0 0 60px rgba(15, 119, 122, 0.28)",
          }}
        />
      )}

      {/* Precision 3D Minimal Modern Alarm Clock SVG with Realistic Ring Shake & Natural Float */}
      <div
        className={`relative w-full h-full transition-transform duration-300 ease-out ${
          isRinging && !isReducedMotion
            ? "animate-[alarmPhysicalRing_0.45s_ease-in-out_infinite]"
            : !isReducedMotion
            ? "animate-[alarmNaturalFloat_6s_ease-in-out_infinite]"
            : ""
        }`}
        style={{
          filter: "drop-shadow(0 20px 32px rgba(7, 56, 61, 0.15))",
        }}
      >
        <svg
          viewBox="0 0 400 460"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full block"
          aria-hidden="true"
        >
          <defs>
            {/* Soft Radial Dial Gradient */}
            <radialGradient id="dialGradient" cx="48%" cy="46%" r="54%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="78%" stopColor="#F9FDFD" />
              <stop offset="100%" stopColor="#EBF6F6" />
            </radialGradient>

            {/* Outer Bezel Rim Gradient */}
            <linearGradient id="bezelGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="30%" stopColor="#E3F4F4" />
              <stop offset="70%" stopColor="#8BCDCF" />
              <stop offset="100%" stopColor="#0F777A" />
            </linearGradient>

            {/* Metal Bell Highlights */}
            <linearGradient id="bellGradientLeft" x1="20%" y1="10%" x2="80%" y2="90%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="35%" stopColor="#DDF2F2" />
              <stop offset="75%" stopColor="#8BCDCF" />
              <stop offset="100%" stopColor="#0F777A" />
            </linearGradient>

            <linearGradient id="bellGradientRight" x1="80%" y1="10%" x2="20%" y2="90%">
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="35%" stopColor="#DDF2F2" />
              <stop offset="75%" stopColor="#8BCDCF" />
              <stop offset="100%" stopColor="#0F777A" />
            </linearGradient>

            {/* Feet Metallic Gradient */}
            <linearGradient id="feetGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#DDF2F2" />
              <stop offset="60%" stopColor="#8BCDCF" />
              <stop offset="100%" stopColor="#07383D" />
            </linearGradient>

            {/* Glass Sheen Gradient */}
            <linearGradient id="glassReflection" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="rgba(255, 255, 255, 0.65)" />
              <stop offset="35%" stopColor="rgba(255, 255, 255, 0.22)" />
              <stop offset="70%" stopColor="rgba(255, 255, 255, 0.0)" />
            </linearGradient>

            {/* Hand Drop Shadow */}
            <filter id="handShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="2.5" stdDeviation="2.5" floodColor="#07383D" floodOpacity="0.22" />
            </filter>
          </defs>

          {/* 1. Ground Contact Shadow with Subtle Counter-Breathing */}
          <g
            className={
              !isRinging && !isReducedMotion
                ? "animate-[alarmShadowScale_6s_ease-in-out_infinite]"
                : ""
            }
            style={{ transformOrigin: "200px 442px" }}
          >
            <ellipse cx="200" cy="442" rx="130" ry="12" fill="#07383D" opacity="0.14" />
            <ellipse cx="200" cy="442" rx="80" ry="7" fill="#07383D" opacity="0.18" />
          </g>

          {/* 2. Sleek Modern Angled Feet */}
          {/* Left Foot */}
          <g>
            <path
              d="M122 360 L78 434 C76 438 78 443 83 444 C88 445 92 443 94 439 L138 365 Z"
              fill="url(#feetGradient)"
            />
            {/* Rubber cushion foot pad */}
            <ellipse cx="84" cy="441" rx="8" ry="3.5" fill="#07383D" opacity="0.8" />
          </g>

          {/* Right Foot */}
          <g>
            <path
              d="M278 360 L322 434 C324 438 322 443 317 444 C312 445 308 443 306 439 L262 365 Z"
              fill="url(#feetGradient)"
            />
            {/* Rubber cushion foot pad */}
            <ellipse cx="316" cy="441" rx="8" ry="3.5" fill="#07383D" opacity="0.8" />
          </g>

          {/* 3. Top Handle / Striker Bracket */}
          {/* Center handle loop */}
          <path
            d="M168 108 C168 62, 232 62, 232 108"
            stroke="url(#bezelGradient)"
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
          />
          {/* Central striker hammer */}
          <rect x="196" y="86" width="8" height="26" rx="4" fill="#0F777A" />
          <circle cx="200" cy="85" r="7" fill="#07383D" stroke="#DDF2F2" strokeWidth="2" />

          {/* 4. Minimal Modern Twin Bells with Ring Micro-Tremor */}
          {/* Left Bell */}
          <g
            transform="translate(102, 116) rotate(-34)"
            className={
              isRinging && !isReducedMotion
                ? "animate-[bellRingLeft_0.25s_ease-in-out_infinite]"
                : ""
            }
            style={{ transformOrigin: "102px 116px" }}
          >
            {/* Bell mounting arm */}
            <rect x="-4" y="0" width="8" height="20" rx="3" fill="#0F777A" />
            {/* Bell dome */}
            <path
              d="M -48 0 C -48 -44, 48 -44, 48 0 C 48 10, -48 10, -48 0 Z"
              fill="url(#bellGradientLeft)"
              stroke="rgba(15, 119, 122, 0.4)"
              strokeWidth="1.5"
            />
            {/* Bell top accent finial */}
            <circle cx="0" cy="-38" r="5" fill="#07383D" />
          </g>

          {/* Right Bell */}
          <g
            transform="translate(298, 116) rotate(34)"
            className={
              isRinging && !isReducedMotion
                ? "animate-[bellRingRight_0.25s_ease-in-out_infinite]"
                : ""
            }
            style={{ transformOrigin: "298px 116px" }}
          >
            {/* Bell mounting arm */}
            <rect x="-4" y="0" width="8" height="20" rx="3" fill="#0F777A" />
            {/* Bell dome */}
            <path
              d="M -48 0 C -48 -44, 48 -44, 48 0 C 48 10, -48 10, -48 0 Z"
              fill="url(#bellGradientRight)"
              stroke="rgba(15, 119, 122, 0.4)"
              strokeWidth="1.5"
            />
            {/* Bell top accent finial */}
            <circle cx="0" cy="-38" r="5" fill="#07383D" />
          </g>

          {/* 5. Main Clock Casing (Dimensional Circles) */}
          {/* Outer case silhouette */}
          <circle cx="200" cy="246" r="148" fill="#FFFFFF" />
          {/* Bezel Outer Ring */}
          <circle
            cx="200"
            cy="246"
            r="146"
            fill="url(#bezelGradient)"
            stroke="rgba(7, 56, 61, 0.15)"
            strokeWidth="1"
          />
          {/* Middle Bevel Step */}
          <circle cx="200" cy="246" r="139" fill="#07383D" opacity="0.1" />
          <circle cx="200" cy="246" r="138" fill="#FFFFFF" />
          <circle
            cx="200"
            cy="246"
            r="137"
            fill="none"
            stroke="#DDF2F2"
            strokeWidth="3"
          />

          {/* Dial Face */}
          <circle cx="200" cy="246" r="133" fill="url(#dialGradient)" />

          {/* Concentric Ambient Dial Track Rings */}
          <circle cx="200" cy="246" r="122" fill="none" stroke="rgba(15, 119, 122, 0.15)" strokeWidth="1" />
          <circle cx="200" cy="246" r="92" fill="none" stroke="rgba(15, 119, 122, 0.08)" strokeWidth="1" strokeDasharray="3 4" />
          <circle cx="200" cy="246" r="62" fill="none" stroke="rgba(15, 119, 122, 0.08)" strokeWidth="1" />

          {/* 6. Dial Marks: 12 Hour Ticks & Minute Sub-ticks */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const isCardinal = i % 3 === 0;
            const rOuter = 126;
            const rInner = isCardinal ? 112 : 118;
            const x1 = 200 + rOuter * Math.sin(angle);
            const y1 = 246 - rOuter * Math.cos(angle);
            const x2 = 200 + rInner * Math.sin(angle);
            const y2 = 246 - rInner * Math.cos(angle);

            return (
              <line
                key={`tick-${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={isCardinal ? "#0F777A" : "#6B8588"}
                strokeWidth={isCardinal ? 3.5 : 2}
                strokeLinecap="round"
              />
            );
          })}

          {/* Delicate Minute Dots (60 increments) */}
          {Array.from({ length: 60 }).map((_, i) => {
            if (i % 5 === 0) return null;
            const angle = (i * 6 * Math.PI) / 180;
            const r = 124;
            const cx = 200 + r * Math.sin(angle);
            const cy = 246 - r * Math.cos(angle);
            return (
              <circle
                key={`min-${i}`}
                cx={cx}
                cy={cy}
                r="1"
                fill="#8BCDCF"
                opacity="0.8"
              />
            );
          })}

          {/* Cardinal Numerals in Pure System Sans */}
          <text
            x="200"
            y="158"
            textAnchor="middle"
            fill="#07383D"
            fontSize="18"
            fontWeight="700"
            letterSpacing="-0.02em"
          >
            12
          </text>
          <text
            x="294"
            y="252"
            textAnchor="middle"
            fill="#07383D"
            fontSize="18"
            fontWeight="700"
            letterSpacing="-0.02em"
          >
            3
          </text>
          <text
            x="200"
            y="346"
            textAnchor="middle"
            fill="#07383D"
            fontSize="18"
            fontWeight="700"
            letterSpacing="-0.02em"
          >
            6
          </text>
          <text
            x="106"
            y="252"
            textAnchor="middle"
            fill="#07383D"
            fontSize="18"
            fontWeight="700"
            letterSpacing="-0.02em"
          >
            9
          </text>

          {/* Tik Tik Emblem on upper dial */}
          <g opacity="0.85">
            <text
              x="200"
              y="186"
              textAnchor="middle"
              fill="#0F777A"
              fontSize="11"
              fontWeight="700"
              letterSpacing="0.08em"
            >
              TIK TIK
            </text>
            <circle cx="200" cy="195" r="2" fill="#8BCDCF" />
          </g>

          {/* Actual Current Real Time in Digital Readout Capsule */}
          <g transform="translate(160, 280)">
            <rect
              width="80"
              height="24"
              rx="12"
              fill="#EBF6F6"
              stroke="#DDF2F2"
              strokeWidth="1.5"
            />
            <text
              x="40"
              y="16"
              textAnchor="middle"
              fill="#07383D"
              fontSize="11"
              fontWeight="600"
              letterSpacing="0.03em"
            >
              {timeState.timeLabel}
            </text>
          </g>

          {/* 7. Clock Hands Synchronized to Real Time */}
          {/* Hour Hand */}
          <g
            style={{
              transform: `rotate(${timeState.hourAngle}deg)`,
              transformOrigin: "200px 246px",
            }}
            filter="url(#handShadow)"
          >
            {/* Counterbalance tail */}
            <path d="M198 246 L198 260 A2 2 0 0 0 202 260 L202 246 Z" fill="#07383D" />
            {/* Main Hour Baton */}
            <rect x="196" y="174" width="8" height="72" rx="4" fill="#07383D" />
            {/* Inset teal line */}
            <line x1="200" y1="182" x2="200" y2="236" stroke="#8BCDCF" strokeWidth="2" strokeLinecap="round" />
          </g>

          {/* Minute Hand */}
          <g
            style={{
              transform: `rotate(${timeState.minuteAngle}deg)`,
              transformOrigin: "200px 246px",
            }}
            filter="url(#handShadow)"
          >
            {/* Counterbalance tail */}
            <path d="M198.5 246 L198.5 264 A1.5 1.5 0 0 0 201.5 264 L201.5 246 Z" fill="#0F777A" />
            {/* Main Minute Hand */}
            <rect x="197" y="146" width="6" height="100" rx="3" fill="#0F777A" />
            <line x1="200" y1="152" x2="200" y2="236" stroke="#DDF2F2" strokeWidth="1.5" strokeLinecap="round" />
          </g>

          {/* Second Hand with smooth real-time sweep */}
          <g
            style={{
              transform: `rotate(${timeState.secondAngle}deg)`,
              transformOrigin: "200px 246px",
            }}
          >
            {/* Tail with counter-circle */}
            <line x1="200" y1="246" x2="200" y2="274" stroke="#0F777A" strokeWidth="1.5" />
            <circle cx="200" cy="274" r="3.5" fill="#0F777A" />
            {/* Needle */}
            <line x1="200" y1="246" x2="200" y2="136" stroke="#0F777A" strokeWidth="1.5" />
            <circle cx="200" cy="136" r="2.5" fill="#0F777A" />
          </g>

          {/* Center Hub / Pinion */}
          <circle cx="200" cy="246" r="10" fill="#07383D" />
          <circle cx="200" cy="246" r="6" fill="#8BCDCF" />
          <circle cx="200" cy="246" r="3" fill="#0F777A" />

          {/* 8. Glass Curved Reflection Highlight Sheen */}
          <path
            d="M 108 200 C 130 148, 220 128, 282 172 C 298 184, 286 216, 260 210 C 200 196, 140 216, 108 200 Z"
            fill="url(#glassReflection)"
            pointerEvents="none"
          />
        </svg>
      </div>
    </div>
  );
};
