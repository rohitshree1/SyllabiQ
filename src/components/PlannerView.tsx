import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  Download,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Square,
  Youtube,
} from 'lucide-react';
import type {
  ActiveTab,
  AiYoutubeRecommendation,
  AppState,
  SubjectRefreshStatus,
  TopicItem,
} from '../types';
import { t } from '../utils/translations';
import { curateTopicYoutubeWithAI } from '../utils/apiClient';
import { downloadTimetablePdf } from '../utils/pdfExport';
import { ALERTNESS_SLOT_MAP, buildYoutubeSearchUrl } from '../utils/studyEngine';

interface PlannerViewProps {
  state: AppState;
  subjectRefreshStatuses?: SubjectRefreshStatus[];
  onStartSkillRefresh?: (subjectId: string) => void;
  onToggleSessionComplete: (dayDateISO: string, sessionId: string, topicId: string) => void;
  onMissedDayReoptimize: (missedDateISO: string) => void;
  onStartDayTest: (dayDateISO: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

export const PlannerView: React.FC<PlannerViewProps> = ({
  state,
  subjectRefreshStatuses = [],
  onStartSkillRefresh,
  onToggleSessionComplete,
  onMissedDayReoptimize,
  onStartDayTest,
}) => {
  const lusterAlerts = subjectRefreshStatuses.filter(
    (s) => s.approachingRefreshWarning || s.needsRefresh
  );
  const [subjectFilter, setSubjectFilter] = useState<string>('all');
  const [onlyClassActive, setOnlyClassActive] = useState(false);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [curatedVideosByTopic, setCuratedVideosByTopic] = useState<
    Record<string, AiYoutubeRecommendation[]>
  >({});
  const [curatingTopicId, setCuratingTopicId] = useState<string | null>(null);

  const nextActiveDay =
    state.schedule.find((d) => !d.missed && d.sessions.some((s) => !s.completed)) ||
    state.schedule.find((d) => !d.missed) ||
    state.schedule[0];
  const [selectedMissedDate, setSelectedMissedDate] = useState<string>(
    nextActiveDay?.dateISO || ''
  );

  useEffect(() => {
    const stillValid = state.schedule.some(
      (d) => d.dateISO === selectedMissedDate && !d.missed
    );
    if (!stillValid) {
      const fallbackDay = state.schedule.find((d) => !d.missed);
      setSelectedMissedDate(fallbackDay?.dateISO || '');
    }
  }, [state.schedule, selectedMissedDate]);

  const slotInfo = ALERTNESS_SLOT_MAP[state.student.alertnessWindow];

  const handleCurateVideos = async (topicObj: TopicItem) => {
    setCuratingTopicId(topicObj.id);
    try {
      const subj = state.subjects.find((s) => s.id === topicObj.subjectId);
      const res = await curateTopicYoutubeWithAI({
        topic: topicObj,
        student: state.student,
        subjectDifficulty: subj?.difficulty,
      });
      setCuratedVideosByTopic((prev) => ({
        ...prev,
        [topicObj.id]: res.recommendations,
      }));
    } finally {
      setCuratingTopicId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 7-Day Badge Luster Proactive Warning Indicator on Study Planner */}
      {lusterAlerts.length > 0 && (
        <section
          data-testid="planner-luster-warning"
          aria-label="Study Planner FlexCard badge luster warning"
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
                      ? `60-day threshold crossed · Complete 3-Q sprint to restore Full Badge Luster`
                      : `7-Day Luster Warning · ${item.daysUntilDim}d remaining before FlexCard badge dims`}
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

      {/* Planner Control & Dynamic Missed-Day Re-Optimization Header */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900">
              Alertness-Aligned Study Timetable &amp; Video Resources
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Configured for <strong className="text-slate-900">{slotInfo.label}</strong> (
              <span className="font-mono tabular-nums">{slotInfo.peakRange}</span>) ·{' '}
              <span className="font-mono tabular-nums">{state.student.dailyStudyHours} hrs/day</span>{' '}
              comfort pace · Synchronized with live school/university classes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => downloadTimetablePdf(state)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-sky-600" />
              <span>Download Timetable PDF</span>
            </button>
          </div>
        </div>

        {/* Dynamic Missed-Day Smooth Re-Optimizer */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 py-4">
          <div>
            <p className="text-xs font-semibold text-slate-900">
              Missed a study day? Dynamic Smooth Syllabus Re-Optimization
            </p>
            <p className="text-xs text-slate-600 mt-0.5">
              Select any missed day and AI redistributes its unfinished chapter weight smoothly
              across your remaining days without overloading a single night.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <label htmlFor="missed-day-select" className="sr-only">
              Select missed study date
            </label>
            <select
              id="missed-day-select"
              value={selectedMissedDate}
              onChange={(e) => setSelectedMissedDate(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono tabular-nums text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
            >
              {state.schedule
                .filter((d) => !d.missed)
                .map((d) => (
                  <option key={d.dateISO} value={d.dateISO}>
                    Day {d.dayIndex + 1} ({d.dateISO})
                  </option>
                ))}
            </select>

            <button
              type="button"
              disabled={!selectedMissedDate}
              onClick={() => selectedMissedDate && onMissedDayReoptimize(selectedMissedDate)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Missed Day — Re-Optimize Smoothly</span>
            </button>
          </div>
        </div>

        {state.lastReoptimizationNote && (
          <div
            role="status"
            className="mt-3 space-y-1 border-b border-slate-100 pb-3 text-xs"
          >
            <p className="font-medium text-emerald-800">
              ● {state.lastReoptimizationNote}
            </p>
            {state.aiStrategyBriefing?.recoveryNote && (
              <p className="text-slate-600">
                <strong className="text-slate-900">AI Recovery Coach:</strong>{' '}
                {state.aiStrategyBriefing.recoveryNote}
              </p>
            )}
          </div>
        )}

        {/* Filter Controls */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="planner-subject-filter" className="text-xs font-medium text-slate-600">
              Subject:
            </label>
            <select
              id="planner-subject-filter"
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-800 focus:border-sky-600 focus:outline-hidden"
            >
              <option value="all">All Subjects ({state.subjects.length})</option>
              {state.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setOnlyClassActive((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                onlyClassActive
                  ? 'border-sky-600 bg-sky-50 text-sky-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
              }`}
            >
              {onlyClassActive ? '● Showing Active in Class Only' : 'Filter: Going on in Class'}
            </button>
          </div>

          <span className="text-xs text-slate-500 font-mono tabular-nums">
            {state.schedule.length} scheduled days until exam
          </span>
        </div>
      </section>

      {/* Day-by-Day Schedule List */}
      <section className="space-y-4">
        {state.schedule.map((day) => {
          const visibleSessions = day.sessions.filter((s) => {
            if (subjectFilter !== 'all' && s.subjectId !== subjectFilter) return false;
            if (onlyClassActive && s.classStatus !== 'ongoing') return false;
            return true;
          });

          if (
            (subjectFilter !== 'all' || onlyClassActive) &&
            visibleSessions.length === 0 &&
            !day.missed
          ) {
            return null;
          }

          return (
            <article
              key={day.dateISO}
              className={`glass-panel rounded-2xl p-6 ${day.missed ? 'opacity-70' : ''}`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-bold text-slate-900">
                    Day {day.dayIndex + 1} ·{' '}
                    <span className="font-mono tabular-nums">{day.dateISO}</span>
                  </h3>
                  <span aria-hidden="true" className="text-slate-300">
                    ·
                  </span>
                  {day.missed ? (
                    <span className="text-xs font-semibold text-amber-700">
                      ▲ Missed — Weight Smoothly Redistributed
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500 font-mono tabular-nums">
                      {day.totalHours} hrs scheduled
                      {day.reoptimizedExtraHours > 0
                        ? ` (includes +${Math.round(day.reoptimizedExtraHours * 60)}m smoothed catch-up)`
                        : ''}
                    </span>
                  )}
                </div>

                {!day.missed && (
                  <button
                    type="button"
                    onClick={() => onMissedDayReoptimize(day.dateISO)}
                    className="self-start text-xs font-medium text-slate-500 hover:text-amber-700 whitespace-nowrap shrink-0"
                  >
                    Mark Day Missed &amp; Rebalance
                  </button>
                )}
              </div>

              {/* Sessions */}
              {visibleSessions.length > 0 ? (
                <div className="divide-y divide-slate-100">
                  {visibleSessions.map((sess) => {
                    const topicObj = state.topics.find((t) => t.id === sess.topicId);
                    const isExpanded = expandedSessionId === sess.id;

                    return (
                      <div key={sess.id} className="py-4">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                          <div className="flex items-start gap-3 min-w-0">
                            <button
                              type="button"
                              onClick={() =>
                                onToggleSessionComplete(day.dateISO, sess.id, sess.topicId)
                              }
                              aria-label={`Mark session ${sess.topicTitle} on ${day.dateISO} as ${
                                sess.completed ? 'incomplete' : 'completed'
                              }`}
                              className="mt-0.5 text-slate-600 hover:text-sky-700 shrink-0"
                            >
                              {sess.completed ? (
                                <CheckSquare className="h-4 w-4 text-emerald-600" />
                              ) : (
                                <Square className="h-4 w-4 text-slate-400" />
                              )}
                            </button>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                                <span className="font-mono tabular-nums font-medium text-slate-700">
                                  {sess.timeSlotLabel}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono tabular-nums">
                                  {sess.durationHours} hrs
                                </span>
                                <span aria-hidden="true">·</span>
                                <span>{sess.subjectName}</span>
                                <span aria-hidden="true">·</span>
                                <span
                                  className={
                                    sess.yieldType === 'high'
                                      ? 'font-semibold text-amber-700'
                                      : 'text-slate-500'
                                  }
                                >
                                  {sess.yieldType === 'high' ? '▲ High-Yield PYQ' : 'Low-Yield'}
                                </span>
                                {sess.classStatus === 'ongoing' && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-semibold text-sky-700">
                                      ● Going on in Class
                                    </span>
                                  </>
                                )}
                              </div>

                              <p
                                className={`mt-1 text-sm font-semibold ${
                                  sess.completed
                                    ? 'line-through text-slate-400'
                                    : 'text-slate-900'
                                }`}
                              >
                                {sess.topicTitle}
                              </p>
                            </div>
                          </div>

                          {/* Algorithmic YouTube Lecture Recommendation */}
                          <div className="flex flex-wrap items-center gap-2 pl-7 lg:pl-0 shrink-0">
                            <a
                              href={buildYoutubeSearchUrl(sess.youtubeQuery)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800 transition-colors hover:border-sky-300 hover:bg-sky-50/50 whitespace-nowrap shrink-0"
                            >
                              <Youtube className="h-3.5 w-3.5 text-red-600" />
                              <span className="truncate max-w-[210px]">{sess.youtubeTitle}</span>
                              <ExternalLink className="h-3 w-3 text-slate-400" />
                            </a>

                            <button
                              type="button"
                              onClick={() =>
                                setExpandedSessionId(isExpanded ? null : sess.id)
                              }
                              aria-expanded={isExpanded}
                              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
                            >
                              {isExpanded ? 'Hide Brief' : 'Topic Brief'}
                            </button>
                          </div>
                        </div>

                        {isExpanded && topicObj && (
                          <div className="mt-3 ml-7 glass-inset rounded-xl p-4 text-xs text-slate-600 space-y-2.5">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div>
                                <p>
                                  <strong className="text-slate-900">PYQ Exam Frequency:</strong>{' '}
                                  {topicObj.pyqFrequencyNote}
                                </p>
                                <p className="mt-1">
                                  <strong className="text-slate-900">Key Checkpoints:</strong>{' '}
                                  {topicObj.keyConcepts.join(' · ')}
                                </p>
                              </div>

                              <button
                                type="button"
                                disabled={curatingTopicId === topicObj.id}
                                onClick={() => handleCurateVideos(topicObj)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0 self-start"
                              >
                                {curatingTopicId === topicObj.id ? (
                                  <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
                                    <span>Curating Videos...</span>
                                  </>
                                ) : (
                                  <>
                                    <Youtube className="h-3.5 w-3.5 text-red-600" />
                                    <span>Curate AI Study Videos</span>
                                  </>
                                )}
                              </button>
                            </div>

                            <p>
                              <strong className="text-slate-900">Primary Lecture Match:</strong>{' '}
                              {sess.youtubeChannelHint} — Search query:{' '}
                              <span className="font-mono text-slate-800">
                                “{sess.youtubeQuery}”
                              </span>
                            </p>

                            {curatedVideosByTopic[topicObj.id] &&
                              curatedVideosByTopic[topicObj.id].length > 0 && (
                                <div className="border-t border-slate-200 pt-2.5 space-y-2">
                                  <p className="font-semibold text-slate-900">
                                    AI-Curated Video Playlist for {state.student.name}:
                                  </p>
                                  <div className="divide-y divide-slate-200/70">
                                    {curatedVideosByTopic[topicObj.id].map((rec, rIdx) => (
                                      <div
                                        key={rIdx}
                                        className="py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                                      >
                                        <div className="min-w-0">
                                          <p className="font-semibold text-slate-900">
                                            {rec.title}{' '}
                                            <span className="font-normal text-slate-500">
                                              · {rec.channelOrFormatHint} ·{' '}
                                              <span className="font-mono tabular-nums">
                                                {rec.durationEstimate}
                                              </span>
                                            </span>
                                          </p>
                                          <p className="text-slate-500 mt-0.5">
                                            {rec.whyRecommended}
                                          </p>
                                        </div>
                                        <a
                                          href={buildYoutubeSearchUrl(rec.searchQuery)}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0"
                                        >
                                          <span>Open on YouTube</span>
                                          <ExternalLink className="h-3 w-3" />
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-4 text-xs text-slate-500">
                  {day.missed
                    ? 'All unfinished blocks from this day were redistributed smoothly across subsequent days.'
                    : 'No sessions match current filter.'}
                </p>
              )}

              {/* Daily Test Target Footer */}
              {!day.missed && (
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-3.5">
                  <div className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-900">Daily Test Target:</span>{' '}
                    <span className="font-mono tabular-nums">
                      {day.dailyTestTarget.targetQuestionCount} PYQ Questions
                    </span>{' '}
                    · <span>{day.dailyTestTarget.difficultyTier}</span> ·{' '}
                    <span className="font-mono tabular-nums text-sky-700 font-medium">
                      {Math.round(day.dailyTestTarget.compressedTimeSeconds / 60)}m{' '}
                      {day.dailyTestTarget.compressedTimeSeconds % 60}s compressed timer
                    </span>{' '}
                    (below {Math.round(day.dailyTestTarget.standardExamTimeSeconds / 60)}m standard
                    exam allowance)
                  </div>

                  <button
                    type="button"
                    onClick={() => onStartDayTest(day.dateISO)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                      day.dailyTestTarget.completed
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-sky-600 text-white hover:bg-sky-700'
                    }`}
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>
                      {day.dailyTestTarget.completed
                        ? 'Completed · Retake PYQ Target'
                        : 'Launch Daily Test'}
                    </span>
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );
};
