import type {
  Achievement,
  AppState,
  CandidateSummaryDoc,
  GlobalUpdateDoc,
  IndividualBonusDoc,
  StaffInviteDoc,
  StudentProfile,
  SubjectProfile,
  TestAttempt,
  TopicItem,
} from '../types';
import {
  evaluateAchievements,
  generateTimetable,
  recalculateSubjectScoresOutOf10,
} from '../utils/studyEngine';
import { getTodayDateISO, shiftDateISO } from '../utils/xpAndOutreachEngine';

export interface SyllabusPreset {
  id: string;
  label: string;
  institutionType: 'school' | 'university';
  boardOrUniversity: string;
  examName: string;
  rawText: string;
}

export const SYLLABUS_PRESETS: SyllabusPreset[] = [
  {
    id: 'preset-univ-eng',
    label: 'University B.Tech End-Sem',
    institutionType: 'university',
    boardOrUniversity: 'Delhi Technological University (DTU)',
    examName: 'B.Tech Sem-IV End-Term Examinations',
    rawText: `Electromagnetic Field Theory: Gauss Law & Divergence, Magnetostatics & Ampere Law, Maxwell Equations & Wave Propagation, Transmission Line Impedance
Applied Engineering Mathematics: Laplace Transforms, Fourier Series & Integrals, Partial Differential Equations, Complex Contour Integration
Operating Systems: CPU Scheduling & Concurrency, Deadlock Prevention & Banker Algorithm, Paging & Virtual Memory`,
  },
  {
    id: 'preset-cbse-12',
    label: 'CBSE Class 12 Board Finals',
    institutionType: 'school',
    boardOrUniversity: 'CBSE Class 12',
    examName: 'All-India Senior School Certificate Examination',
    rawText: `Physics: Electric Charges & Fields, Current Electricity & Kirchhoff Laws, Electromagnetic Induction & Alternating Current, Ray & Wave Optics, Semiconductor Electronics
Calculus & Algebra: Continuity & Differentiability, Definite Integrals & Differential Equations, Vectors & 3D Geometry
Physical & Organic Chemistry: Electrochemistry & Nernst Equation, Chemical Kinetics, Aldehydes Ketones & Carboxylic Acids`,
  },
  {
    id: 'preset-cs-core',
    label: 'CS & Algorithms Honours',
    institutionType: 'university',
    boardOrUniversity: 'IIT / NIT Honours Curriculum',
    examName: 'Comprehensive Algorithms & Systems Finals',
    rawText: `Design & Analysis of Algorithms: Divide & Conquer Recurrences, Dynamic Programming & Memoization, Shortest Paths & Network Flows, NP-Completeness Reductions
Database Management Systems: Relational Algebra & SQL Optimization, B+ Tree Indexing, Serializable Transactions & ARIES Recovery
Computer Networks: Reliable Transport & TCP Congestion Control, BGP & OSPF Routing, TLS Handshake Security`,
  },
];

