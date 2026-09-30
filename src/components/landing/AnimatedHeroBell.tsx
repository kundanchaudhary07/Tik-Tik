// src/components/landing/AnimatedHeroBell.tsx
import React, { useState, useCallback } from "react";

interface AnimatedHeroBellProps {
  isReducedMotion: boolean;
  className?: string;
}

export const AnimatedHeroBell: React.FC<AnimatedHeroBellProps> = ({
  isReducedMotion,
  className = "",
}) => {
  const [isManualTriggered, setIsManualTriggered] = useState(false);

  const handleClick = useCallback(() => {
    if (isReducedMotion) return;
    setIsManualTriggered(true);
    setTimeout(() => setIsManualTriggered(false), 1800);
  }, [isReducedMotion]);

  const shouldAnimate = !isReducedMotion || isManualTriggered;

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title="Tik Tik reminder bell: Timely notification (click to ring)"
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`relative select-none cursor-pointer focus:outline-none transition-transform duration-300 hover:scale-[1.03] ${className}`}
      style={{
        aspectRatio: "170 / 200",
        filter: "drop-shadow(0 16px 28px rgba(7, 56, 61, 0.12))",
      }}
    >
      <div className="relative w-full h-full flex items-center justify-center">
        {/* 1. Dynamic Responsive Ground Shadow underneath the Bell */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          <svg viewBox="0 0 170 200" fill="none" className="w-full h-full block">
            <ellipse
              cx="85"
              cy="180"
              rx="54"
              ry="6.5"
              fill="#07383D"
              className={shouldAnimate ? "animate-[heroBellShadow_5.5s_ease-in-out_infinite]" : "opacity-12"}
            />
          </svg>
        </div>

        {/* 2. Visual Acoustic Sound Waves: ) 🔔 ( => )) 🔔 (( => ))) 🔔 ((( */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          <svg viewBox="0 0 170 200" fill="none" className="w-full h-full block">
            {/* Stage 1: Inner Wave Arcs ) ( */}
            <g className={shouldAnimate ? "animate-[heroBellAcousticWave1_5.5s_ease-out_infinite]" : "opacity-0"}>
              <path
                d="M 38 88 C 32 98, 32 118, 38 128"
                stroke="#0F777A"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 132 88 C 138 98, 138 118, 132 128"
                stroke="#0F777A"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            {/* Stage 2: Middle Wave Arcs )) (( */}
            <g className={shouldAnimate ? "animate-[heroBellAcousticWave2_5.5s_ease-out_infinite]" : "opacity-0"}>
              <path
                d="M 28 80 C 19 96, 19 124, 28 140"
                stroke="#8BCDCF"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M 142 80 C 151 96, 151 124, 142 140"
                stroke="#8BCDCF"
                strokeWidth="1.8"
                strokeLinecap="round"
                fill="none"
              />
            </g>

            {/* Stage 3: Outer Wave Arcs ))) ((( */}
            <g className={shouldAnimate ? "animate-[heroBellAcousticWave3_5.5s_ease-out_infinite]" : "opacity-0"}>
              <path
                d="M 18 72 C 7 92, 7 132, 18 150"
                stroke="#0F777A"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeOpacity="0.8"
                fill="none"
              />
              <path
                d="M 152 72 C 163 92, 163 132, 152 150"
                stroke="#0F777A"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeOpacity="0.8"
                fill="none"
              />
            </g>
          </svg>
        </div>

        {/* 3. Physical Bell Object (Subtle Resting Float + Natural Pendulum Ring Swing) */}
        <div
          className={`w-full h-full ${
            shouldAnimate ? "animate-[heroBellFloat_5.5s_ease-in-out_infinite]" : ""
          }`}
        >
          <svg
            viewBox="0 0 170 200"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full block"
            aria-hidden="true"
          >
            <defs>
              {/* Teal Bell Dome Gradient */}
              <linearGradient id="bellDomeGrad" x1="20%" y1="10%" x2="80%" y2="90%">
                <stop offset="0%" stopColor="#0F777A" />
                <stop offset="50%" stopColor="#0B5C5F" />
                <stop offset="100%" stopColor="#07383D" />
              </linearGradient>

              {/* Metallic Loop Ring Gradient */}
              <linearGradient id="bellLoopGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="45%" stopColor="#8BCDCF" />
                <stop offset="100%" stopColor="#0F777A" />
              </linearGradient>

              {/* Flared Rim Sheen Gradient */}
              <linearGradient id="bellRimGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#07383D" />
                <stop offset="25%" stopColor="#0F777A" />
                <stop offset="50%" stopColor="#8BCDCF" />
                <stop offset="75%" stopColor="#0F777A" />
                <stop offset="100%" stopColor="#07383D" />
              </linearGradient>
            </defs>

            {/* Bell Swing Group (Pivot at Top Suspension Mount 85, 34) */}
            <g
              style={{ transformOrigin: "85px 34px" }}
              className={shouldAnimate ? "animate-[heroBellSwing_5.5s_ease-in-out_infinite]" : ""}
            >
              {/* Top Suspension Loop Handle */}
              <circle
                cx="85"
                cy="34"
                r="9.5"
                stroke="#07383D"
                strokeWidth="2.5"
                fill="none"
              />
              <circle
                cx="85"
                cy="34"
                r="7"
                stroke="#8BCDCF"
                strokeWidth="1"
                strokeOpacity="0.6"
                fill="none"
              />

              {/* Collar Mount */}
              <rect
                x="78"
                y="42"
                width="14"
                height="6"
                rx="2.5"
                fill="#07383D"
              />
              <rect
                x="79.5"
                y="43"
                width="11"
                height="2"
                rx="1"
                fill="#8BCDCF"
                fillOpacity="0.7"
              />

              {/* Clapper (Counter-swings during bell motion for physical realism) */}
              <g
                style={{ transformOrigin: "85px 120px" }}
                className={shouldAnimate ? "animate-[heroBellClapper_5.5s_ease-in-out_infinite]" : ""}
              >
                <line
                  x1="85"
                  y1="120"
                  x2="85"
                  y2="152"
                  stroke="#07383D"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
                <circle
                  cx="85"
                  cy="152"
                  r="8.5"
                  fill="#8BCDCF"
                  stroke="#07383D"
                  strokeWidth="2"
                />
                <circle
                  cx="83"
                  cy="150"
                  r="2.8"
                  fill="#FFFFFF"
                  fillOpacity="0.8"
                />
              </g>

              {/* Main Bell Body Dome (Sculpted physical acoustic curve) */}
              <path
                d="M 79 48 C 79 48, 66 76, 56 102 C 48 120, 38 133, 34 137 C 32 140, 35 143, 40 143 L 130 143 C 135 143, 138 140, 136 137 C 132 133, 122 120, 114 102 C 104 76, 91 48, 91 48 Z"
                fill="url(#bellDomeGrad)"
                stroke="#07383D"
                strokeWidth="2"
              />

              {/* Flared Bottom Rim Lip */}
              <ellipse
                cx="85"
                cy="143"
                rx="48"
                ry="6.5"
                fill="url(#bellRimGrad)"
                stroke="#07383D"
                strokeWidth="1.5"
              />

              {/* Hollow Underside Cavity Shadow */}
              <ellipse
                cx="85"
                cy="142"
                rx="43"
                ry="4.5"
                fill="#07383D"
                fillOpacity="0.45"
              />

              {/* Specular Curved Highlight on Left Bell Body */}
              <path
                d="M 81 54 C 81 54, 70 76, 62 100 C 56 116, 49 128, 45 134"
                stroke="#FFFFFF"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeOpacity="0.45"
                fill="none"
              />

              {/* Secondary Cyan Sheen Arc */}
              <path
                d="M 85 56 C 85 56, 76 78, 70 102"
                stroke="#8BCDCF"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeOpacity="0.38"
                fill="none"
              />

              {/* 4. Small Teal Notification Dot Badge (Illuminates & pulses during reminder) */}
              <g
                transform="translate(120, 48)"
                className={shouldAnimate ? "animate-[heroBellDot_5.5s_ease-in-out_infinite]" : "opacity-0"}
              >
                {/* Soft Glowing Aura */}
                <circle cx="0" cy="0" r="7.5" fill="#8BCDCF" fillOpacity="0.5" />
                {/* Core Indicator Dot */}
                <circle cx="0" cy="0" r="4.5" fill="#0F777A" stroke="#FFFFFF" strokeWidth="1.4" />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
};
