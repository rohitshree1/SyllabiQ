import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  CheckCircle2,
  Cloud,
  FileUp,
  Loader2,
  MessageSquare,
  Send,
  Upload,
  Zap,
} from 'lucide-react';
import type {
  AlertnessWindow,
  AuthenticatedAccount,
  ClassStatus,
  GlobalUpdateDoc,
  IntakeChatMessage,
  LearningStylePreset,
  StudentProfile,
  SubjectDifficulty,
  SubjectProfile,
  TopicItem,
} from '../types';
import { SYLLABUS_PRESETS } from '../data/seedData';
import { mergeIntakeUpdatesIntoDraft } from '../utils/aiHelpers';
import { parseSyllabusWithAI, sendIntakeChatWithAI } from '../utils/apiClient';
import {
  materializeStarterBlueprint,
  STARTER_SYLLABUS_BLUEPRINTS,
} from '../utils/starterBlueprints';
import { ALERTNESS_SLOT_MAP, LEARNING_STYLE_LABELS } from '../utils/studyEngine';
import { t } from '../utils/translations';
import heroDeskImg from '../assets/images/hero_study_desk_1793010659656.jpg';

interface OnboardingWizardProps {
  account: AuthenticatedAccount | null;
  pinnedUpdate?: GlobalUpdateDoc | null;
  onOpenAuthModal: () => void;
  onOpenPrivacyPolicy: () => void;
  onCompleteOnboarding: (payload: {
    student: StudentProfile;
    subjects: SubjectProfile[];
    topics: TopicItem[];
  }) => void;
  onLoadDemoWorkspace: () => void;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  account,
  pinnedUpdate,
  onOpenAuthModal,
  onOpenPrivacyPolicy,
  onCompleteOnboarding,
  onLoadDemoWorkspace,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [heroImgFailed, setHeroImgFailed] = useState(false);

  // Step 1: Syllabus & institution context
  const [institutionType, setInstitutionType] = useState<'school' | 'university'>('university');
  const [boardOrUniversity, setBoardOrUniversity] = useState('');
  const [examName, setExamName] = useState('');
  const [rawSyllabusText, setRawSyllabusText] = useState('');
  const [uploadedFile, setUploadedFile] = useState<{
    mimeType: string;
    base64: string;
    fileName: string;
  } | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Parsed output editable before timetable generation
  const [subjects, setSubjects] = useState<SubjectProfile[]>([]);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [pyqOverview, setPyqOverview] = useState<string>('');
  const [intakeMessages, setIntakeMessages] = useState<IntakeChatMessage[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isChatting, setIsChatting] = useState<boolean>(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [intakeMessages, isChatting]);