export function createDefaultAchievements(): Achievement[] {
  return [
    {
      id: 'ach-active-learner',
      code: 'ACTIVE_LEARNER',
      title: 'Active Learner Pulse',
      description:
        'Awarded automatically while actively studying within a 3-day window. Dissolves after 3 days of inactivity as XP decays daily.',
      category: 'consistency',
      unlocked: false,
      metricBadge: 'Active Window',
      xpReward: 90,
      dissolvable: true,
    },
    {
      id: 'ach-syllabus-mapped',
      code: 'SYLLABUS_ARCHITECT',
      title: 'Syllabus Architect',
      description:
        'Indexed full examination chapters with PYQ frequency weights and peak alertness scheduling.',
      category: 'consistency',
      unlocked: false,
      metricBadge: 'Roadmap Live',
      xpReward: 60,
    },
    {
      id: 'ach-eight-plus-flex',
      code: 'EIGHT_PLUS',
      title: '8+/10 Exam Distinction',
      description:
        'Scored 8.0 or higher out of 10 on a compressed-timer PYQ daily assessment.',
      category: 'score_flex',
      unlocked: false,
      metricBadge: '8.0+ / 10',
      xpReward: 120,
    },
    {
      id: 'ach-blitz-speed-flex',
      code: 'BLITZ_SPEED',
      title: 'Countdown Blitz Sprinter',
      description:
        'Completed Adaptive Countdown Blitz at >=75% accuracy within 85% of target exam speed.',
      category: 'speed_flex',
      unlocked: false,
      metricBadge: 'Sub-85% Time',
      xpReward: 130,
    },
    {
      id: 'ach-high-yield-master',
      code: 'HIGH_YIELD_MASTER',
      title: 'High-Yield PYQ Conqueror',
      description:
        'Completed at least 50% of all High-Yield past-paper chapters across your curriculum.',
      category: 'mastery',
      unlocked: false,
      metricBadge: '50%+ High-Yield',
      xpReward: 140,
    },
    {
      id: 'ach-focus-marathon',
      code: 'DEEP_FOCUS_50',
      title: '50-Minute Deep Focus',
      description:
        'Logged 50+ minutes of uninterrupted deep study focus blocks inside the SyllabiQ workspace.',
      category: 'consistency',
      unlocked: false,
      metricBadge: '50m+ Focus',
      xpReward: 85,
    },
    {
      id: 'ach-resilient-planner',
      code: 'ZERO_BACKLOG',
      title: 'Resilient Zero-Backlog Planner',
      description:
        'Dynamically re-optimized a missed study day without allowing chapter backlog to pile up.',
      category: 'consistency',
      unlocked: false,
      metricBadge: 'Zero Backlog',
      xpReward: 95,
    },
    {
      id: 'ach-nine-distinction',
      code: 'NINE_SOVEREIGN',
      title: '9+/10 Sovereign Distinction',
      description:
        'Achieved an elite 9.0+ / 10 score under compressed exam conditions.',
      category: 'score_flex',
      unlocked: false,
      metricBadge: '9.0+ / 10',
      xpReward: 180,
    },
  ];
}

export function ensureCompleteAchievementsCatalog(existing: Achievement[]): Achievement[] {
  const defaults = createDefaultAchievements();
  const byId = new Map(existing.map((a) => [a.id, a]));
  return defaults.map((def) => {
    const prev = byId.get(def.id);
    if (!prev) return def;
    return {
      ...def,
      ...prev,
      xpReward: prev.xpReward ?? def.xpReward,
      dissolvable: def.dissolvable ?? prev.dissolvable,
    };
  });
}

export function createEmptyAppState(): AppState {
  const today = getTodayDateISO();
  const examDate = shiftDateISO(today, 16);

  return {
    onboarded: false,
    student: {
      name: '',
      email: '',
      phoneNumber: '',
      notifyGmailOptIn: true,
      notifyWhatsappOptIn: true,
      lastActiveDate: today,
      institutionType: 'university',
      boardOrUniversity: '',
      examName: '',
      examDate,
      dailyStudyHours: 4.5,
      alertnessWindow: 'early_morning',
      learningStyle: 'visual_analogies',
      customStyleFeedback: '',
      createdAt: today,
    },
    subjects: [],
    topics: [],
    schedule: [],
    attempts: [],
    achievements: createDefaultAchievements(),
    focusSessionsCompleted: 0,
    focusMinutesTotal: 0,
  };
}

