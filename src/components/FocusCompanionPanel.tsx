import React, { useEffect, useState } from 'react';
import { CheckCircle2, Flame, Pause, Play, RotateCcw, Timer } from 'lucide-react';
import type { ScheduledSession } from '../types';

interface FocusCompanionPanelProps {
  activeSession?: ScheduledSession;
  focusSessionsCompleted: number;
  focusMinutesTotal: number;
  bonusPoints: number;
  onCompleteFocusBlock: (minutesCompleted: number) => void;
}

type FocusPresetKey = 'deep_25' | 'sprint_45' | 'break_5';

const PRESETS: Record<FocusPresetKey, { label: string; minutes: number }> = {
  deep_25: { label: '25m Deep Study', minutes: 25 },
  sprint_45: { label: '45m PYQ Sprint', minutes: 45 },
  break_5: { label: '5m Reset', minutes: 5 },
};

export const FocusCompanionPanel: React.FC<FocusCompanionPanelProps> = ({
  activeSession,
  focusSessionsCompleted,
  focusMinutesTotal,
  bonusPoints,
  onCompleteFocusBlock,
}) => {
  const [preset, setPreset] = useState<FocusPresetKey>('deep_25');
  const [secondsLeft, setSecondsLeft] = useState<number>(25 * 60);
  const [running, setRunning] = useState<boolean>(false);
  const [justLoggedBanner, setJustLoggedBanner] = useState<string>('');

  const totalPresetSeconds = PRESETS[preset].minutes * 60;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running || secondsLeft !== 0) return;
    setRunning(false);
    setSecondsLeft(PRESETS[preset].minutes * 60);
    if (preset !== 'break_5') {
      onCompleteFocusBlock(PRESETS[preset].minutes);
      setJustLoggedBanner(`+${PRESETS[preset].minutes}m focus session logged!`);
      const bannerTimer = window.setTimeout(() => setJustLoggedBanner(''), 3500);
      return () => window.clearTimeout(bannerTimer);
    }
  }, [running, secondsLeft, preset, onCompleteFocusBlock]);

  const handleSelectPreset = (next: FocusPresetKey) => {
    setRunning(false);
    setPreset(next);
    setSecondsLeft(PRESETS[next].minutes * 60);
  };

  const handleCompleteNow = () => {
    if (preset === 'break_5') {
      handleSelectPreset('deep_25');
      return;
    }
    setRunning(false);
    onCompleteFocusBlock(PRESETS[preset].minutes);
    setSecondsLeft(PRESETS[preset].minutes * 60);
    setJustLoggedBanner(`+${PRESETS[preset].minutes}m logged to Study Momentum!`);
    setTimeout(() => setJustLoggedBanner(''), 3500);
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');
  const progressRatio = Math.max(0, Math.min(1, 1 - secondsLeft / totalPresetSeconds));
  const circumference = 2 * Math.PI * 38;
  const strokeDashoffset = circumference * (1 - progressRatio);

  const momentumXp = focusMinutesTotal * 2 + bonusPoints;

  return (
    <section
      aria-label="Deep Focus Study Room and Momentum Tracker"
      className="glass-prism-dark rounded-2xl p-6 text-white"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        {/* Left: Active Chapter Immersion & Presets */}
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-sky-300 tracking-wide">
            <span className="inline-flex items-center gap-1.5 font-semibold">
              <Timer className="h-3.5 w-3.5" />
              Deep Focus Study Room
            </span>
            <span aria-hidden="true" className="text-slate-500">
              ·
            </span>
            <span className="font-mono tabular-nums text-slate-300">
              {focusSessionsCompleted} blocks ({focusMinutesTotal}m) · {momentumXp} Momentum XP
            </span>
          </div>

          <h2 className="font-display text-xl font-bold text-white tracking-tight">
            {activeSession
              ? `Focus Target: ${activeSession.topicTitle}`
              : 'Stay in Flow — Active Syllabus Immersion'}
          </h2>

          <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
            {activeSession
              ? `${activeSession.subjectName} · ${activeSession.timeSlotLabel} · Stay on this workspace timer while reviewing notes or solving PYQs to build study velocity.`
              : 'Run structured focus blocks directly alongside your syllabus roadmap and PYQ practice to compound daily study momentum.'}
          </p>

          <div
            role="group"
            aria-label="Focus duration presets"
            className="flex flex-wrap items-center gap-2 pt-1"
          >
            {(Object.keys(PRESETS) as FocusPresetKey[]).map((key) => {
              const active = preset === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSelectPreset(key)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'bg-sky-500 text-slate-950'
                      : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700/80'
                  }`}
                >
                  {PRESETS[key].label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Radial Glass Timer & Controls */}
        <div className="flex flex-wrap items-center gap-5 shrink-0">
          <div className="relative h-24 w-24 flex items-center justify-center shrink-0">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 88 88" aria-hidden="true">
              <circle
                cx="44"
                cy="44"
                r="38"
                fill="none"
                stroke="rgba(148, 163, 184, 0.22)"
                strokeWidth="5"
              />
              <circle
                cx="44"
                cy="44"
                r="38"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="5"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono tabular-nums text-lg font-bold text-white">
                {mm}:{ss}
              </span>
              <span className="text-[10px] text-slate-400">
                {running ? 'In Flow' : 'Ready'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRunning((r) => !r)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-sky-400 whitespace-nowrap shrink-0"
              >
                {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{running ? 'Pause Timer' : 'Start Focus'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRunning(false);
                  setSecondsLeft(PRESETS[preset].minutes * 60);
                }}
                aria-label="Reset focus timer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700 whitespace-nowrap shrink-0"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset</span>
              </button>
            </div>

            {preset !== 'break_5' && (
              <button
                type="button"
                onClick={handleCompleteNow}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-3.5 py-1.5 text-xs font-medium text-sky-300 transition-colors hover:bg-slate-800 whitespace-nowrap"
              >
                <Flame className="h-3.5 w-3.5 text-amber-400" />
                <span>Complete &amp; Log +{PRESETS[preset].minutes}m Block</span>
              </button>
            )}

            {justLoggedBanner && (
              <p
                role="status"
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{justLoggedBanner}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};