  // Step 2: Student profile, alertness window, daily study hours
  const defaultExam = new Date(Date.now() + 16 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const [studentName, setStudentName] = useState(account?.displayName || '');
  const [contactEmail, setContactEmail] = useState(account?.email || '');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [notifyGmailOptIn, setNotifyGmailOptIn] = useState(true);
  const [notifyWhatsappOptIn, setNotifyWhatsappOptIn] = useState(true);
  const [examDate, setExamDate] = useState(defaultExam);
  const [dailyStudyHours, setDailyStudyHours] = useState<number>(4.5);
  const [alertnessWindow, setAlertnessWindow] = useState<AlertnessWindow>('early_morning');
  const [learningStyle, setLearningStyle] = useState<LearningStylePreset>('visual_analogies');
  const [customStyleFeedback, setCustomStyleFeedback] = useState('');

  const [errorMessage, setErrorMessage] = useState('');
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string | null>(null);

  useEffect(() => {
    if (account?.email && !contactEmail) {
      setContactEmail(account.email);
    }
    if (account?.displayName && !studentName) {
      setStudentName(account.displayName);
    }
  }, [account, contactEmail, studentName]);

  const handleSelectStarterBlueprint = (blueprintId: string) => {
    const materialized = materializeStarterBlueprint(blueprintId);
    if (!materialized) return;
    const { blueprint, subjects: bpSubjects, topics: bpTopics, rawText } = materialized;
    setSelectedBlueprintId(blueprint.id);
    setInstitutionType(blueprint.institutionType);
    setBoardOrUniversity(blueprint.boardOrUniversity);
    setExamName(blueprint.examName);
    setRawSyllabusText(rawText);
    setSubjects(bpSubjects);
    setTopics(bpTopics);
    setPyqOverview(blueprint.pyqOverview);
    setDailyStudyHours(blueprint.recommendedDailyHours);
    setAlertnessWindow(blueprint.recommendedAlertness);
    setLearningStyle(blueprint.recommendedLearningStyle);
    setUploadedFile(null);
    setIntakeMessages([
      {
        id: `adv-bp-${Date.now()}`,
        role: 'advisor',
        text: blueprint.advisorGreeting,
      },
    ]);
    setErrorMessage('');
  };

  const handleExpressBlueprintTimetable = () => {
    if (subjects.length === 0 || topics.length === 0) {
      setErrorMessage('Please select a 1-click starter syllabus template first.');
      return;
    }
    if (!studentName.trim()) {
      setErrorMessage(t('nameRequiredAlert'));
      return;
    }
    if (!examDate) {
      setErrorMessage('Please choose your target exam date.');
      return;
    }
    setErrorMessage('');
    const todayISO = new Date().toISOString().slice(0, 10);
    const student: StudentProfile = {
      name: studentName.trim(),
      email: contactEmail.trim() || account?.email || '',
      phoneNumber: phoneNumber.trim(),
      notifyGmailOptIn,
      notifyWhatsappOptIn,
      lastActiveDate: todayISO,
      institutionType,
      boardOrUniversity: boardOrUniversity.trim(),
      examName: examName.trim() || `${boardOrUniversity.trim()} Finals`,
      examDate,
      dailyStudyHours,
      alertnessWindow,
      learningStyle,
      customStyleFeedback: customStyleFeedback.trim(),
      createdAt: todayISO,
    };
    onCompleteOnboarding({ student, subjects, topics });
  };

  const handleApplyPreset = (presetId: string) => {
    const found = SYLLABUS_PRESETS.find((p) => p.id === presetId);
    if (!found) return;
    setSelectedBlueprintId(null);
    setInstitutionType(found.institutionType);
    setBoardOrUniversity(found.boardOrUniversity);
    setExamName(found.examName);
    setRawSyllabusText(found.rawText);
    setUploadedFile(null);
    setErrorMessage('');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'text/plain' || file.name.endsWith('.txt') || file.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = () => {
        setRawSyllabusText(String(reader.result || ''));
        setUploadedFile({
          mimeType: 'text/plain',
          base64: '',
          fileName: file.name,
        });
        setErrorMessage('');
      };
      reader.readAsText(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : '';
      setUploadedFile({
        mimeType: file.type || 'application/pdf',
        base64,
        fileName: file.name,
      });
      setErrorMessage('');
    };
    reader.readAsDataURL(file);
  };

  const handleStep1ParseAndContinue = async () => {
    if (!boardOrUniversity.trim()) {
      setErrorMessage('Please enter your School Board or University name so PYQ exam patterns match.');
      return;
    }
    if (!rawSyllabusText.trim() && !uploadedFile) {
      setErrorMessage('Please upload a syllabus document (.pdf, image, .txt) or paste your syllabus chapters.');
      return;
    }

    setErrorMessage('');
    setIsParsing(true);
    try {
      const parsed = await parseSyllabusWithAI({
        rawText: rawSyllabusText,
        fileData: uploadedFile,
        boardOrUniversity: boardOrUniversity.trim(),
        institutionType,
      });

      if (parsed.subjects.length === 0 || parsed.topics.length === 0) {
        setErrorMessage('Could not extract chapters from the input. Try listing Subject: Chapter 1, Chapter 2.');
        setIsParsing(false);
        return;
      }

      setSubjects(parsed.subjects);
      setTopics(parsed.topics);
      setPyqOverview(parsed.pyqOverview);
      setIntakeMessages([
        {
          id: `adv-init-${Date.now()}`,
          role: 'advisor',
          text: parsed.advisorGreeting,
        },
      ]);
      setStep(2);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSendAdvisorReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || isChatting) return;

    const userMsg: IntakeChatMessage = {
      id: `stu-${Date.now()}`,
      role: 'student',
      text: trimmed,
    };
    const nextHistory = [...intakeMessages, userMsg];
    setIntakeMessages(nextHistory);
    setChatInput('');
    setIsChatting(true);
    setErrorMessage('');

    try {
      const result = await sendIntakeChatWithAI({
        messages: nextHistory,
        currentDraft: {
          studentName,
          examDate,
          dailyStudyHours,
          alertnessWindow,
          learningStyle,
          customStyleFeedback,
          boardOrUniversity: boardOrUniversity.trim(),
          subjects,
          topics,
        },
      });

      const { nextDraft, appliedItems } = mergeIntakeUpdatesIntoDraft(
        {
          studentName,
          examDate,
          dailyStudyHours,
          alertnessWindow,
          learningStyle,
          customStyleFeedback,
          subjects,
          topics,
        },
        result.extractedUpdates
      );

      setStudentName(nextDraft.studentName);
      setExamDate(nextDraft.examDate);
      setDailyStudyHours(nextDraft.dailyStudyHours);
      setAlertnessWindow(nextDraft.alertnessWindow);
      setLearningStyle(nextDraft.learningStyle);
      setCustomStyleFeedback(nextDraft.customStyleFeedback);
      setSubjects(nextDraft.subjects);
      setTopics(nextDraft.topics);

      setIntakeMessages((prev) => [
        ...prev,
        {
          id: `adv-${Date.now()}`,
          role: 'advisor',
          text: result.reply,
          appliedSummary:
            appliedItems.length > 0 ? `Synced · ${appliedItems.join(' · ')}` : undefined,
        },
      ]);
    } finally {
      setIsChatting(false);
    }
  };

  const handleStep2Continue = () => {
    if (!studentName.trim()) {
      setErrorMessage('Please enter your full name to personalize your profile and report cards.');
      return;
    }
    if (!examDate) {
      setErrorMessage('Please choose your target exam date.');
      return;
    }
    setErrorMessage('');
    setStep(3);
  };

  const handleUpdateSubjectDifficulty = (id: string, difficulty: SubjectDifficulty) => {
    setSubjects((prev) => prev.map((s) => (s.id === id ? { ...s, difficulty } : s)));
  };

  const handleUpdateSubjectPastScore = (id: string, score: number) => {
    const clamped = Math.max(0, Math.min(100, Number.isNaN(score) ? 0 : score));
    setSubjects((prev) =>
      prev.map((s) => (s.id === id ? { ...s, previousScoreOutOf100: clamped } : s))
    );
  };

  const handleToggleTopicClassStatus = (topicId: string, status: ClassStatus) => {
    setTopics((prev) =>
      prev.map((t) => (t.id === topicId ? { ...t, classStatus: status } : t))
    );
  };

  const handleFinalSubmit = () => {
    const todayISO = new Date().toISOString().slice(0, 10);
    const student: StudentProfile = {
      name: studentName.trim(),
      email: contactEmail.trim() || account?.email || '',
      phoneNumber: phoneNumber.trim(),
      notifyGmailOptIn,
      notifyWhatsappOptIn,
      lastActiveDate: todayISO,
      institutionType,
      boardOrUniversity: boardOrUniversity.trim(),
      examName: examName.trim() || `${boardOrUniversity.trim()} Finals`,
      examDate,
      dailyStudyHours,
      alertnessWindow,
      learningStyle,
      customStyleFeedback: customStyleFeedback.trim(),
      createdAt: todayISO,
    };
    onCompleteOnboarding({ student, subjects, topics });
  };

  return (
    <div className="min-h-screen text-slate-900">
      {/* Strict 3-Zone Top Bar Contract (Frosted Glass) */}
      <header className="glass-header sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-4">
        <a
          href="/"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          SyllabiQ
        </a>

        <nav
          aria-label="Onboarding steps"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              step === 1 ? 'text-slate-900 underline underline-offset-8' : 'hover:text-slate-900'
            }`}
          >
            01. Syllabus Upload
          </button>
          <button
            type="button"
            disabled={subjects.length === 0}
            onClick={() => subjects.length > 0 && setStep(2)}
            className={`transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
              step === 2 ? 'text-slate-900 underline underline-offset-8' : 'hover:text-slate-900'
            }`}
          >
            02. Alertness &amp; Profile
          </button>
          <button
            type="button"
            disabled={subjects.length === 0 || !studentName.trim()}
            onClick={() => subjects.length > 0 && studentName.trim() && setStep(3)}
            className={`transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 ${
              step === 3 ? 'text-slate-900 underline underline-offset-8' : 'hover:text-slate-900'
            }`}
          >
            03. Subject Calibration
          </button>
          <button
            type="button"
            onClick={onOpenPrivacyPolicy}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            Privacy Policy
          </button>
        </nav>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenAuthModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Cloud className="h-3.5 w-3.5 text-sky-400" />
            <span>{account ? account.displayName : t('signInCloudSync')}</span>
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        {pinnedUpdate && (
          <div className="glass-panel rounded-2xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <Bell className="h-4 w-4 text-sky-600 shrink-0 mt-0.5 sm:mt-0" />
              <p className="text-slate-700 leading-relaxed">
                <strong className="text-slate-900">{pinnedUpdate.title}</strong>
                <span aria-hidden="true"> · </span>
                <span>{pinnedUpdate.body}</span>
              </p>
            </div>
            <span className="font-mono tabular-nums text-[11px] text-slate-500 whitespace-nowrap shrink-0">
              {pinnedUpdate.authorRoleLabel}
            </span>
          </div>
        )}

        {/* Balanced 2-Column Editorial Hero + Active Wizard Surface */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Context & Visual Column */}
          <div className="lg:col-span-5 glass-panel rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-sky-700">
                Analytical Exam &amp; Syllabus Engine
              </p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">
                Turn your raw syllabus into a precision exam roadmap.
              </h1>
              <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                Upload your school board or university syllabus. SyllabiQ maps Previous Year
                Question (PYQ) weightage, aligns with what is happening in your live classes,
                schedules tough chapters inside your peak alertness hours, and backs up your
                progress permanently with Google or Microsoft Cloud Login.
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={onLoadDemoWorkspace}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300/90 bg-white/90 px-4 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-white whitespace-nowrap shrink-0"
                >
                  <span>Explore Demo Workspace</span>
                  <ArrowRight className="h-3.5 w-3.5 text-sky-600" />
                </button>
              </div>

              <div className="mt-6 space-y-3 border-t border-slate-200/70 pt-5 text-xs text-slate-600">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-slate-900 shrink-0">
                    Alertness-Matched Timetable
                  </span>
                  <span className="text-right">Peak comfort slots · Offline PDF</span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-slate-900 shrink-0">
                    Progressive Daily PYQ Tests
                  </span>
                  <span className="text-right">Compressed timer · /10 Scores</span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-slate-900 shrink-0">
                    Google &amp; Microsoft Cloud Sync
                  </span>
                  <span className="text-right">Multi-year backup · Bonus XP</span>
                </div>
              </div>
            </div>

            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 aspect-video relative">
              {!heroImgFailed ? (
                <img
                  src={heroDeskImg}
                  alt="Organized morning university study desk with calculus and physics notes"
                  referrerPolicy="no-referrer"
                  onError={() => setHeroImgFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 p-6 text-center text-white">
                  <BookOpen className="h-8 w-8 text-sky-400" />
                  <p className="mt-2 text-xs text-slate-300">
                    Structured Syllabus · PYQ Weightage · Alertness Optimization
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Interactive Multi-Step Setup Surface */}
          <div className="lg:col-span-7 glass-panel rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            {errorMessage && (
              <div
                role="alert"
                className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-800"
              >
                ✕ {errorMessage}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Step 1 of 3
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                    Syllabus Calibration &amp; Target Setup
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Upload syllabus chapters or choose a 1-click starter template to auto-calibrate high-yield PYQ weightages.
                  </p>
                </div>

                {/* 1-Click PYQ-Tagged Starter Syllabus Templates (<30s Express Launch) */}
                <div
                  data-testid="starter-blueprints-section"
                  className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                      <Zap className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                      <span>1-Click Starter Syllabus Templates (PYQ-Tagged)</span>
                    </span>
                    <span className="font-mono tabular-nums text-[11px] text-slate-500">
                      Instant Schedule in &lt;30s
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {STARTER_SYLLABUS_BLUEPRINTS.map((bp) => {
                      const isSelected = selectedBlueprintId === bp.id;
                      const chapterCount = bp.subjects.reduce(
                        (sum, s) => sum + s.chapters.length,
                        0
                      );
                      return (
                        <button
                          key={bp.id}
                          type="button"
                          onClick={() => handleSelectStarterBlueprint(bp.id)}
                          aria-pressed={isSelected}
                          className={`text-left rounded-xl border p-3 transition-colors ${
                            isSelected
                              ? 'border-sky-600 bg-white text-slate-900 shadow-2xs'
                              : 'border-slate-200 bg-white/80 text-slate-800 hover:border-slate-300 hover:bg-white'
                          }`}
                        >
                          <p className="text-xs font-bold text-slate-900">{bp.shortLabel}</p>
                          <p className="mt-0.5 text-[11px] text-slate-500">
                            {bp.badgeStream}
                          </p>
                          <p className="mt-1.5 font-mono tabular-nums text-[11px] text-sky-700 font-medium">
                            {bp.subjects.length} subjects · {chapterCount} PYQ chapters
                          </p>
                        </button>
                      );
                    })}
                  </div>

                  {selectedBlueprintId && subjects.length > 0 && (
                    <div
                      data-testid="express-blueprint-bar"
                      className="border-t border-slate-200 pt-3.5 space-y-3"
                    >
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-900">
                          Loaded PYQ Chapter Weightages ({topics.length} chapters across {subjects.length} subjects)
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">{pyqOverview}</p>
                        <div className="pt-1 space-y-1 text-[11px] text-slate-600">
                          {topics.slice(0, 4).map((t) => (
                            <p key={t.id} className="truncate">
                              <strong className="text-slate-800">{t.subjectName}:</strong>{' '}
                              {t.title} ·{' '}
                              <span className="font-mono tabular-nums text-sky-800">
                                {t.pyqFrequencyNote}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                        <div>
                          <label
                            htmlFor="express-student-name"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Your Full Name
                          </label>
                          <input
                            id="express-student-name"
                            type="text"
                            value={studentName}
                            onChange={(e) => {
                              setStudentName(e.target.value);
                              if (errorMessage) setErrorMessage('');
                            }}
                            placeholder="e.g., Riya Verma"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="express-alertness-select"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Peak Alertness Slot
                          </label>
                          <select
                            id="express-alertness-select"
                            value={alertnessWindow}
                            onChange={(e) =>
                              setAlertnessWindow(e.target.value as AlertnessWindow)
                            }
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                          >
                            {(Object.keys(ALERTNESS_SLOT_MAP) as AlertnessWindow[]).map((k) => (
                              <option key={k} value={k}>
                                {ALERTNESS_SLOT_MAP[k].label} ({ALERTNESS_SLOT_MAP[k].peakRange})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label
                            htmlFor="express-exam-date"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Target Exam Date
                          </label>
                          <input
                            id="express-exam-date"
                            type="date"
                            value={examDate}
                            onChange={(e) => setExamDate(e.target.value)}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono tabular-nums text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                          />
                        </div>

                        <div>
                          <label
                            htmlFor="express-daily-hours"
                            className="block text-xs font-semibold text-slate-700 mb-1"
                          >
                            Daily Study Hours ({dailyStudyHours} hrs/day)
                          </label>
                          <input
                            id="express-daily-hours"
                            type="range"
                            min={2}
                            max={9}
                            step={0.5}
                            value={dailyStudyHours}
                            onChange={(e) => setDailyStudyHours(Number(e.target.value))}
                            className="w-full accent-sky-600 mt-1.5"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setStep(2)}
                          className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                        >
                          Customize Marks &amp; Hours
                        </button>

                        <button
                          type="button"
                          onClick={handleExpressBlueprintTimetable}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
                          <span>Generate Alertness Timetable</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Preset Raw-Text Quick-Loaders (for Custom AI Parsing) */}
                <div>
                  <span className="block text-xs font-medium text-slate-700 mb-2">
                    Or paste / edit custom syllabus text for AI extraction
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {SYLLABUS_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => handleApplyPreset(preset.id)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap shrink-0"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="institution-type"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Institution Level
                    </label>
                    <select
                      id="institution-type"
                      value={institutionType}
                      onChange={(e) =>
                        setInstitutionType(e.target.value as 'school' | 'university')
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-hidden"
                    >
                      <option value="university">University / College Degree</option>
                      <option value="school">School / Board Examination</option>
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="board-input"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Board or University Name (for PYQs)
                    </label>
                    <input
                      id="board-input"
                      type="text"
                      value={boardOrUniversity}
                      onChange={(e) => setBoardOrUniversity(e.target.value)}
                      placeholder="e.g., CBSE Class 12, MIT, DTU, IB"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="exam-name-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Target Examination Title
                  </label>
                  <input
                    id="exam-name-input"
                    type="text"
                    value={examName}
                    onChange={(e) => setExamName(e.target.value)}
                    placeholder="e.g., End-Semester Finals / Pre-Board Assessment"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                {/* File Upload Input */}
                <div>
                  <label
                    htmlFor="syllabus-file-upload"
                    className="flex cursor-pointer items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-700 transition-colors hover:border-sky-500 hover:bg-sky-50/40"
                  >
                    <span className="flex items-center gap-2.5 font-medium">
                      <FileUp className="h-4 w-4 text-sky-600 shrink-0" />
                      <span>
                        {uploadedFile
                          ? `Attached: ${uploadedFile.fileName}`
                          : 'Attach Syllabus File (.pdf, .png, .jpg, .txt)'}
                      </span>
                    </span>
                    <span className="inline-flex items-center gap-1 font-semibold text-sky-700 whitespace-nowrap">
                      <Upload className="h-3.5 w-3.5" />
                      Browse File
                    </span>
                  </label>
                  <input
                    id="syllabus-file-upload"
                    type="file"
                    accept=".pdf,.txt,.md,image/png,image/jpeg"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                </div>

                <div>
                  <label
                    htmlFor="syllabus-textarea"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Syllabus Subjects &amp; Chapters
                  </label>
                  <textarea
                    id="syllabus-textarea"
                    rows={5}
                    value={rawSyllabusText}
                    onChange={(e) => setRawSyllabusText(e.target.value)}
                    placeholder={`Format example:\nPhysics: Rotational Dynamics, Electrostatics, Ray Optics\nCalculus: Partial Derivatives, Multiple Integrals`}
                    className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center justify-end pt-2">
                  <button
                    type="button"
                    disabled={isParsing}
                    onClick={handleStep1ParseAndContinue}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-60 whitespace-nowrap shrink-0"
                  >
                    {isParsing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Analyzing Syllabus &amp; PYQ Trends...</span>
                      </>
                    ) : (
                      <>
                        <span>Analyze Syllabus with AI</span>
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Step 2 of 3 · {topics.length} Chapters Extracted Across {subjects.length}{' '}
                    Subjects
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                    02. AI Academic Intake &amp; Peak Alertness Setup
                  </h2>
                  {pyqOverview && (
                    <p className="mt-1 text-xs text-sky-800">{pyqOverview}</p>
                  )}
                </div>

                {/* Conversational AI Academic Advisor Interview */}
                <div className="glass-inset rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-slate-900">
                      <MessageSquare className="h-3.5 w-3.5 text-sky-600" />
                      AI Academic Advisor Interview
                    </span>
                    <span className="text-slate-500">
                      Answer naturally — fields &amp; subject scores auto-sync below
                    </span>
                  </div>

                  <div
                    ref={chatScrollRef}
                    className="max-h-56 overflow-y-auto space-y-2.5 pr-1 text-xs"
                  >
                    {intakeMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={
                          msg.role === 'advisor'
                            ? 'text-slate-800 leading-relaxed'
                            : 'text-sky-900 font-medium pl-4 leading-relaxed'
                        }
                      >
                        <span className="font-semibold text-slate-900">
                          {msg.role === 'advisor' ? 'AI Advisor: ' : 'You: '}
                        </span>
                        <span>{msg.text}</span>
                        {msg.appliedSummary && (
                          <p className="mt-1 font-mono tabular-nums text-[11px] text-emerald-700">
                            + {msg.appliedSummary}
                          </p>
                        )}
                      </div>
                    ))}
                    {isChatting && (
                      <p className="inline-flex items-center gap-1.5 text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
                        <span>Analyzing your response &amp; calibrating profile...</span>
                      </p>
                    )}
                  </div>

                  <form onSubmit={handleSendAdvisorReply} className="flex items-center gap-2 pt-1">
                    <label htmlFor="ai-intake-input" className="sr-only">
                      Reply to AI Academic Advisor
                    </label>
                    <input
                      id="ai-intake-input"
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="e.g., I'm Kabir, sharpest early morning for 5 hrs/day. Physics is hard (58/100), Calculus is easy (88/100)."
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                    />
                    <button
                      type="submit"
                      disabled={isChatting || !chatInput.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Reply to AI</span>
                    </button>
                  </form>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="student-name-input"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Your Full Name
                    </label>
                    <input
                      id="student-name-input"
                      type="text"
                      value={studentName}
                      onChange={(e) => setStudentName(e.target.value)}
                      placeholder="e.g., Ananya Verma"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="exam-date-input"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Target Exam Date
                    </label>
                    <input
                      id="exam-date-input"
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 font-mono tabular-nums focus:border-sky-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                {/* Contact Gmail, WhatsApp & Mentor Notification Preferences */}
                <div className="glass-inset rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-900">
                      Achievement &amp; Priority Syllabus Notification Channels
                    </span>
                    <button
                      type="button"
                      onClick={onOpenPrivacyPolicy}
                      className="font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0"
                    >
                      Why we ask · Privacy Policy
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="candidate-gmail-input"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        Candidate Gmail Address
                      </label>
                      <input
                        id="candidate-gmail-input"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        placeholder="you@gmail.com"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="candidate-whatsapp-input"
                        className="block text-xs font-medium text-slate-700 mb-1"
                      >
                        WhatsApp / Mobile Number
                      </label>
                      <input
                        id="candidate-whatsapp-input"
                        type="tel"
                        value={phoneNumber}
                        onChange={(e) => setPhoneNumber(e.target.value)}
                        placeholder="+91 98765 43210"
                        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 pt-1 text-xs text-slate-700">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifyGmailOptIn}
                        onChange={(e) => setNotifyGmailOptIn(e.target.checked)}
                        className="rounded border-slate-300 accent-sky-600"
                      />
                      <span>Notify me on Gmail about active achievements &amp; priority chapters</span>
                    </label>

                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={notifyWhatsappOptIn}
                        onChange={(e) => setNotifyWhatsappOptIn(e.target.checked)}
                        className="rounded border-slate-300 accent-sky-600"
                      />
                      <span>Notify me on WhatsApp before Active Learner XP decays</span>
                    </label>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="daily-hours-slider"
                      className="text-xs font-semibold text-slate-700"
                    >
                      Daily Comfortable Study Capacity
                    </label>
                    <span className="font-mono tabular-nums text-xs font-semibold text-sky-700">
                      {dailyStudyHours} hrs / day
                    </span>
                  </div>
                  <input
                    id="daily-hours-slider"
                    type="range"
                    min={1.5}
                    max={10}
                    step={0.5}
                    value={dailyStudyHours}
                    onChange={(e) => setDailyStudyHours(Number(e.target.value))}
                    className="w-full accent-sky-600"
                  />
                  <div className="flex justify-between text-xs text-slate-400 font-mono tabular-nums mt-1">
                    <span>1.5 hrs</span>
                    <span>5.0 hrs</span>
                    <span>10.0 hrs</span>
                  </div>
                </div>

                {/* Peak Alertness Window */}
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-2">
                    When do you feel most alert &amp; comfortable studying?
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {(Object.keys(ALERTNESS_SLOT_MAP) as AlertnessWindow[]).map((key) => {
                      const info = ALERTNESS_SLOT_MAP[key];
                      const active = alertnessWindow === key;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setAlertnessWindow(key)}
                          className={`text-left rounded-lg border p-3 transition-colors ${
                            active
                              ? 'border-sky-600 bg-sky-50/60 text-slate-900'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold">{info.label}</span>
                            <span className="font-mono tabular-nums text-xs text-sky-700">
                              {info.peakRange}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500 leading-snug">
                            {info.description}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="learning-style-select"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Preferred Explanation Style
                    </label>
                    <select
                      id="learning-style-select"
                      value={learningStyle}
                      onChange={(e) =>
                        setLearningStyle(e.target.value as LearningStylePreset)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-600 focus:outline-hidden"
                    >
                      {(Object.keys(LEARNING_STYLE_LABELS) as LearningStylePreset[]).map(
                        (stKey) => (
                          <option key={stKey} value={stKey}>
                            {LEARNING_STYLE_LABELS[stKey]}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label
                      htmlFor="custom-style-note"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Personal Study Note (Optional)
                    </label>
                    <input
                      id="custom-style-note"
                      type="text"
                      value={customStyleFeedback}
                      onChange={(e) => setCustomStyleFeedback(e.target.value)}
                      placeholder="e.g., Explain using everyday analogies"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Back to Syllabus
                  </button>
                  <button
                    type="button"
                    onClick={handleStep2Continue}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0"
                  >
                    <span>Next: Subject Difficulty &amp; Past Marks</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-slate-500">Step 3 of 3</p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                    03. Easy vs. Hard Subjects, Past Test Marks &amp; Class Sync
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Rate each subject’s difficulty, enter your previous test score (out of 100),
                    and mark chapters currently active in your classes.
                  </p>
                </div>

                {/* Subject Difficulty & Previous Marks */}
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {subjects.map((subj) => (
                    <div
                      key={subj.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{subj.name}</p>
                        <p className="text-xs text-slate-500">
                          {topics.filter((t) => t.subjectId === subj.id).length} chapters extracted
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div
                          role="group"
                          aria-label={`Difficulty for ${subj.name}`}
                          className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
                        >
                          {(['easy', 'moderate', 'hard'] as SubjectDifficulty[]).map((diff) => (
                            <button
                              key={diff}
                              type="button"
                              onClick={() => handleUpdateSubjectDifficulty(subj.id, diff)}
                              className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 ${
                                subj.difficulty === diff
                                  ? 'bg-white text-slate-900 shadow-2xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              {diff}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center gap-1.5">
                          <label
                            htmlFor={`past-score-${subj.id}`}
                            className="text-xs text-slate-600 whitespace-nowrap"
                          >
                            Past Marks:
                          </label>
                          <input
                            id={`past-score-${subj.id}`}
                            type="number"
                            min={0}
                            max={100}
                            value={subj.previousScoreOutOf100}
                            onChange={(e) =>
                              handleUpdateSubjectPastScore(subj.id, Number(e.target.value))
                            }
                            className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right font-mono tabular-nums text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                          />
                          <span className="text-xs text-slate-400 font-mono">/100</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Live Class Synchronization */}
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-2">
                    Chapters currently going on in your school/university classes (prioritized first)
                  </p>
                  <div className="max-h-44 overflow-y-auto divide-y divide-slate-100 rounded-lg border border-slate-200 px-3">
                    {topics.map((topic) => (
                      <div
                        key={topic.id}
                        className="flex items-center justify-between gap-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <span className="font-medium text-slate-900">{topic.title}</span>
                          <span className="text-slate-400"> · {topic.subjectName}</span>
                        </div>
                        <select
                          aria-label={`Class status for ${topic.title}`}
                          value={topic.classStatus}
                          onChange={(e) =>
                            handleToggleTopicClassStatus(
                              topic.id,
                              e.target.value as ClassStatus
                            )
                          }
                          className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700 focus:border-sky-600 focus:outline-hidden shrink-0"
                        >
                          <option value="ongoing">Going on in Class</option>
                          <option value="upcoming">Upcoming in Class</option>
                          <option value="covered">Already Covered</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleFinalSubmit}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Build Analytical Timetable &amp; Test Plan</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
