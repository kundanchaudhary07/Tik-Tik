// src/components/landing/LandingPage.tsx
import React, { useState, useEffect } from "react";
import { Check, ArrowRight } from "lucide-react";
import { CinematicAlarmClock } from "./CinematicAlarmClock";
import { MorphingTimeFlowVisual } from "./MorphingTimeFlowVisual";
import { TikTikLogo } from "../common/TikTikLogo";

interface LandingPageProps {
  onSignIn: () => void;
  onRegister?: () => void;
  onAbout?: () => void;
}

const getDaylightState = (hours: number) => {
  // Morning: 5am - 12pm
  if (hours >= 5 && hours < 12) {
    return {
      period: "morning",
      bgGradient: "radial-gradient(ellipse at 50% 12%, #E4F5F5 0%, #EFF9F9 42%, #F7FCFC 100%)",
      auraColor: "rgba(184, 222, 223, 0.55)",
    };
  }
  // Afternoon: 12pm - 5pm (12-17)
  if (hours >= 12 && hours < 17) {
    return {
      period: "afternoon",
      bgGradient: "radial-gradient(ellipse at 50% 12%, #D8F1F1 0%, #E9F7F7 45%, #F7FCFC 100%)",
      auraColor: "rgba(139, 205, 207, 0.50)",
    };
  }
  // Evening: 5pm - 9pm (17-21)
  if (hours >= 17 && hours < 21) {
    return {
      period: "evening",
      bgGradient: "radial-gradient(ellipse at 50% 12%, #CEECEC 0%, #E6F6F6 45%, #F7FCFC 100%)",
      auraColor: "rgba(15, 119, 122, 0.35)",
    };
  }
  // Night / Dawn: 9pm - 5am
  return {
    period: "night",
    bgGradient: "radial-gradient(ellipse at 50% 12%, #C5E9E9 0%, #E0F3F3 48%, #F7FCFC 100%)",
    auraColor: "rgba(15, 119, 122, 0.28)",
  };
};

