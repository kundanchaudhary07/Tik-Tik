// src/components/about/AboutPage.tsx
import React from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowDown,
  Calendar,
  CheckCircle2,
  Clock,
  Bell,
  Check,
  ListTodo,
  Layers,
  PlusCircle,
} from "lucide-react";
import { TikTikLogo } from "../common/TikTikLogo";

interface AboutPageProps {
  onBackToHome: () => void;
  onSignIn: () => void;
  onRegister?: () => void;
  isAuthenticated?: boolean;
}

export const AboutPage: React.FC<AboutPageProps> = ({
  onBackToHome,
  onSignIn,
  isAuthenticated = false,
}) => {
  // Section 1: Visual Relationship Data
  const relationshipNodes = [
    {
      title: "YOUR ACTIVITIES",
      icon: ListTodo,
      isHighlight: false,
      isSuccess: false,
    },
    {
      title: "Tik Tik organizes",
      icon: Layers,
      isHighlight: true,
      isSuccess: false,
    },
    {
      title: "TIME + IMPORTANCE",
      icon: Calendar,
      isHighlight: false,
      isSuccess: false,
    },
    {
      title: "REMINDERS + ACTION",
      icon: Bell,
      isHighlight: false,
      isSuccess: false,
    },
    {
      title: "COMPLETE",
      icon: CheckCircle2,
      isHighlight: false,
      isSuccess: true,
    },
  ];

  // Section 2: Flowchart Steps
  const flowchartSteps = [
    {
      title: "ADD",
      desc: "Create something you need to do.",
      icon: PlusCircle,
      stepNumber: "1",
    },
    {
      title: "PLAN",
      desc: "Set the date, time, importance, and other details.",
      icon: Calendar,
      stepNumber: "2",
    },
    {
      title: "REMEMBER",
      desc: "Tik Tik schedules reminders based on the activity.",
      icon: Bell,
      stepNumber: "3",
    },
    {
      title: "ACT",
      desc: "Work on the activity and track progress.",
      icon: Clock,
      stepNumber: "4",
    },
    {
      title: "COMPLETE",
      desc: "Mark it complete or reschedule it.",
      icon: CheckCircle2,
      stepNumber: "5",
    },
  ];

  // Section 3: Lifecycle Process Graph Points
  const lifecyclePoints = [
    {
      label: "Created",
      detail: "Task drafted and saved",
    },
    {
      label: "Planned",
      detail: "Date, time, importance set",
    },
    {
      label: "Reminder scheduled",
      detail: "Alert configured",
    },
    {
      label: "Due",
      detail: "Deadline window reaches",
    },
    {
      label: "In progress",
      detail: "Work actively tracked",
    },
    {
      label: "Completed",
      detail: "Finished or rescheduled",
    },
  ];

  return (
    <div
      className="min-h-screen flex flex-col selection:bg-[#B8DEDF] selection:text-[#07383D] overflow-x-hidden"
      style={{
        backgroundColor: "var(--bg-light)",
        color: "var(--text-primary)",
      }}
    >
      {/* Header */}
      <header className="sticky top-0 left-0 right-0 z-50 w-full border-b border-[#0F777A]/15 bg-[#F7FCFC]/95 backdrop-blur-xs">
        <div className="max-w-[1280px] w-full mx-auto px-4 sm:px-6 md:px-8 h-16 sm:h-18 flex items-center justify-between gap-2">
          <div
            onClick={onBackToHome}
            className="flex items-center gap-2.5 cursor-pointer shrink-0"
          >
            <TikTikLogo
              size={32}
              showText={true}
              textClassName="text-[19px] sm:text-[22px] font-bold tracking-tight text-[#07383D]"
            />
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex items-center gap-1.5 text-[12px] sm:text-[13px] font-medium px-2.5 sm:px-3 py-1.5 sm:py-2 text-[#07383D] hover:text-[#0F777A] transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
              <span>Back to home</span>
            </button>

            {!isAuthenticated ? (
              <button
                type="button"
                onClick={onSignIn}
                className="text-[11px] sm:text-[12px] font-medium tracking-wider uppercase px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full border border-[#0F777A]/30 text-[#07383D] hover:bg-[#0F777A] hover:text-white transition-all cursor-pointer shadow-2xs shrink-0"
              >
                Sign in
              </button>
            ) : (
              <button
                type="button"
                onClick={onBackToHome}
                className="text-[11px] sm:text-[12px] font-medium px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full bg-[#0F777A] text-white hover:bg-[#07383D] transition-colors cursor-pointer shrink-0"
              >
                Dashboard
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-[960px] w-full mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8">
        {/* SECTION 1 — WHAT IS TIK TIK */}
        <section className="bg-white rounded-xl border border-[#0F777A]/15 p-4 sm:p-6 md:p-7 shadow-2xs space-y-4 sm:space-y-5">
          <div className="space-y-1.5 text-left">
            <h1 className="text-[32px] font-semibold leading-[1.2] tracking-tight text-[#07383D]">
              What is Tik Tik?
            </h1>
            <p className="text-[14px] font-normal leading-[1.5] text-[#2C6367] max-w-2xl">
              Tik Tik is a simple planning and reminder system that helps you organize what you need to do, when you need to do it, and what needs your attention.
            </p>
          </div>

          {/* Visual relationship:
                  YOUR ACTIVITIES
                        ↓
                  Tik Tik organizes
                        ↓
                TIME + IMPORTANCE
                        ↓
                 REMINDERS + ACTION
                        ↓
                     COMPLETE
          */}
          <div className="pt-1">
            <div className="p-3.5 sm:p-5 rounded-lg bg-[#F7FCFC] border border-[#0F777A]/10">
              <div className="flex flex-col lg:flex-row items-center justify-between gap-2 lg:gap-1.5 w-full">
                {relationshipNodes.map((node, idx) => {
                  const Icon = node.icon;
                  return (
                    <React.Fragment key={node.title}>
                      <div
                        className={`w-full lg:w-auto lg:flex-1 px-3 py-2.5 rounded-lg border flex items-center justify-center gap-2 transition-all ${
                          node.isSuccess
                            ? "bg-[#0F777A] border-[#0F777A] text-white font-medium shadow-2xs"
                            : node.isHighlight
                            ? "bg-[#E4F5F5] border-[#0F777A]/35 text-[#07383D] font-medium shadow-2xs"
                            : "bg-white border-[#0F777A]/20 text-[#07383D] font-medium shadow-2xs"
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            node.isSuccess ? "text-white" : "text-[#0F777A]"
                          }`}
                        />
                        <span className="text-[11px] sm:text-[12px] font-medium tracking-wide uppercase text-center">
                          {node.title}
                        </span>
                      </div>

                      {idx < relationshipNodes.length - 1 && (
                        <>
                          {/* Desktop horizontal arrow */}
                          <div className="hidden lg:flex items-center justify-center shrink-0 px-1">
                            <ArrowRight className="w-3.5 h-3.5 text-[#0F777A]/40" />
                          </div>
                          {/* Mobile vertical arrow */}
                          <div className="flex lg:hidden items-center justify-center py-0.5">
                            <ArrowDown className="w-3.5 h-3.5 text-[#0F777A]/40" />
                          </div>
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2 — HOW TIK TIK WORKS */}
        <section className="space-y-6 sm:space-y-8">
          <div className="space-y-1 text-left">
            <h2 className="text-[22px] sm:text-[24px] font-semibold leading-[1.25] tracking-tight text-[#07383D]">
              How Tik Tik works
            </h2>
            <p className="text-[13px] font-normal leading-[1.45] text-[#5B888B]">
              From adding something to getting it done.
            </p>
          </div>

          {/* Main Flowchart */}
          <div className="bg-white rounded-xl border border-[#0F777A]/15 p-4 sm:p-6 md:p-7 shadow-2xs space-y-4">
            <div className="text-[11px] sm:text-[12px] font-medium uppercase tracking-wider text-[#5B888B]">
              Action Flowchart
            </div>

            <div className="flex flex-col lg:flex-row items-stretch justify-between gap-2.5">
              {flowchartSteps.map((step, idx) => {
                const Icon = step.icon;
                return (
                  <React.Fragment key={step.title}>
                    <div className="flex-1 min-w-0 w-full bg-[#F7FCFC] border border-[#0F777A]/15 rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-[#0F777A]/30 transition-all shadow-2xs">
                      <div className="flex items-center justify-between">
                        <span className="w-5 h-5 rounded-full bg-[#0F777A]/10 text-[#0F777A] text-[11px] font-medium flex items-center justify-center">
                          {step.stepNumber}
                        </span>
                        <Icon className="w-4 h-4 text-[#0F777A] shrink-0" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-[13px] sm:text-[14px] font-semibold text-[#07383D] tracking-wide">
                          {step.title}
                        </h3>
                        <p className="text-[14px] font-normal text-[#5B888B] leading-[1.5]">
                          {step.desc}
                        </p>
                      </div>
                    </div>

                    {idx < flowchartSteps.length - 1 && (
                      <>
                        {/* Desktop horizontal connector arrow */}
                        <div className="hidden lg:flex items-center justify-center shrink-0 self-center px-1">
                          <ArrowRight className="w-4 h-4 text-[#0F777A]/40" />
                        </div>
                        {/* Mobile & Tablet vertical connector arrow */}
                        <div className="flex lg:hidden items-center justify-center py-1">
                          <ArrowDown className="w-4 h-4 text-[#0F777A]/40" />
                        </div>
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* Simple Process Graph: Lifecycle of an Activity */}
          <div className="bg-white rounded-xl border border-[#0F777A]/15 p-4 sm:p-6 md:p-7 shadow-2xs space-y-4 sm:space-y-5">
            <div className="space-y-1 text-left">
              <h3 className="text-[22px] sm:text-[24px] font-semibold leading-[1.25] tracking-tight text-[#07383D]">
                Activity lifecycle
              </h3>
              <p className="text-[13px] font-normal leading-[1.45] text-[#5B888B]">
                The sequential stages of an activity from creation to completion.
              </p>
            </div>

            {/* Desktop timeline graph */}
            <div className="relative hidden md:block pt-3 pb-2">
              {/* Connecting horizontal line */}
              <div
                className="absolute top-[23px] h-0.5 bg-[#0F777A]/25 z-0"
                style={{ left: "calc(100% / 12)", right: "calc(100% / 12)" }}
              />
              <div className="grid grid-cols-6 gap-2 relative z-10">
                {lifecyclePoints.map((point, index) => {
                  const isLast = index === lifecyclePoints.length - 1;
                  return (
                    <div
                      key={point.label}
                      className="flex flex-col items-center text-center px-1"
                    >
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition-colors ${
                          isLast
                            ? "bg-[#0F777A] border-[#0F777A] text-white"
                            : "bg-white border-[#0F777A]/40 text-[#0F777A]"
                        }`}
                      >
                        {isLast ? (
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        ) : (
                          <span className="text-[11px] font-medium">
                            {index + 1}
                          </span>
                        )}
                      </div>
                      <span className="mt-2 text-[13px] font-semibold text-[#07383D] leading-tight">
                        {point.label}
                      </span>
                      <span className="mt-1 text-[12px] sm:text-[13px] font-normal text-[#5B888B] leading-[1.45]">
                        {point.detail}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Mobile timeline graph */}
            <div className="block md:hidden relative pl-8 space-y-4 pt-1">
              {/* Connecting vertical line centered with circles */}
              <div className="absolute top-3.5 bottom-3.5 left-[13px] w-0.5 bg-[#0F777A]/25 z-0" />
              {lifecyclePoints.map((point, index) => {
                const isLast = index === lifecyclePoints.length - 1;
                return (
                  <div
                    key={point.label}
                    className="relative flex items-start gap-3 z-10"
                  >
                    <div
                      className={`-ml-8 w-7 h-7 rounded-full shrink-0 flex items-center justify-center border-2 ${
                        isLast
                          ? "bg-[#0F777A] border-[#0F777A] text-white"
                          : "bg-white border-[#0F777A]/40 text-[#0F777A]"
                      }`}
                    >
                      {isLast ? (
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      ) : (
                        <span className="text-[11px] font-medium">
                          {index + 1}
                        </span>
                      )}
                    </div>
                    <div className="pt-0.5 min-w-0 flex-1">
                      <h4 className="text-[13px] font-semibold text-[#07383D] leading-snug">
                        {point.label}
                      </h4>
                      <p className="text-[12px] sm:text-[13px] font-normal text-[#5B888B] leading-[1.45] mt-0.5">
                        {point.detail}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#0F777A]/15 py-6 bg-[#F7FCFC]">
        <div className="max-w-[1280px] w-full mx-auto px-4 sm:px-6 md:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <TikTikLogo
              size={22}
              showText={true}
              textClassName="text-sm font-bold text-[#07383D]"
            />
            <span className="text-[12px] sm:text-[13px] font-normal leading-[1.45] text-[#5B888B]">
              — Plan your day. Keep important things on track.
            </span>
          </div>
          <div className="text-[11px] sm:text-[12px] font-medium text-[#5B888B]">
            <span>Tik Tik</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
