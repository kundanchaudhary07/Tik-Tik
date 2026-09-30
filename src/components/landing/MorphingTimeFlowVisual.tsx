// src/components/landing/MorphingTimeFlowVisual.tsx
import React, { useEffect, useState, useRef } from "react";

interface MorphingTimeFlowVisualProps {
  isReducedMotion: boolean;
  isRinging?: boolean;
  className?: string;
}

// Generates an ultra-smooth closed cubic Bézier SVG path from discrete control points
function generateSmoothClosedPath(points: Array<{ x: number; y: number }>): string {
  const n = points.length;
  if (n < 3) return "";

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;

  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    // Catmull-Rom tangents converted to cubic Bézier control points
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  d += " Z";
  return d;
}

export const MorphingTimeFlowVisual: React.FC<MorphingTimeFlowVisualProps> = ({
  isReducedMotion,
  isRinging = false,
  className = "",
}) => {
  // Harmonic time state for 60fps silky smooth continuous morphing and orbits
  const [time, setTime] = useState(0);
  const [ringPulse, setRingPulse] = useState(0);

  const animRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const pulseRef = useRef<number>(0);

  useEffect(() => {
    if (isReducedMotion) {
      setTime(3.2);
      return;
    }

    const animate = (now: number) => {
      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.1);
      lastTimeRef.current = now;

      // Pulse physics when alarm rings
      if (isRinging) {
        pulseRef.current = Math.min(pulseRef.current + dt * 3.5, 1.0);
      } else {
        pulseRef.current = Math.max(pulseRef.current - dt * 1.8, 0.0);
      }
      setRingPulse(pulseRef.current);

      // Continuous slow morphing cycle (~18s full cycle)
      setTime((prev) => prev + dt * 0.35);

      animRef.current = requestAnimationFrame(animate);
    };

    lastTimeRef.current = performance.now();
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) {
        cancelAnimationFrame(animRef.current);
      }
    };
  }, [isReducedMotion, isRinging]);

  // ViewBox: 1000 x 1000. Center is at (500, 500).
  // Clock diameter is ~380px (radius ~190px).
  // Our background elements extend generously between 260px and 450px radius (1.4x - 2.2x clock width)
  const cx = 500;
  const cy = 500;
  const t = time;
  const p = ringPulse;

  const NUM_POINTS = 36;

  // 1. Layer: Large Primary Fluid Morphing Shape (Rich Teal & Mint)
  // Radii oscillate between 290px and 420px, extending generously around the clock
  const primaryPoints = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (i * 2 * Math.PI) / NUM_POINTS;
    const r =
      330 +
      48 * Math.sin(2 * angle - t * 0.32) +
      36 * Math.cos(3 * angle + t * 0.28) +
      22 * Math.sin(4 * angle - t * 0.22) +
      14 * Math.cos(5 * angle + t * 0.18) +
      p * 26;
    primaryPoints.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  const primaryPath = generateSmoothClosedPath(primaryPoints);

  // 2. Layer: Secondary Counter-Flow Organic Shape (Translucent Mint & Frost)
  // Radii oscillate between 270px and 380px with a counter-phase frequency
  const secondaryPoints = [];
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (i * 2 * Math.PI) / NUM_POINTS;
    const r =
      295 +
      42 * Math.cos(2 * angle + t * 0.38 + 1.1) +
      32 * Math.sin(3 * angle - t * 0.3) +
      18 * Math.cos(4 * angle + t * 0.24) +
      p * 18;
    secondaryPoints.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  const secondaryPath = generateSmoothClosedPath(secondaryPoints);

  // 3. Layer: Inner Dimensional Core Flow (Deep Depth behind clock body)
  const innerPoints = [];
  const innerOffsetCx = cx + 16 * Math.cos(t * 0.25);
  const innerOffsetCy = cy + 16 * Math.sin(t * 0.25);
  for (let i = 0; i < NUM_POINTS; i++) {
    const angle = (i * 2 * Math.PI) / NUM_POINTS;
    const r =
      250 +
      34 * Math.sin(2 * angle + t * 0.44) +
      24 * Math.cos(3 * angle - t * 0.32);
    innerPoints.push({
      x: innerOffsetCx + r * Math.cos(angle),
      y: innerOffsetCy + r * Math.sin(angle),
    });
  }
  const innerPath = generateSmoothClosedPath(innerPoints);

  // 4. Subtle Orbital Nodes (3 scheduling / milestone dots floating slowly along time tracks)
  const orbit1Angle = t * 0.22;
  const orbit1R = 365 + 15 * Math.sin(t * 0.3);
  const orbit1X = cx + orbit1R * Math.cos(orbit1Angle);
  const orbit1Y = cy + orbit1R * Math.sin(orbit1Angle);

  const orbit2Angle = -t * 0.17 + 2.1;
  const orbit2R = 310 + 12 * Math.cos(t * 0.25);
  const orbit2X = cx + orbit2R * Math.cos(orbit2Angle);
  const orbit2Y = cy + orbit2R * Math.sin(orbit2Angle);

  const orbit3Angle = t * 0.14 + 4.2;
  const orbit3R = 415 + 18 * Math.sin(t * 0.2);
  const orbit3X = cx + orbit3R * Math.cos(orbit3Angle);
  const orbit3Y = cy + orbit3R * Math.sin(orbit3Angle);

  return (
    <div
      className={`absolute inset-0 flex items-center justify-center pointer-events-none select-none ${className}`}
      style={{
        background: "transparent",
        border: "none",
        boxShadow: "none",
        outline: "none",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 1000 1000"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="w-[145%] h-[145%] sm:w-[155%] sm:h-[155%] lg:w-[170%] lg:h-[170%] max-w-[860px] max-h-[860px] block overflow-visible"
        style={{
          background: "transparent",
          border: "none",
          boxShadow: "none",
          outline: "none",
          transform: "translateZ(0)",
        }}
      >
        <defs>
          {/* Broad, non-clipping Gaussian blur for atmospheric blending */}
          <filter id="timeFlowGlow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="38" />
          </filter>

          <filter id="softRibbonBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="16" />
          </filter>

          {/* 1. Ambient Radial Depth Aura (Fades seamlessly to 0 opacity at perimeter) */}
          <radialGradient id="ambientTimeAura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#8BCDCF" stopOpacity="0.45" />
            <stop offset="35%" stopColor="#B8DEDF" stopOpacity="0.32" />
            <stop offset="65%" stopColor="#DDF2F2" stopOpacity="0.18" />
            <stop offset="85%" stopColor="#E6F6F6" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#F7FCFC" stopOpacity="0" />
          </radialGradient>

          {/* 2. Primary Fluid Flow Ribbon Gradient (Rich Teal & Mint) */}
          <linearGradient id="primaryFlowGrad" x1="15%" y1="10%" x2="85%" y2="90%">
            <stop offset="0%" stopColor="#8BCDCF" stopOpacity="0.55" />
            <stop offset="30%" stopColor="#0F777A" stopOpacity="0.45" />
            <stop offset="70%" stopColor="#07383D" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#8BCDCF" stopOpacity="0.22" />
          </linearGradient>

          {/* 3. Secondary Flow Gradient (Light Frost & Mint) */}
          <linearGradient id="secondaryFlowGrad" x1="90%" y1="15%" x2="10%" y2="85%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="40%" stopColor="#8BCDCF" stopOpacity="0.42" />
            <stop offset="80%" stopColor="#0F777A" stopOpacity="0.30" />
            <stop offset="100%" stopColor="#DDF2F2" stopOpacity="0.15" />
          </linearGradient>

          {/* 4. Core Depth Gradient */}
          <linearGradient id="coreDepthGrad" x1="20%" y1="80%" x2="80%" y2="20%">
            <stop offset="0%" stopColor="#07383D" stopOpacity="0.35" />
            <stop offset="60%" stopColor="#0F777A" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#8BCDCF" stopOpacity="0.12" />
          </linearGradient>
        </defs>

        {/* LAYER 1: Wide Ambient Atmospheric Aura (Soft background light that naturally bleeds into page) */}
        <circle
          cx={cx}
          cy={cy}
          r={440 + p * 30}
          fill="url(#ambientTimeAura)"
          filter="url(#timeFlowGlow)"
        />

        {/* LAYER 2: Primary Large Morphing Fluid Shape (Soft Blurred Wings extending 1.6x - 2x clock) */}
        <path
          d={primaryPath}
          fill="url(#primaryFlowGrad)"
          filter="url(#softRibbonBlur)"
        />

        {/* LAYER 3: Crisper Secondary Fluid Loop (Layered depth and counter-motion) */}
        <path
          d={secondaryPath}
          fill="url(#secondaryFlowGrad)"
          stroke="#8BCDCF"
          strokeWidth="1.2"
          strokeOpacity="0.35"
        />

        {/* LAYER 4: Deep Inner Flow (Sits right behind alarm body) */}
        <path
          d={innerPath}
          fill="url(#coreDepthGrad)"
          stroke="#0F777A"
          strokeWidth="1"
          strokeOpacity="0.2"
        />

        {/* LAYER 5: Thin Curved Time / Orbit Lines (Suggesting Time Windows, Schedule Cadence) */}
        {/* Outer Orbit Track */}
        <circle
          cx={cx}
          cy={cy}
          r="365"
          fill="none"
          stroke="#0F777A"
          strokeWidth="1.2"
          strokeOpacity="0.22"
          strokeDasharray="4 10"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${t * 4}deg)`,
          }}
        />

        {/* Middle Elliptical Time Arc */}
        <ellipse
          cx={cx}
          cy={cy}
          rx="320"
          ry="285"
          fill="none"
          stroke="#8BCDCF"
          strokeWidth="1"
          strokeOpacity="0.35"
          strokeDasharray="6 8"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${-t * 3 + 25}deg)`,
          }}
        />

        {/* Inner Cadence Arc */}
        <circle
          cx={cx}
          cy={cy}
          r="255"
          fill="none"
          stroke="#0F777A"
          strokeWidth="1.4"
          strokeOpacity="0.25"
          strokeDasharray="90 140"
          strokeLinecap="round"
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            transform: `rotate(${t * 6}deg)`,
          }}
        />

        {/* LAYER 6: Subtle Floating Milestone Nodes along Orbit Tracks */}
        {/* Node 1 */}
        <g transform={`translate(${orbit1X}, ${orbit1Y})`}>
          <circle r="4.5" fill="#0F777A" fillOpacity="0.75" />
          <circle r="9" fill="none" stroke="#8BCDCF" strokeWidth="1.2" strokeOpacity="0.4" />
        </g>

        {/* Node 2 */}
        <g transform={`translate(${orbit2X}, ${orbit2Y})`}>
          <circle r="3.5" fill="#8BCDCF" fillOpacity="0.85" />
          <circle r="7.5" fill="none" stroke="#0F777A" strokeWidth="1" strokeOpacity="0.35" />
        </g>

        {/* Node 3 */}
        <g transform={`translate(${orbit3X}, ${orbit3Y})`}>
          <circle r="4" fill="#07383D" fillOpacity="0.65" />
          <circle r="8" fill="none" stroke="#8BCDCF" strokeWidth="1" strokeOpacity="0.3" />
        </g>

        {/* Additional Subtle Floating Stardust Particles */}
        <circle
          cx={cx + 280 * Math.cos(t * 0.18 + 0.8)}
          cy={cy + 240 * Math.sin(t * 0.18 + 0.8)}
          r="2.5"
          fill="#0F777A"
          fillOpacity="0.45"
        />
        <circle
          cx={cx + 340 * Math.cos(-t * 0.15 + 3.2)}
          cy={cy + 300 * Math.sin(-t * 0.15 + 3.2)}
          r="2.2"
          fill="#8BCDCF"
          fillOpacity="0.55"
        />
        <circle
          cx={cx + 220 * Math.cos(t * 0.22 + 4.5)}
          cy={cy + 260 * Math.sin(t * 0.22 + 4.5)}
          r="2"
          fill="#07383D"
          fillOpacity="0.4"
        />

        {/* LAYER 7: Dynamic Ring Pulse Resonance Wave on Ringing */}
        {p > 0.02 && (
          <>
            <circle
              cx={cx}
              cy={cy}
              r={250 + p * 120}
              stroke="#8BCDCF"
              strokeWidth="2"
              strokeOpacity={(1 - p) * 0.75}
              fill="none"
            />
            <circle
              cx={cx}
              cy={cy}
              r={230 + p * 180}
              stroke="#0F777A"
              strokeWidth="1.5"
              strokeOpacity={(1 - p) * 0.55}
              fill="none"
            />
          </>
        )}
      </svg>
    </div>
  );
};