export const LandingPage: React.FC<LandingPageProps> = ({
  onSignIn,
  onRegister,
  onAbout,
}) => {
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [daylight, setDaylight] = useState(() =>
    getDaylightState(new Date().getHours())
  );
  const [isRinging, setIsRinging] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
      setIsReducedMotion(mediaQuery.matches);
      const listener = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
      mediaQuery.addEventListener("change", listener);
      return () => mediaQuery.removeEventListener("change", listener);
    }
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDaylight(getDaylightState(new Date().getHours()));
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Periodic subtle ring demonstration every 14 seconds
  useEffect(() => {
    if (isReducedMotion) return;

    const ringInterval = setInterval(() => {
      setIsRinging(true);
      const stopTimer = setTimeout(() => {
        setIsRinging(false);
      }, 1400);
      return () => clearTimeout(stopTimer);
    }, 14000);

    return () => clearInterval(ringInterval);
  }, [isReducedMotion]);

  const handleRingToggle = () => {
    if (isReducedMotion) return;
    setIsRinging(true);
    setTimeout(() => setIsRinging(false), 1400);
  };

  return (
    <div
      className="homepage-scope min-h-screen flex flex-col selection:bg-[#B8DEDF] selection:text-[#07383D]"
      style={{
        background: daylight.bgGradient,
        color: "var(--text-primary)",
      }}
    >
      {/* 1. HEADER: FIXED TRANSPARENT RECTANGULAR NAVIGATION BAR */}
      <header
        className="fixed top-0 left-0 right-0 z-50 w-full border-b border-[#0F777A]/15 transition-colors"
        style={{
          backgroundColor: "rgba(240, 249, 249, 0.70)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
        }}
      >
        <div className="max-w-[1440px] mx-auto px-6 sm:px-8 lg:px-12 h-16 sm:h-20 flex items-center justify-between">
          {/* Left: Brand Identity (enhanced logo & slightly larger brand text) */}
          <div
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center gap-3 cursor-pointer"
          >
            <TikTikLogo
              size={38}
              showText={true}
              textClassName="text-[22px] sm:text-2xl font-bold tracking-tight text-[#07383D]"
              isReducedMotion={isReducedMotion}
            />
          </div>

          {/* Right: Navigation actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={onAbout}
              className="text-xs sm:text-sm font-semibold tracking-wide text-[#07383D] hover:text-[#0F777A] px-2.5 py-1.5 transition-colors cursor-pointer"
            >
              About
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="text-xs sm:text-sm font-semibold tracking-wider uppercase px-4 sm:px-5 py-2 sm:py-2.5 rounded-full border border-[#0F777A]/30 text-[#07383D] hover:bg-[#0F777A] hover:text-white transition-all cursor-pointer shadow-2xs"
            >
              Sign in
            </button>
          </div>
        </div>
      </header>

      {/* 2. HERO: PADDED TOP SO FIRST HERO CONTENT STARTS BELOW FIXED RECTANGULAR HEADER */}
      <section className="relative w-full pt-24 sm:pt-28 lg:pt-32 pb-12 sm:pb-16 overflow-hidden">
        {/* Subtle Ambient Background Rings */}
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden opacity-20"
          aria-hidden="true"
        >
          <div
            className={`w-[600px] sm:w-[840px] lg:w-[1040px] aspect-square rounded-full border border-[#0F777A]/20 ${
              isReducedMotion ? "" : "animate-[ambientBreathe_14s_ease-in-out_infinite]"
            }`}
          />
          <div
            className={`absolute w-[440px] sm:w-[620px] lg:w-[780px] aspect-square rounded-full border border-dashed border-[#8BCDCF]/25 ${
              isReducedMotion ? "" : "animate-[ambientBreathe_10s_ease-in-out_infinite]"
            }`}
          />
        </div>

        <div className="max-w-[1440px] mx-auto px-6 sm:px-8 lg:px-12 w-full grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-14 items-start z-10">
          {/* Left Hero Content: Starts directly with headline, no decorative badges */}
          <div className="lg:col-span-6 flex flex-col text-left z-20 max-w-[560px] pt-1 sm:pt-2">
            <h1 className="text-4xl sm:text-5xl lg:text-[56px] xl:text-[62px] font-extrabold tracking-tight leading-[1.05] text-left">
              <span className="block text-[#07383D]">Plan your day.</span>
              <span className="block text-[#0F777A] mt-1">Get things done.</span>
            </h1>

            <p className="mt-5 text-base sm:text-lg lg:text-[20px] leading-relaxed text-[#4F7073] max-w-[500px]">
              Organize tasks, deadlines, reminders, and follow-ups in one place.
            </p>

            {/* Standard Practical Product Capabilities */}
            <div className="mt-8 space-y-3.5">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#DDF2F2] text-[#0F777A] mt-0.5 shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span className="text-sm sm:text-base font-medium text-[#07383D]">
                  Break complex work into actionable subtasks.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#DDF2F2] text-[#0F777A] mt-0.5 shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span className="text-sm sm:text-base font-medium text-[#07383D]">
                  Set realistic time windows for focused work.
                </span>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center bg-[#DDF2F2] text-[#0F777A] mt-0.5 shrink-0">
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span className="text-sm sm:text-base font-medium text-[#07383D]">
                  Keep important deadlines and reminders on track.
                </span>
              </div>
            </div>

            {/* START FOR FREE Button inside the vacant area below */}
            <div className="mt-8">
              <button
                type="button"
                onClick={onRegister || onSignIn}
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider bg-[#0F777A] text-white hover:bg-[#07383D] focus:outline-none focus:ring-2 focus:ring-[#0F777A] focus:ring-offset-2 transition-all cursor-pointer shadow-xs"
              >
                START FOR FREE
              </button>
            </div>
          </div>

          {/* Right Hero Scene: Morphing Vector Layer + Dominant Alarm */}
          <div className="lg:col-span-6 relative flex items-center justify-center w-full min-h-[440px] sm:min-h-[500px] lg:min-h-[560px]">
            {/* Unified Alarm Animation Group: Scaled ~12-14% and shifted upward ~48px on desktop */}
            <div className="relative w-full h-full flex items-center justify-center -translate-y-4 sm:-translate-y-8 lg:-translate-y-12 scale-[1.06] sm:scale-[1.10] lg:scale-[1.13] origin-center">
              {/* 100% Vector Morphing SVG Layer (Zero Rectangular Box, True Alpha) */}
              <MorphingTimeFlowVisual
                isReducedMotion={isReducedMotion}
                isRinging={isRinging}
                className="z-0 w-full h-full"
              />

              {/* Foreground Alarm Clock */}
              <div className="relative z-10 w-full flex items-center justify-center">
                <CinematicAlarmClock
                  auraColor={daylight.auraColor}
                  isReducedMotion={isReducedMotion}
                  isRinging={isRinging}
                  onRingToggle={handleRingToggle}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. FUNCTIONAL PRODUCT OVERVIEW (PLAN · TRACK · COMPLETE) */}
      <section className="py-12 sm:py-16 px-6 sm:px-8 lg:px-12 max-w-[1440px] mx-auto w-full z-10">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
          {/* Plan */}
          <div className="p-7 sm:p-8 rounded-3xl border border-[#B8DEDF]/60 bg-white/75 backdrop-blur-sm shadow-2xs">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0F777A] block mb-3">
              Plan
            </span>
            <h3 className="text-xl font-bold text-[#07383D]">
              Set tasks and deadlines.
            </h3>
            <p className="mt-2 text-sm text-[#4F7073] leading-relaxed">
              Organize daily commitments into manageable steps and schedule when work happens.
            </p>
          </div>

          {/* Track */}
          <div className="p-7 sm:p-8 rounded-3xl border border-[#B8DEDF]/60 bg-white/75 backdrop-blur-sm shadow-2xs">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0F777A] block mb-3">
              Track
            </span>
            <h3 className="text-xl font-bold text-[#07383D]">
              Keep reminders in view.
            </h3>
            <p className="mt-2 text-sm text-[#4F7073] leading-relaxed">
              Stay synchronized with punctual notifications and follow-ups without clutter.
            </p>
          </div>

          {/* Complete */}
          <div className="p-7 sm:p-8 rounded-3xl border border-[#B8DEDF]/60 bg-white/75 backdrop-blur-sm shadow-2xs">
            <span className="text-xs font-bold uppercase tracking-widest text-[#0F777A] block mb-3">
              Complete
            </span>
            <h3 className="text-xl font-bold text-[#07383D]">
              Keep progress moving.
            </h3>
            <p className="mt-2 text-sm text-[#4F7073] leading-relaxed">
              Resolve milestones with clear confirmation and conclude each day with peace of mind.
            </p>
          </div>
        </div>
      </section>

      {/* 4. PRODUCT SUMMARY */}
      <section className="py-10 sm:py-16 px-6 sm:px-8 lg:px-12 max-w-[1440px] mx-auto w-full z-10">
        <div className="p-8 sm:p-12 rounded-3xl border border-[#B8DEDF]/70 bg-white/80 backdrop-blur-md shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-xl text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#07383D]">
              Plan your day. Stay on track.
            </h2>
            <p className="mt-2 text-sm sm:text-base text-[#4F7073] leading-relaxed">
              Keep tasks, deadlines, reminders, and follow-ups in one place.
            </p>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer shadow-xs"
            >
              <span>Sign in</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* 5. VISUAL WORD STRIP: FOCUS */}
      <section
        className="w-full py-8 sm:py-14 lg:py-16 flex items-center justify-center overflow-hidden pointer-events-none select-none z-10"
        aria-hidden="true"
        style={{ background: "transparent" }}
      >
        <style>{`
          @keyframes subtleWordFloat {
            0%, 100% {
              transform: translateX(0);
              opacity: 0.18;
            }
            50% {
              transform: translateX(8px);
              opacity: 0.28;
            }
          }
        `}</style>
        <div className="max-w-[1440px] mx-auto px-6 sm:px-8 lg:px-12 w-full flex items-center justify-center text-center">
          <span
            className={`font-black uppercase text-center transition-all ${
              isReducedMotion ? "" : "animate-[subtleWordFloat_12s_ease-in-out_infinite]"
            }`}
            style={{
              fontSize: "clamp(3.5rem, 11vw, 9.5rem)",
              lineHeight: 1,
              color: "#0F777A",
              opacity: 0.20,
              letterSpacing: "0.28em",
              paddingLeft: "0.28em",
              textShadow: "0 2px 24px rgba(139, 205, 207, 0.22)",
            }}
          >
            FOCUS
          </span>
        </div>
      </section>

      {/* 6. TRANSPARENT MINIMAL FOOTER */}
      <footer className="homepage-footer w-full py-12 px-6 sm:px-8 lg:px-12 max-w-[1440px] mx-auto bg-transparent border-t border-[#0F777A]/15 text-[#07383D] z-10">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          {/* Brand Identity */}
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <TikTikLogo
                size={26}
                showText={true}
                textClassName="font-semibold text-[17px] tracking-tight text-[#07383D]"
                isReducedMotion={isReducedMotion}
              />
            </div>
            <p className="text-[14px] leading-[1.5] text-[#4F7073]">
              Plan your day. Stay on track.
            </p>
          </div>

          {/* Simple Navigation */}
          <nav className="flex items-center gap-6 text-[14px] font-medium leading-[1.4] text-[#4F7073]">
            <button
              type="button"
              onClick={onAbout}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              About
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              Activities
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              Reminders
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              Follow-ups
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="hover:text-[#07383D] transition-colors cursor-pointer"
            >
              Settings
            </button>
          </nav>
        </div>

        <div className="mt-8 pt-6 border-t border-[#0F777A]/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-[14px] leading-[1.5] text-[#4F7073]/80">
          <span>© Tik Tik</span>
          <span>All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
};
