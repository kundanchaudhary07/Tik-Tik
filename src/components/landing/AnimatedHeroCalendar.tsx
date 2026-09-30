// src/components/landing/AnimatedHeroCalendar.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";

interface AnimatedHeroCalendarProps {
  isReducedMotion: boolean;
  className?: string;
}

export const AnimatedHeroCalendar: React.FC<AnimatedHeroCalendarProps> = ({
  isReducedMotion,
  className = "",
}) => {
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [isManualTriggered, setIsManualTriggered] = useState(false);

  // Automatically update if tab is open past midnight
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      if (now.getDate() !== currentDate.getDate()) {
        setCurrentDate(now);
      }
    }, 60000);
    return () => clearInterval(timer);
  }, [currentDate]);

  // Dynamically calculate actual calendar details from currentDate
  const calendarData = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth(); // 0-indexed
    const today = currentDate.getDate();

    // Standard localized full month name (e.g., "September")
    const monthName = currentDate.toLocaleString("default", { month: "long" });

    // Total days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();

    // Day of the week for 1st of month (Monday = 0, Sunday = 6)
    const firstDayIndex = new Date(year, month, 1).getDay();
    const mondayOffset = (firstDayIndex + 6) % 7;

    // Weekday abbreviation column headers
    const weekdays = ["M", "T", "W", "T", "F", "S", "S"];

    // Build day items
    const days: Array<{
      date: number;
      col: number;
      row: number;
      isToday: boolean;
    }> = [];

    for (let d = 1; d <= totalDays; d++) {
      const slotIndex = mondayOffset + d - 1;
      const col = slotIndex % 7;
      const row = Math.floor(slotIndex / 7);
      days.push({
        date: d,
        col,
        row,
        isToday: d === today,
      });
    }

    const totalRows = Math.max(5, Math.ceil((mondayOffset + totalDays) / 7));

    return {
      year,
      monthName,
      today,
      weekdays,
      days,
      totalRows,
    };
  }, [currentDate]);

  const handleClick = useCallback(() => {
    if (isReducedMotion) return;
    setIsManualTriggered(true);
    setTimeout(() => setIsManualTriggered(false), 2400);
  }, [isReducedMotion]);

  // Coordinate math for 7 columns across width 210
  // Left margin 26, right margin 184 => width 158 => step 26.3px
  const getColX = (col: number) => 26 + col * 26.33;

  // Coordinate math for rows
  // Weekday row at y = 88. Date row 0 at y = 108. Step 18.5px
  const getRowY = (row: number) => 108 + row * 18.5;

  const shouldAnimate = !isReducedMotion || isManualTriggered;

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      title={`Tik Tik calendar: ${calendarData.monthName} ${calendarData.today}, ${calendarData.year} (click to highlight)`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`relative select-none cursor-pointer focus:outline-none transition-transform duration-300 hover:scale-[1.03] ${className}`}
      style={{
        aspectRatio: "210 / 240",
        filter: "drop-shadow(0 16px 28px rgba(7, 56, 61, 0.12))",
      }}
    >
      <div className="relative w-full h-full">
        {/* 1. Dynamic Responsive Ground Shadow (responds physically to vertical lift) */}
        <div
          className="absolute inset-0 pointer-events-none"
          aria-hidden="true"
        >
          <svg viewBox="0 0 210 240" fill="none" className="w-full h-full block">
            <ellipse
              cx="105"
              cy="231"
              rx="82"
              ry="7"
              fill="#07383D"
              className={shouldAnimate ? "animate-[heroCalendarShadow_5.5s_ease-in-out_infinite]" : "opacity-12"}
            />
          </svg>
        </div>

        {/* 2. Physical Desk Calendar Object with Natural Vertical Float */}
        <div
          className={`w-full h-full ${
            shouldAnimate ? "animate-[heroCalendarCycle_5.5s_ease-in-out_infinite]" : ""
          }`}
        >
          <svg
            viewBox="0 0 210 240"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-full h-full block"
            aria-hidden="true"
          >
            <defs>
              {/* Metallic Twin-wire Spiral Gradient */}
              <linearGradient id="calWireGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="40%" stopColor="#8BCDCF" />
                <stop offset="100%" stopColor="#0F777A" />
              </linearGradient>

              {/* Dynamic Header Teal Gradient */}
              <linearGradient id="calHeaderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#0F777A" />
                <stop offset="100%" stopColor="#07383D" />
              </linearGradient>

              {/* Front Sheet Surface Gradient */}
              <linearGradient id="calSheetGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#F7FCFC" />
              </linearGradient>

              {/* Paper Stack Depth Gradient */}
              <linearGradient id="calStackGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#E4F5F5" />
                <stop offset="100%" stopColor="#DDF2F2" />
              </linearGradient>
            </defs>

            {/* Dimensional Stack: Behind Sheet 2 (Physical paper block depth) */}
            <rect
              x="23"
              y="32"
              width="164"
              height="188"
              rx="14"
              fill="url(#calStackGrad)"
              stroke="#8BCDCF"
              strokeWidth="0.8"
              strokeOpacity="0.75"
            />

            {/* Dimensional Stack: Behind Sheet 1 */}
            <rect
              x="20.5"
              y="29"
              width="169"
              height="191"
              rx="14"
              fill="#F0FAF9"
              stroke="#B8DEDF"
              strokeWidth="0.8"
              strokeOpacity="0.85"
            />

            {/* Primary Front Calendar Page */}
            <rect
              x="18"
              y="26"
              width="174"
              height="194"
              rx="14"
              fill="url(#calSheetGrad)"
              stroke="#0F777A"
              strokeWidth="1.2"
              strokeOpacity="0.2"
            />

            {/* Top Teal Header Banner */}
            <path
              d="M 18 40 C 18 32.3 24.3 26 32 26 L 178 26 C 185.7 26 192 32.3 192 40 L 192 72 L 18 72 Z"
              fill="url(#calHeaderGrad)"
            />

            {/* Header Top Highlight Sheen */}
            <line
              x1="32"
              y1="28"
              x2="178"
              y2="28"
              stroke="#8BCDCF"
              strokeWidth="1.2"
              strokeOpacity="0.6"
              strokeLinecap="round"
            />

            {/* Dynamic Month & Year Typography (Driven by JavaScript new Date()) */}
            <text
              x="105"
              y="54"
              textAnchor="middle"
              fill="#FFFFFF"
              fontSize="12.5"
              fontWeight="700"
              letterSpacing="0.8"
              fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
            >
              {calendarData.monthName} {calendarData.year}
            </text>

            {/* Metallic Ring Bindings (4 twin wire spirals looping through punch holes) */}
            {[45, 85, 125, 165].map((rx) => (
              <g key={rx}>
                {/* Hole punch cavity shadow */}
                <ellipse cx={rx} cy="36" rx="3.5" ry="2.2" fill="#07383D" fillOpacity="0.3" />
                {/* Spiral Wire Loop */}
                <path
                  d={`M ${rx - 4} 19 C ${rx - 4} 11, ${rx + 4} 11, ${rx + 4} 19 L ${rx + 4} 37 C ${rx + 4} 40, ${rx - 4} 40, ${rx - 4} 37 Z`}
                  fill="url(#calWireGrad)"
                  stroke="#07383D"
                  strokeWidth="0.8"
                />
                {/* Specular Glint */}
                <line
                  x1={rx - 0.5}
                  y1="14"
                  x2={rx - 0.5}
                  y2="34"
                  stroke="#FFFFFF"
                  strokeWidth="0.75"
                  strokeOpacity="0.8"
                  strokeLinecap="round"
                />
              </g>
            ))}

            {/* Weekday Column Headers (MON - SUN) */}
            <g
              fontSize="8"
              fontWeight="700"
              fill="#0F777A"
              fillOpacity="0.75"
              textAnchor="middle"
              fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
            >
              {calendarData.weekdays.map((wd, colIdx) => (
                <text key={colIdx} x={getColX(colIdx)} y="88">
                  {wd}
                </text>
              ))}
            </g>

            {/* Subtle Divider Line beneath Weekdays */}
            <line
              x1="26"
              y1="94"
              x2="184"
              y2="94"
              stroke="#DDF2F2"
              strokeWidth="0.8"
            />

            {/* Dynamic Monthly Calendar Grid Dates */}
            {calendarData.days.map((dayItem) => {
              const cx = getColX(dayItem.col);
              const cy = getRowY(dayItem.row);

              if (dayItem.isToday) {
                // Today's Date: Dynamic Animated Marker with Soft Pulse & Checkmark
                return (
                  <g key={dayItem.date} transform={`translate(${cx}, ${cy})`}>
                    {/* Outer Soft Pulse Glow Circle */}
                    <circle
                      cx="0"
                      cy="-3.5"
                      r="12.5"
                      fill="#8BCDCF"
                      className={
                        shouldAnimate
                          ? "animate-[heroCalendarTodayPulse_5.5s_ease-in-out_infinite]"
                          : "opacity-35"
                      }
                    />

                    {/* Primary Teal Indicator Disk */}
                    <circle cx="0" cy="-3.5" r="9.5" fill="#0F777A" />

                    {/* Date Number */}
                    <text
                      x="0"
                      y="0"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="9"
                      fontWeight="800"
                      fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
                    >
                      {dayItem.date}
                    </text>

                    {/* Subtle Completion Checkmark Badge */}
                    <g
                      className={
                        shouldAnimate
                          ? "animate-[heroCalendarCheckFade_5.5s_ease-in-out_infinite]"
                          : "opacity-0"
                      }
                      transform="translate(6, -9)"
                    >
                      <circle cx="0" cy="0" r="4.2" fill="#07383D" stroke="#FFFFFF" strokeWidth="0.8" />
                      <path
                        d="M -2 0 L -0.6 1.4 L 2 -1.2"
                        stroke="#8BCDCF"
                        strokeWidth="1.1"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </g>
                  </g>
                );
              }

              // Standard Inactive Dates: Clean, Crisp Typography
              return (
                <text
                  key={dayItem.date}
                  x={cx}
                  y={cy}
                  textAnchor="middle"
                  fill="#07383D"
                  fillOpacity={dayItem.col >= 5 ? "0.45" : "0.78"}
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
                >
                  {dayItem.date}
                </text>
              );
            })}

            {/* Bottom Right Physical Paper Corner Curl Detail */}
            <path
              d="M 172 220 L 192 200 L 192 208 C 192 214.6 186.6 220 180 220 Z"
              fill="#DDF2F2"
              stroke="#8BCDCF"
              strokeWidth="0.6"
              strokeOpacity="0.6"
            />
          </svg>
        </div>
      </div>
    </div>
  );
};