export function createDemoSeedState(): AppState {
  const today = getTodayDateISO();
  const yesterday = shiftDateISO(today, -1);
  const twoDaysAgo = shiftDateISO(today, -2);
  const examDate = shiftDateISO(today, 14);

  const stalePracticeDate = shiftDateISO(today, -53);

  const student: StudentProfile = {
    name: 'Demo Scholar',
    accountRole: 'student',
    avatarVisibility: 'world',
    email: '',
    phoneNumber: '',
    notifyGmailOptIn: true,
    notifyWhatsappOptIn: true,
    lastActiveDate: today,
    recoveredEthicsXp: 0,
    recoveredDeductionIds: [],
    institutionType: 'university',
    boardOrUniversity: 'Delhi Technological University (DTU)',
    examName: 'B.Tech Sem-IV End-Term Finals',
    examDate,
    dailyStudyHours: 5,
    alertnessWindow: 'early_morning',
    learningStyle: 'step_by_step',
    customStyleFeedback: 'Break derivations into numbered steps with physical intuition first.',
    createdAt: twoDaysAgo,
  };

  const baseSubjects: SubjectProfile[] = [
    {
      id: 'subj-1',
      name: 'Electromagnetic Field Theory',
      difficulty: 'hard',
      previousScoreOutOf100: 61,
      currentRatingOutOf10: null,
      questionsAnswered: 0,
      questionsCorrect: 0,
      lastPracticedDateISO: today,
    },
    {
      id: 'subj-2',
      name: 'Applied Engineering Calculus',
      difficulty: 'moderate',
      previousScoreOutOf100: 76,
      currentRatingOutOf10: null,
      questionsAnswered: 0,
      questionsCorrect: 0,
      lastPracticedDateISO: stalePracticeDate,
    },
    {
      id: 'subj-3',
      name: 'Operating Systems',
      difficulty: 'moderate',
      previousScoreOutOf100: 79,
      currentRatingOutOf10: null,
      questionsAnswered: 0,
      questionsCorrect: 0,
      lastPracticedDateISO: today,
    },
  ];

  const topics: TopicItem[] = [
    {
      id: 'topic-1-1',
      subjectId: 'subj-1',
      subjectName: 'Electromagnetic Field Theory',
      title: 'Gauss Law & Electric Flux Divergence',
      estimatedHours: 2.5,
      yieldType: 'high',
      pyqFrequencyNote: 'Appears in 82% of DTU End-Sem papers (10–15 marks)',
      classStatus: 'covered',
      completed: true,
      completedAt: twoDaysAgo,
      masteryPercent: 88,
      youtubeQuery: 'Gauss Law Divergence Theorem Electromagnetic Field Theory PYQ lecture',
      youtubeTitle: 'Gauss Law & Divergence Theorem — University PYQ Masterclass',
      youtubeChannelHint: 'NPTEL Electrical Engineering',
      keyConcepts: [
        'Differential & integral forms of Gauss Law',
        'Spherical & cylindrical charge symmetry shells',
        'Divergence theorem boundary flux evaluation',
      ],
    },
    {
      id: 'topic-1-2',
      subjectId: 'subj-1',
      subjectName: 'Electromagnetic Field Theory',
      title: 'Maxwell Equations & Time-Varying Fields',
      estimatedHours: 3,
      yieldType: 'high',
      pyqFrequencyNote: 'Appears in 90% of DTU End-Sem papers (compulsory Q1/Q5)',
      classStatus: 'ongoing',
      completed: true,
      completedAt: yesterday,
      masteryPercent: 84,
      youtubeQuery: 'Maxwell Equations Displacement Current Time Varying Fields University PYQ',
      youtubeTitle: 'Maxwell Equations & Displacement Current Derivation',
      youtubeChannelHint: 'MIT OpenCourseWare / NPTEL',
      keyConcepts: [
        'Faraday-Lenz induced EMF in moving conductors',
        'Ampere-Maxwell displacement current density J_d',
        'Poynting theorem & electromagnetic power flow',
      ],
    },
    {
      id: 'topic-1-3',
      subjectId: 'subj-1',
      subjectName: 'Electromagnetic Field Theory',
      title: 'Plane Wave Propagation & Skin Depth',
      estimatedHours: 2.5,
      yieldType: 'high',
      pyqFrequencyNote: 'Appears in 72% of past 6 years papers',
      classStatus: 'ongoing',
      completed: false,
      masteryPercent: 34,
      youtubeQuery: 'Uniform Plane Wave Propagation Lossy Dielectrics Skin Depth PYQ',
      youtubeTitle: 'Plane Waves in Lossy Media & Skin Depth Numericals',
      youtubeChannelHint: 'GATE & University EMFT Lectures',
      keyConcepts: [
        'Attenuation constant alpha & phase constant beta',
        'Intrinsic impedance in good conductors',
        'Skin depth frequency scaling',
      ],
    },
    {
      id: 'topic-1-4',
      subjectId: 'subj-1',
      subjectName: 'Electromagnetic Field Theory',
      title: 'Electrostatic Boundary Conditions',
      estimatedHours: 1.5,
      yieldType: 'low',
      pyqFrequencyNote: 'Short-note & 5-mark numerical (~30% weight)',
      classStatus: 'upcoming',
      completed: false,
      masteryPercent: 25,
      youtubeQuery: 'Dielectric Boundary Conditions Tangential E Normal D EMFT',
      youtubeTitle: 'Dielectric-Dielectric & Conductor Boundary Conditions',
      youtubeChannelHint: 'University Physics Studio',
      keyConcepts: [
        'Continuity of tangential electric field E_t',
        'Discontinuity of normal displacement flux D_n',
        'Refraction of electric flux lines across interfaces',
      ],
    },
    {
      id: 'topic-2-1',
      subjectId: 'subj-2',
      subjectName: 'Applied Engineering Calculus',
      title: 'Laplace Transforms & Unit Impulse Systems',
      estimatedHours: 2.5,
      yieldType: 'high',
      pyqFrequencyNote: 'Appears in 88% of Applied Math finals',
      classStatus: 'covered',
      completed: true,
      completedAt: stalePracticeDate,
      masteryPercent: 91,
      youtubeQuery: 'Laplace Transform Convolution Initial Value Problem Engineering Math PYQ',
      youtubeTitle: 'Laplace Transforms, Dirac Delta & IVP Differential Equations',
      youtubeChannelHint: 'Engineering Mathematics Academy',
      keyConcepts: [
        'First & second shifting theorems',
        'Convolution theorem for inverse Laplace',
        'Solving 2nd-order ODEs with impulse forcing',
      ],
    },
    {
      id: 'topic-2-2',
      subjectId: 'subj-2',
      subjectName: 'Applied Engineering Calculus',
      title: 'Fourier Series & Parseval Identity',
      estimatedHours: 2,
      yieldType: 'high',
      pyqFrequencyNote: 'Appears in 76% of university past papers',
      classStatus: 'ongoing',
      completed: true,
      completedAt: stalePracticeDate,
      masteryPercent: 86,
      youtubeQuery: 'Half Range Fourier Series Parseval Identity Engineering Maths PYQ',
      youtubeTitle: 'Even/Odd Symmetry Fourier Series & Parseval Energy Theorem',
      youtubeChannelHint: 'Higher Engineering Math',
      keyConcepts: [
        'Dirichlet convergence conditions',
        'Half-range cosine and sine expansions',
        'Parseval identity series summation tricks',
      ],
    },
    {
      id: 'topic-2-3',
      subjectId: 'subj-2',
      subjectName: 'Applied Engineering Calculus',
      title: 'Cauchy Residue Theorem & Contour Integrals',
      estimatedHours: 2.5,
      yieldType: 'high',
      pyqFrequencyNote: 'High-scoring 12-mark final section problem',
      classStatus: 'upcoming',
      completed: false,
      masteryPercent: 40,
      youtubeQuery: 'Cauchy Residue Theorem Laurent Series Real Improper Integrals PYQ',
      youtubeTitle: 'Laurent Series, Poles & Cauchy Residue Contour Integration',
      youtubeChannelHint: 'University Calculus Archive',
      keyConcepts: [
        'Classification of isolated singularities & poles',
        'Residue calculation at higher-order poles',
        'Evaluating real trigonometric & improper integrals',
      ],
    },
    {
      id: 'topic-3-1',
      subjectId: 'subj-3',
      subjectName: 'Operating Systems',
      title: 'CPU Scheduling & Multi-Level Feedback Queues',
      estimatedHours: 2,
      yieldType: 'high',
      pyqFrequencyNote: 'Gantt chart numerical in 85% of OS exams',
      classStatus: 'covered',
      completed: true,
      completedAt: yesterday,
      masteryPercent: 92,
      youtubeQuery: 'SRTF Round Robin MLFQ CPU Scheduling Gantt Chart PYQ',
      youtubeTitle: 'Preemptive SRTF, Round Robin & Turnaround Time Numericals',
      youtubeChannelHint: 'Systems & OS Lecture Hub',
      keyConcepts: [
        'Turnaround, waiting & response time trade-offs',
        'Convoy effect vs starvation & aging',
        'Context-switch overhead calculation',
      ],
    },
    {
      id: 'topic-3-2',
      subjectId: 'subj-3',
      subjectName: 'Operating Systems',
      title: 'Deadlock Avoidance & Banker Algorithm',
      estimatedHours: 2,
      yieldType: 'high',
      pyqFrequencyNote: 'Safe-sequence matrix problem in 80% of OS papers',
      classStatus: 'ongoing',
      completed: false,
      masteryPercent: 48,
      youtubeQuery: 'Banker Algorithm Safe Sequence Resource Request OS PYQ',
      youtubeTitle: 'Coffman Conditions & Banker Safe-State Matrix Walkthrough',
      youtubeChannelHint: 'CS Core Systems',
      keyConcepts: [
        'Need = Max - Allocation matrix invariant',
        'Resource-Allocation Graph cycle detection',
        'Immediate grant validation under Banker safety check',
      ],
    },
    {
      id: 'topic-3-3',
      subjectId: 'subj-3',
      subjectName: 'Operating Systems',
      title: 'Demand Paging, TLB Hit Ratio & Thrashing',
      estimatedHours: 1.5,
      yieldType: 'low',
      pyqFrequencyNote: 'Effective memory access time numerical (~40% papers)',
      classStatus: 'upcoming',
      completed: false,
      masteryPercent: 30,
      youtubeQuery: 'Effective Access Time TLB Page Fault LRU Belady Anomaly OS',
      youtubeTitle: 'TLB Effective Access Time & LRU/Optimal Page Replacement',
      youtubeChannelHint: 'CS Core Systems',
      keyConcepts: [
        'Effective Access Time (EAT) with TLB + page fault service',
        'LRU stack property vs FIFO Belady anomaly',
        'Working-set window & thrashing control',
      ],
    },
  ];

  const attempts: TestAttempt[] = [
    {
      id: 'att-seed-1',
      mode: 'daily_target',
      dateISO: stalePracticeDate,
      dayDateISO: stalePracticeDate,
      difficultyTier: 'Exam Standard',
      durationSeconds: 185,
      targetTimeSeconds: 240,
      standardExamTimeSeconds: 360,
      totalQuestions: 6,
      correctCount: 5,
      accuracyPercent: 83,
      overallScoreOutOf10: 8.3,
      subjectBreakdown: [
        {
          subjectId: 'subj-1',
          subjectName: 'Electromagnetic Field Theory',
          correct: 2,
          total: 3,
          scoreOutOf10: 6.7,
        },
        {
          subjectId: 'subj-2',
          subjectName: 'Applied Engineering Calculus',
          correct: 3,
          total: 3,
          scoreOutOf10: 10.0,
        },
      ],
      answers: [],
      unlockedAchievementIds: ['ach-eight-plus-flex'],
    },
    {
      id: 'att-seed-2',
      mode: 'countdown_blitz',
      dateISO: today,
      difficultyTier: 'Advanced PYQ',
      durationSeconds: 142,
      targetTimeSeconds: 200,
      standardExamTimeSeconds: 320,
      totalQuestions: 5,
      correctCount: 5,
      accuracyPercent: 100,
      overallScoreOutOf10: 10.0,
      subjectBreakdown: [
        {
          subjectId: 'subj-1',
          subjectName: 'Electromagnetic Field Theory',
          correct: 2,
          total: 2,
          scoreOutOf10: 10.0,
        },
        {
          subjectId: 'subj-3',
          subjectName: 'Operating Systems',
          correct: 3,
          total: 3,
          scoreOutOf10: 10.0,
        },
      ],
      answers: [],
      unlockedAchievementIds: ['ach-blitz-speed-flex', 'ach-nine-distinction'],
    },
  ];

  const { updatedSubjects } = recalculateSubjectScoresOutOf10(baseSubjects, attempts);
  const schedule = generateTimetable(student, updatedSubjects, topics, today, attempts.length);

  const focusMinutesTotal = 75;
  const evalResult = evaluateAchievements(
    createDefaultAchievements(),
    attempts,
    topics,
    false,
    student.name,
    {
      lastActiveDate: student.lastActiveDate,
      referenceDateISO: today,
      focusMinutesTotal,
    }
  );

  return {
    onboarded: true,
    student,
    subjects: updatedSubjects,
    topics,
    schedule,
    attempts,
    achievements: evalResult.achievements,
    focusSessionsCompleted: 3,
    focusMinutesTotal,
    aiStrategyBriefing: {
      headline:
        'Schedule Plane Wave Propagation in your 05:30–08:00 peak slot to push EMFT above 8.5/10.',
      alertnessStrategy:
        'Your early-morning alertness window carries zero cognitive fatigue—ideal for Maxwell curl derivations and Residue contour integrals.',
      pyqFocusAdvice:
        '5 of 8 High-Yield PYQ chapters are already locked in. Finishing Plane Waves and Banker Algorithm covers 78% of historical exam marks.',
      classSyncTip:
        'Review Banker Safe-Sequence matrices tonight so tomorrow’s ongoing OS lecture doubles as timed revision.',
      actionableSteps: [
        'Complete Plane Wave Propagation & Skin Depth during tomorrow’s 05:30 peak block.',
        'Run a 6-question Daily PYQ Target to lift EMFT accuracy from 80% to 90%+.',
        'Log one 25-minute focus sprint on Cauchy Residue poles to cross the 1,000 XP Epic Amethyst FlexCard milestone.',
      ],
      generatedAt: today,
      usedAi: false,
    },
  };
}

