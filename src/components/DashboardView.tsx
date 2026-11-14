import React, { useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckSquare,
  ExternalLink,
  Gift,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Square,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  ActiveTab,
  AiStrategyBriefing,
  AppState,
  CandidateXpSnapshot,
  GlobalUpdateDoc,
  SubjectRefreshStatus,
} from '../types';
import { t } from '../utils/translations';
import { buildAnalyticalStrategyFallback } from '../utils/aiHelpers';
import { requestAiStrategyBriefing } from '../utils/apiClient';
import {
  ALERTNESS_SLOT_MAP,
  buildYoutubeSearchUrl,
  computeDashboardMetrics,
} from '../utils/studyEngine';
import { formatPostRoleLabel } from '../utils/verificationAndReferral';
import { FocusCompanionPanel } from './FocusCompanionPanel';

interface DashboardViewProps {
  state: AppState;
  latestUpdate?: GlobalUpdateDoc | null;
  unclaimedBonusCount: number;
  bonusPoints: number;
  xpSnapshot: CandidateXpSnapshot;
  subjectRefreshStatuses?: SubjectRefreshStatus[];
  onStartSkillRefresh?: (subjectId: string) => void;
  onOpenUpdatesModal: () => void;
  onLogFocusMinutes: (minutes: number) => void;
  onToggleTopicComplete: (topicId: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
  onSaveAiBriefing: (briefing: AiStrategyBriefing) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  state,
  latestUpdate,
  unclaimedBonusCount,
  bonusPoints,
  xpSnapshot,
  subjectRefreshStatuses = [],
  onStartSkillRefresh,
  onOpenUpdatesModal,
  onLogFocusMinutes,
  onToggleTopicComplete,
  onNavigateTab,
  onSaveAiBriefing,
}) => {
  const [masteryChartMode, setMasteryChartMode] = useState<'timeline' | 'topics'>('timeline');
  const [chartTab, setChartTab] = useState<'accuracy' | 'velocity'>('accuracy');
  const [yieldFilter, setYieldFilter] = useState<'all' | 'high' | 'low'>('all');
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);

  const lusterAlerts = subjectRefreshStatuses.filter(
    (s) => s.approachingRefreshWarning || s.needsRefresh
  );

  const metrics = computeDashboardMetrics(state);
  const slotInfo = ALERTNESS_SLOT_MAP[state.student.alertnessWindow];
  const activeBriefing =
    state.aiStrategyBriefing || buildAnalyticalStrategyFallback(state);

  const handleRefreshAiBriefing = async () => {
    setIsGeneratingStrategy(true);
    try {
      const fresh = await requestAiStrategyBriefing({
        state,
        trigger: 'dashboard_briefing',
      });
      onSaveAiBriefing(fresh);
    } finally {
      setIsGeneratingStrategy(false);
    }
  };

  const todayPlan =
    state.schedule.find((d) => !d.missed && d.sessions.some((s) => !s.completed)) ||
    state.schedule[0];

  const filteredTopics = state.topics.filter((t) => {
    if (yieldFilter === 'all') return true;
    return t.yieldType === yieldFilter;
  });

  return (
    <div className="space-y-7">
      {/* Live Campus Update & Personal Bonus Strip */}
      {(latestUpdate || unclaimedBonusCount > 0 || bonusPoints > 0) && (
        <section
          aria-label="Campus updates and student bonus status"
          className="glass-panel rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
        >
          <div className="flex items-start sm:items-center gap-2.5 min-w-0">
            <Bell className="h-4 w-4 text-sky-600 shrink-0 mt-0.5 sm:mt-0" />
            {latestUpdate ? (
              <p className="text-slate-700 truncate">
                <strong className="text-slate-900">{latestUpdate.title}</strong>
                <span aria-hidden="true"> · </span>
                <span className="font-semibold text-sky-800">
                  {latestUpdate.authorName} ·{' '}
                  {formatPostRoleLabel(latestUpdate.authorRoleLabel) || latestUpdate.authorRoleLabel}
                </span>
                <span aria-hidden="true"> · </span>
                <span>{latestUpdate.body}</span>
              </p>
            ) : (
              <p className="text-slate-700">
                Check platform announcements and special mentor rewards.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {bonusPoints > 0 && (
              <span className="font-mono tabular-nums font-semibold text-sky-700 whitespace-nowrap">
                {bonusPoints} Bonus XP
              </span>
            )}
            <button
              type="button"
              onClick={onOpenUpdatesModal}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300/90 bg-white/90 px-3 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-white whitespace-nowrap shrink-0"
            >
              <Gift className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                {unclaimedBonusCount > 0
                  ? `Claim Bonus (${unclaimedBonusCount} New)`
                  : 'Updates & Bonuses'}
              </span>
            </button>
          </div>
        </section>
      )}

      {/* XP, Rare FlexCard Milestone & 3-Day Active Learner Pulse Strip */}
      <section
        aria-label="Earned XP and FlexCard rarity status"
        className="glass-prism-dark rounded-2xl px-6 py-4 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Sparkles className="h-4 w-4 text-sky-400 shrink-0" />
          <div className="text-xs">
            <span className="font-mono tabular-nums text-sm font-bold text-white">
              {xpSnapshot.netXp} XP
            </span>
            <span aria-hidden="true" className="text-slate-400"> · </span>
            <span className={`font-semibold ${xpSnapshot.rarity.textAccentClass}`}>
              {xpSnapshot.rarity.tier} FlexCard
            </span>
            <span aria-hidden="true" className="text-slate-400"> · </span>
            {xpSnapshot.activeLearnerDissolved ? (
              <span className="font-semibold text-amber-300">
                ▲ Active Learner Dissolved ({xpSnapshot.inactiveDays}d inactive · -{xpSnapshot.decayPenaltyXp} XP decayed)
              </span>
            ) : (
              <span className="text-emerald-300 font-medium">
                Active Learner Pulse Live ({3 - xpSnapshot.inactiveDays}d decay shield)
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {xpSnapshot.rarity.nextTier && xpSnapshot.rarity.nextTierXp && (
            <span className="text-xs font-mono tabular-nums text-slate-300">
              {Math.max(0, xpSnapshot.rarity.nextTierXp - xpSnapshot.netXp)} XP to{' '}
              {xpSnapshot.rarity.nextTier}
            </span>
          )}
          <button
            type="button"
            onClick={() => onNavigateTab('achievements')}
            className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
          >
            <span>Open Rare FlexCards</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-sky-600" />
          </button>
        </div>
      </section>

      {/* 7-Day Badge Luster Proactive Warning Indicator (53–59d Warning / 60d+ Refresh) */}
      {lusterAlerts.length > 0 && (
        <section
          data-testid="dashboard-luster-warning"
          aria-label="FlexCard badge luster refresh warning"
          className="rounded-2xl border border-amber-300/90 bg-amber-50/80 px-5 py-4 space-y-2.5"
        >
          {lusterAlerts.map((item) => (
            <div
              key={item.subjectId}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-start sm:items-center gap-2.5 min-w-0">
                <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
                <div className="min-w-0 space-y-0.5">
                  <p className="font-semibold text-slate-900 leading-relaxed">
                    {item.warningMessage ||
                      t('lusterWarningTitle', 'en', {
                        days: item.daysSincePractice,
                        subject: item.subjectName,
                      })}
                  </p>
                  <p className="text-slate-600 font-mono tabular-nums">
                    {item.needsRefresh
                      ? '60-day threshold crossed · FlexCard shows Skill Refresh Needed until sprint complete'
                      : t('lusterWarningSub', 'en', {
                          daysUntilDim: item.daysUntilDim,
                          lastDate: item.lastPracticedDateISO,
                        })}
                  </p>
                </div>
              </div>

              {onStartSkillRefresh && (
                <button
                  type="button"
                  onClick={() => onStartSkillRefresh(item.subjectId)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 self-start sm:self-auto"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                  <span>{t('startQuickSprint')}</span>
                </button>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Top 4 Analytical KPI Strip */}
      <section
        aria-label="Exam readiness key metrics"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"
      >
        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">{t('examReadinessScore')}</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-3xl font-bold text-slate-900">
              {metrics.examReadinessPercent}%
            </span>
            <span className="text-xs font-medium text-emerald-700">
              {metrics.examReadinessPercent >= 70
                ? 'Strong Trajectory'
                : metrics.examReadinessPercent >= 45
                ? t('buildingMomentum')
                : '▲ Early Calibration'}
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-200/70">
            <div
              className="h-full bg-sky-600 transition-transform duration-200 origin-left"
              style={{ transform: `scaleX(${metrics.examReadinessPercent / 100})` }}
            />
          </div>
          <p className="mt-2.5 text-xs text-slate-500">
            Weighted by High-Yield PYQs, syllabus pace &amp; test scores
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">
            {t('syllabusVelocity')}
          </p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-3xl font-bold text-slate-900">
              {metrics.completedChapters}{' '}
              <span className="text-base font-normal text-slate-400">
                / {metrics.targetChaptersToDate} target
              </span>
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-600">
            <span
              className={
                metrics.velocityStatus === 'Needs Catch-Up'
                  ? 'font-semibold text-amber-700'
                  : 'font-semibold text-emerald-700'
              }
            >
              {metrics.velocityStatus === 'Needs Catch-Up' ? '▲ ' : ''}
              {metrics.velocityStatus}
            </span>
            <span aria-hidden="true"> · </span>
            <span className="font-mono tabular-nums">
              {metrics.completedChapters}/{metrics.totalChapters} total chapters
            </span>
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">{t('overallPyqRating')}</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-3xl font-bold text-slate-900 whitespace-nowrap">
              {metrics.overallScoreOutOf10 !== null ? (
                <>
                  {metrics.overallScoreOutOf10}{' '}
                  <span className="text-base font-normal text-slate-400">/ 10</span>
                </>
              ) : (
                <>
                  — <span className="text-base font-normal text-slate-400">/ 10</span>
                </>
              )}
            </span>
            <span className="font-mono tabular-nums text-xs text-slate-500 whitespace-nowrap shrink-0">
              {state.attempts.length} tests
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Aggregated across {state.subjects.length} subjects under compressed time
          </p>
        </div>

        <div className="glass-panel rounded-2xl p-5">
          <p className="text-xs font-medium text-slate-500">{t('highVsLowYieldMastery')}</p>
          <div className="mt-2 flex items-baseline justify-between gap-2">
            <span className="font-mono tabular-nums text-3xl font-bold text-slate-900">
              {metrics.highYieldMasteryPercent}%
            </span>
            <span className="font-mono tabular-nums text-xs text-slate-500">
              Low-Yield: {metrics.lowYieldMasteryPercent}%
            </span>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            <span className="font-mono tabular-nums">
              {metrics.highYieldCompleted}/{metrics.highYieldTotal}
            </span>{' '}
            high-frequency board/univ chapters done
          </p>
        </div>
      </section>

      {/* Deep Focus Pomodoro & Study Momentum Room (Retention Feature) */}
      <FocusCompanionPanel
        activeSession={
          todayPlan?.sessions.find((s) => !s.completed) || todayPlan?.sessions[0]
        }
        focusSessionsCompleted={state.focusSessionsCompleted || 0}
        focusMinutesTotal={state.focusMinutesTotal || 0}
        bonusPoints={bonusPoints}
        onCompleteFocusBlock={onLogFocusMinutes}
      />

      {/* AI Analytical Study & PYQ Readiness Strategy Coach */}
      <section
        aria-label="AI Analytical Study Strategy"
        className="glass-panel rounded-2xl p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <p className="text-xs font-medium text-slate-500">
              Analytical AI Coach · Calibrated to {state.student.name}’s Alertness, Past Marks &amp; {state.student.boardOrUniversity} PYQs
            </p>
            <h2 className="mt-1 font-display text-lg font-bold text-slate-900">
              {activeBriefing.headline}
            </h2>
          </div>

          <button
            type="button"
            disabled={isGeneratingStrategy}
            onClick={handleRefreshAiBriefing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            {isGeneratingStrategy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
                <span>Analyzing PYQ Data...</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3.5 w-3.5 text-sky-600" />
                <span>{t('generateAiStudyStrategy')}</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 py-4 border-b border-slate-100 text-xs text-slate-600 leading-relaxed">
          <div>
            <p className="font-semibold text-slate-900 mb-1">Peak Alertness Allocation</p>
            <p>{activeBriefing.alertnessStrategy}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900 mb-1">High-Yield PYQ Focus</p>
            <p>{activeBriefing.pyqFocusAdvice}</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900 mb-1">Live Class Synchronization</p>
            <p>{activeBriefing.classSyncTip}</p>
          </div>
        </div>

        {activeBriefing.actionableSteps.length > 0 && (
          <div className="pt-3.5 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-900">Next Priority Actions</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {activeBriefing.actionableSteps.map((stepText, idx) => (
                <p key={idx} className="leading-relaxed">
                  <span className="font-mono tabular-nums text-sky-700 font-semibold">
                    0{idx + 1}.
                  </span>{' '}
                  {stepText}
                </p>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recharts: Study Mastery Progress Over Time (pulled from appState.topics) */}
      <section
        data-testid="study-mastery-recharts-section"
        aria-label="Study mastery progress over time"
        className="glass-panel rounded-2xl p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              Study Mastery Progress Over Time
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live mastery percentages aggregated across {state.topics.length} syllabus chapters
              ({metrics.completedChapters} completed ·{' '}
              <span className="font-mono tabular-nums font-semibold text-sky-700">
                {metrics.masteryProgressSeries.length > 0
                  ? `${metrics.masteryProgressSeries[metrics.masteryProgressSeries.length - 1].overallMasteryPercent}%`
                  : '0%'}
              </span>{' '}
              current mean mastery)
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
            <button
              type="button"
              onClick={() => setMasteryChartMode('timeline')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                masteryChartMode === 'timeline'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Progress Over Time
            </button>
            <button
              type="button"
              onClick={() => setMasteryChartMode('topics')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                masteryChartMode === 'topics'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              By Topic ({metrics.topicMasteryBreakdown.length})
            </button>
          </div>
        </div>

        {state.topics.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <TrendingUp className="mx-auto h-7 w-7 text-slate-400" />
            <p className="text-sm font-medium text-slate-800">
              No syllabus chapters loaded yet
            </p>
            <p className="text-xs text-slate-500">
              Add chapters or load a starter syllabus blueprint to plot topic mastery progression.
            </p>
          </div>
        ) : masteryChartMode === 'timeline' ? (
          <div className="w-full h-64 min-h-[256px]">
            <ResponsiveContainer width="100%" height={256}>
              <AreaChart
                data={metrics.masteryProgressSeries}
                margin={{ top: 10, right: 16, left: -12, bottom: 4 }}
              >
                <defs>
                  <linearGradient id="overallMasteryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0284c7" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#0284c7" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="highYieldMasteryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.22} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="dateLabel"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: 'rgba(255, 255, 255, 0.96)',
                    fontSize: '12px',
                    color: '#0f172a',
                  }}
                  formatter={(value: unknown, name: unknown) => [
                    `${Number(value ?? 0)}%`,
                    String(name ?? ''),
                  ]}
                  labelFormatter={(label, payload) => {
                    const row = payload?.[0]?.payload as
                      | { completedTopicsCount?: number; totalTopicsCount?: number }
                      | undefined;
                    if (!row) return String(label);
                    return `${label} · ${row.completedTopicsCount ?? 0}/${row.totalTopicsCount ?? 0} chapters completed`;
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                <Area
                  type="monotone"
                  dataKey="overallMasteryPercent"
                  name="Overall Mastery %"
                  stroke="#0284c7"
                  strokeWidth={2.5}
                  fill="url(#overallMasteryFill)"
                  activeDot={{ r: 5 }}
                />
                <Area
                  type="monotone"
                  dataKey="highYieldMasteryPercent"
                  name="High-Yield PYQ %"
                  stroke="#059669"
                  strokeWidth={2}
                  fill="url(#highYieldMasteryFill)"
                />
                <Area
                  type="monotone"
                  dataKey="lowYieldMasteryPercent"
                  name="Low-Yield %"
                  stroke="#64748b"
                  strokeWidth={1.75}
                  strokeDasharray="4 4"
                  fill="transparent"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="w-full h-64 min-h-[256px]">
            <ResponsiveContainer width="100%" height={256}>
              <BarChart
                data={metrics.topicMasteryBreakdown.slice(0, 12)}
                margin={{ top: 10, right: 16, left: 10, bottom: 26 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis
                  dataKey="shortTitle"
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={52}
                  padding={{ left: 14, right: 10 }}
                  tick={{ fill: '#64748b', fontSize: 10 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    backgroundColor: 'rgba(255, 255, 255, 0.96)',
                    fontSize: '12px',
                    color: '#0f172a',
                  }}
                  formatter={(value: unknown) => [`${Number(value ?? 0)}% Mastery`, 'Chapter Mastery']}
                  labelFormatter={(_, payload) => {
                    const item = payload?.[0]?.payload as
                      | { topicTitle?: string; subjectName?: string; yieldType?: string }
                      | undefined;
                    if (!item) return '';
                    return `${item.topicTitle} (${item.subjectName} · ${
                      item.yieldType === 'high' ? 'High-Yield' : 'Low-Yield'
                    })`;
                  }}
                />
                <Bar
                  dataKey="masteryPercent"
                  name="Topic Mastery %"
                  fill="#0284c7"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Middle Analytical Trends + Today's Peak Alertness Queue */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Accuracy Trends Over Time & Velocity Trajectory SVG Chart */}
        <div className="lg:col-span-7 glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  {chartTab === 'accuracy'
                    ? 'Accuracy & /10 Rating Trends Over Time'
                    : 'Cumulative Chapter Velocity vs. Target Pace'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {chartTab === 'accuracy'
                    ? 'Tracks compressed-time Daily PYQ Tests and Adaptive Countdown Blitz sessions'
                    : 'Compares chapters completed against linear exam-readiness trajectory'}
                </p>
              </div>

              <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
                <button
                  type="button"
                  onClick={() => setChartTab('accuracy')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    chartTab === 'accuracy'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Accuracy Trend
                </button>
                <button
                  type="button"
                  onClick={() => setChartTab('velocity')}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    chartTab === 'velocity'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Velocity Curve
                </button>
              </div>
            </div>

            {chartTab === 'accuracy' ? (
              metrics.accuracySeries.length === 0 ? (
                <div className="py-12 text-center">
                  <TrendingUp className="mx-auto h-7 w-7 text-slate-400" />
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    No timed assessments completed yet
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Complete your first Daily PYQ Test Target to plot accuracy and /10 score trends.
                  </p>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('daily_test')}
                    className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 whitespace-nowrap"
                  >
                    Start Today’s PYQ Test
                  </button>
                </div>
              ) : (
                <div className="mt-5">
                  <svg
                    viewBox="0 0 560 200"
                    className="w-full h-48 overflow-visible"
                    role="img"
                    aria-label="Line chart of test accuracy percentage over chronological attempts"
                  >
                    {[25, 50, 75, 100].map((pct) => {
                      const y = 175 - (pct / 100) * 145;
                      return (
                        <g key={pct}>
                          <line
                            x1={42}
                            x2={540}
                            y1={y}
                            y2={y}
                            stroke="#e2e8f0"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={8}
                            y={y + 4}
                            className="fill-slate-400 text-[10px] font-mono"
                          >
                            {pct}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Polyline */}
                    {(() => {
                      const pts = metrics.accuracySeries.map((item, idx) => {
                        const count = metrics.accuracySeries.length;
                        const x =
                          count === 1
                            ? 290
                            : 55 + (idx / (count - 1)) * 465;
                        const y = 175 - (item.accuracyPercent / 100) * 145;
                        return { ...item, x, y };
                      });
                      const polyStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
                      return (
                        <>
                          {pts.length > 1 && (
                            <polyline
                              fill="none"
                              stroke="#0284c7"
                              strokeWidth={2.5}
                              points={polyStr}
                            />
                          )}
                          {pts.map((p) => (
                            <g key={p.label + p.dateISO}>
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={5}
                                fill="#ffffff"
                                stroke="#0284c7"
                                strokeWidth={2.5}
                              />
                              <text
                                x={p.x}
                                y={p.y - 10}
                                textAnchor="middle"
                                className="fill-slate-800 text-[10px] font-mono font-semibold"
                              >
                                {p.scoreOutOf10}/10
                              </text>
                              <text
                                x={p.x}
                                y={194}
                                textAnchor="middle"
                                className="fill-slate-500 text-[10px] font-mono"
                              >
                                {p.label} ({p.dateISO.slice(5)})
                              </text>
                            </g>
                          ))}
                        </>
                      );
                    })()}
                  </svg>
                </div>
              )
            ) : (
              <div className="mt-5">
                <svg
                  viewBox="0 0 560 200"
                  className="w-full h-48 overflow-visible"
                  role="img"
                  aria-label="Comparison chart of actual completed chapters versus planned target chapters"
                >
                  {[0, 0.5, 1].map((ratio, idx) => {
                    const val = Math.round(ratio * metrics.totalChapters);
                    const y = 175 - ratio * 145;
                    return (
                      <g key={idx}>
                        <line x1={42} x2={540} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
                        <text x={8} y={y + 4} className="fill-slate-400 text-[10px] font-mono">
                          {val} ch
                        </text>
                      </g>
                    );
                  })}

                  {(() => {
                    const maxCh = Math.max(1, metrics.totalChapters);
                    const count = Math.max(1, metrics.velocitySeries.length);
                    const targetPts = metrics.velocitySeries.map((pt, idx) => {
                      const x = count === 1 ? 290 : 55 + (idx / (count - 1)) * 465;
                      const y = 175 - (pt.targetCumulative / maxCh) * 145;
                      return `${x},${y}`;
                    });
                    const actualPts = metrics.velocitySeries.map((pt, idx) => {
                      const x = count === 1 ? 290 : 55 + (idx / (count - 1)) * 465;
                      const y = 175 - (pt.actualCumulative / maxCh) * 145;
                      return { x, y, ...pt };
                    });
                    return (
                      <>
                        {targetPts.length > 1 && (
                          <polyline
                            fill="none"
                            stroke="#94a3b8"
                            strokeWidth={2}
                            strokeDasharray="5 4"
                            points={targetPts.join(' ')}
                          />
                        )}
                        {actualPts.length > 1 && (
                          <polyline
                            fill="none"
                            stroke="#059669"
                            strokeWidth={2.5}
                            points={actualPts.map((p) => `${p.x},${p.y}`).join(' ')}
                          />
                        )}
                        {actualPts.map((p, idx) => (
                          <g key={p.dayLabel + idx}>
                            <circle cx={p.x} cy={p.y} r={4} fill="#059669" />
                            <text
                              x={p.x}
                              y={194}
                              textAnchor="middle"
                              className="fill-slate-500 text-[10px] font-mono"
                            >
                              {p.dayLabel}
                            </text>
                          </g>
                        ))}
                      </>
                    );
                  })()}
                </svg>
                <div className="mt-2 flex items-center gap-4 text-xs text-slate-500">
                  <span>● Solid Emerald: Completed Chapters</span>
                  <span aria-hidden="true">·</span>
                  <span>- - Dashed Slate: Planned Target Pace</span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600">
            <span>
              Peak Focus Window: <strong className="text-slate-900">{slotInfo.label}</strong> (
              <span className="font-mono tabular-nums">{slotInfo.peakRange}</span>)
            </span>
            <button
              type="button"
              onClick={() => onNavigateTab('profile')}
              className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:text-sky-800 whitespace-nowrap"
            >
              <span>View Full Report Card</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Today's Alertness-Matched Action Queue */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Next Scheduled Focus Queue
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {todayPlan
                    ? `Day ${todayPlan.dayIndex + 1} · ${todayPlan.dateISO} · ${todayPlan.totalHours} hrs planned`
                    : 'All scheduled days complete'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('planner')}
                className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0"
              >
                Open Planner
              </button>
            </div>

            {todayPlan && todayPlan.sessions.length > 0 ? (
              <div className="divide-y divide-slate-100 mt-2">
                {todayPlan.sessions.map((sess) => (
                  <div key={sess.id} className="py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500 font-mono tabular-nums">
                          {sess.timeSlotLabel}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-slate-900">
                          {sess.topicTitle}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          <span>{sess.subjectName}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              sess.yieldType === 'high'
                                ? 'font-medium text-amber-700'
                                : 'text-slate-500'
                            }
                          >
                            {sess.yieldType === 'high' ? '▲ High-Yield PYQ' : 'Low-Yield'}
                          </span>
                          {sess.classStatus === 'ongoing' && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-medium text-sky-700">● Active in Class</span>
                            </>
                          )}
                        </div>
                      </div>

                      <a
                        href={buildYoutubeSearchUrl(sess.youtubeQuery)}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={`Watch YouTube lecture for ${sess.topicTitle}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <span>Video</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-xs text-slate-500">
                No pending sessions for today. Head to Adaptive Countdown Blitz to sharpen recall!
              </p>
            )}
          </div>

          {todayPlan && (
            <div className="mt-4 border-t border-slate-200 pt-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  Daily PYQ Test Target: {todayPlan.dailyTestTarget.targetQuestionCount} Questions
                </p>
                <p className="text-xs text-slate-500 font-mono tabular-nums">
                  {todayPlan.dailyTestTarget.difficultyTier} ·{' '}
                  {Math.round(todayPlan.dailyTestTarget.compressedTimeSeconds / 60)}m compressed
                  limit
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('daily_test')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 whitespace-nowrap shrink-0"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Give Daily Test</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* High-Yield vs Low-Yield Topic Mastery Breakdown Table */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900">
              High-Yield vs. Low-Yield Topic Mastery Breakdown
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              High-Yield chapters account for ~70% of Board/University past-paper marks. Tick off
              chapters as you finish studying them.
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
            <button
              type="button"
              onClick={() => setYieldFilter('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                yieldFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All ({state.topics.length})
            </button>
            <button
              type="button"
              onClick={() => setYieldFilter('high')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                yieldFilter === 'high'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              High-Yield ({metrics.highYieldTotal})
            </button>
            <button
              type="button"
              onClick={() => setYieldFilter('low')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                yieldFilter === 'low'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Low-Yield ({metrics.lowYieldTotal})
            </button>
          </div>
        </div>

        {/* Comparative Dual Summary Bars */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-5 border-b border-slate-100">
          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-900">
                ▲ High-Yield PYQ Chapters ({metrics.highYieldCompleted}/{metrics.highYieldTotal}{' '}
                done)
              </span>
              <span className="font-mono tabular-nums font-semibold text-sky-700">
                {metrics.highYieldMasteryPercent}% Mastery
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-sky-600 transition-transform duration-200 origin-left"
                style={{ transform: `scaleX(${metrics.highYieldMasteryPercent / 100})` }}
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-semibold text-slate-900">
                Low-Yield Supporting Chapters ({metrics.lowYieldCompleted}/{metrics.lowYieldTotal}{' '}
                done)
              </span>
              <span className="font-mono tabular-nums font-semibold text-slate-700">
                {metrics.lowYieldMasteryPercent}% Mastery
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-slate-500 transition-transform duration-200 origin-left"
                style={{ transform: `scaleX(${metrics.lowYieldMasteryPercent / 100})` }}
              />
            </div>
          </div>
        </div>

        {/* High-Density Data Grid */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                <th className="py-3 pr-3">Status</th>
                <th className="py-3 px-3">Chapter / Topic</th>
                <th className="py-3 px-3">Subject</th>
                <th className="py-3 px-3">PYQ Yield &amp; Class Sync</th>
                <th className="py-3 pl-3 text-right">Mastery</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {filteredTopics.map((topic) => (
                <tr key={topic.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="py-2.5 pr-3">
                    <button
                      type="button"
                      onClick={() => onToggleTopicComplete(topic.id)}
                      aria-label={`Mark ${topic.title} as ${
                        topic.completed ? 'incomplete' : 'completed'
                      }`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-sky-700"
                    >
                      {topic.completed ? (
                        <CheckSquare className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                      <span className="sr-only sm:not-sr-only">
                        {topic.completed ? 'Done' : 'Pending'}
                      </span>
                    </button>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-slate-900">
                    <span className={topic.completed ? 'line-through text-slate-400' : ''}>
                      {topic.title}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-xs text-slate-600">{topic.subjectName}</td>
                  <td className="py-2.5 px-3 text-xs text-slate-500">
                    <span
                      className={
                        topic.yieldType === 'high' ? 'font-medium text-amber-700' : 'text-slate-500'
                      }
                    >
                      {topic.yieldType === 'high' ? '▲ High-Yield' : 'Low-Yield'}
                    </span>
                    <span aria-hidden="true"> · </span>
                    <span>
                      {topic.classStatus === 'ongoing'
                        ? 'Going on in Class'
                        : topic.classStatus === 'covered'
                        ? 'Covered in Class'
                        : 'Upcoming in Class'}
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right font-mono tabular-nums text-xs font-semibold text-slate-800">
                    {topic.completed ? Math.max(80, topic.masteryPercent) : topic.masteryPercent}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