export function createStarterGlobalUpdates(): GlobalUpdateDoc[] {
  const today = getTodayDateISO();
  return [
    {
      id: 'upd-starter-1',
      authorUid: 'super-admin-rohit',
      authorName: 'Rohit Shree',
      authorRoleLabel: 'Super Admin',
      title: 'Rare XP FlexCards & Automatic Achievement Milestones Now Live',
      body: 'Every completed syllabus chapter, deep focus sprint, and high-accuracy PYQ drill automatically awards XP and upgrades your FlexCard rarity tier for WhatsApp, LinkedIn, and Instagram sharing. Stay active at least once every 3 days to protect your Active Learner badge and XP.',
      category: 'feature_update',
      visibility: 'public',
      pinned: true,
      createdAt: today,
      updatedAt: today,
    },
    {
      id: 'upd-starter-2',
      authorUid: 'super-admin-rohit',
      authorName: 'Rohit Shree',
      authorRoleLabel: 'Super Admin',
      title: 'High-Yield PYQ Sprint Window: Prioritize Compulsory Derivation Units',
      body: 'Candidates with exams within 21 days should complete at least two High-Yield PYQ chapters inside their peak alertness window before attempting Countdown Blitz.',
      category: 'exam_alert',
      visibility: 'public',
      pinned: false,
      createdAt: today,
      updatedAt: today,
    },
  ];
}

export function createStarterSandboxCandidates(): CandidateSummaryDoc[] {
  return [];
}

export function createStarterSandboxBonuses(): IndividualBonusDoc[] {
  return [];
}

export function createStarterSandboxInvites(): StaffInviteDoc[] {
  const today = getTodayDateISO();
  return [
    {
      inviteKey: 'priya_menon_academic_gmail_com',
      targetEmail: 'priya.menon.academic@gmail.com',
      adminPhone: '+91 98201 11223',
      displayName: 'Prof. Priya Menon',
      canPostUpdates: true,
      canGrantBonuses: true,
      canBanUsers: false,
      status: 'active',
      createdByUid: 'super-admin-rohit',
      createdAt: today,
      updatedAt: today,
    },
    {
      inviteKey: 'vikram_desai_mentor_gmail_com',
      targetEmail: 'vikram.desai.mentor@gmail.com',
      adminPhone: '+91 98450 77889',
      displayName: 'Vikram Desai',
      canPostUpdates: true,
      canGrantBonuses: false,
      canBanUsers: false,
      status: 'active',
      createdByUid: 'super-admin-rohit',
      createdAt: today,
      updatedAt: today,
    },
  ];
}
