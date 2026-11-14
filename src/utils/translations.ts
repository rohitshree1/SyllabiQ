import type { AppLanguage } from '../types.ts';

export const LANGUAGE_STORAGE_KEY = 'syllabiq_language';
export const DEFAULT_LANGUAGE: AppLanguage = 'en';

export const SUPPORTED_LANGUAGES: { code: AppLanguage; label: string; nativeLabel: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
];

export const TRANSLATIONS = {
  en: {
    // Top Bar & App Info
    appName: 'SyllabiQ',
    tagline: 'Adaptive Exam & Syllabus Planner',
    workspace: 'Workspace',
    signInCloud: 'Sign In / Cloud',
    signInCloudSync: 'Sign In / Cloud Sync',
    offlineTimetablePdf: 'Offline Timetable PDF',
    pdfShort: 'PDF',
    privacyPolicy: 'Privacy Policy',
    aboutSyllabiq: 'About SyllabiQ',
    rareFlexCards: 'Rare FlexCards',
    verifySerialNav: 'Verify Serial',
    adminGovernance: 'Admin Governance',
    signInWithGoogle: 'Sign In with Google',
    vault: 'Vault',
    verifyId: 'Verify ID',
    verifyAnySerial: 'Verify Any Serial',
    rareXpBanner:
      'Rare XP FlexCards & Automatic Achievement Milestones Now Live · Every completed syllabus chapter, deep focus sprint, and high-accuracy PYQ drill automatically awards XP and upgrades your FlexCard rarity tier for WhatsApp, LinkedIn, and Instagram sharing.',

    // Navigation Items
    nav_dashboard: 'Analytics Dashboard',
    nav_planner: 'Study Planner',
    nav_daily_test: 'Daily PYQ Test',
    nav_adaptive_blitz: 'Adaptive Countdown',
    nav_social: 'Social SyllabiQ',
    nav_profile: 'Profile & Report Card',
    nav_achievements: 'Achievements & Flex',
    nav_about: 'About & Referrals',
    nav_admin: 'Admin Governance',

    short_dashboard: 'Dashboard',
    short_planner: 'Planner',
    short_daily_test: 'PYQ Test',
    short_adaptive_blitz: 'Blitz',
    short_social: 'Social',
    short_profile: 'Profile',
    short_achievements: 'Flex',
    short_about: 'About',
    short_admin: 'Admin',

    // Dashboard Cards & Metrics
    examReadinessScore: 'Exam Readiness Score',
    buildingMomentum: 'Building Momentum',
    syllabusVelocity: 'Syllabus Velocity (Completed vs. Target)',
    completedVsTarget: 'Completed vs. Target',
    aheadOfTarget: 'Ahead of Target',
    overallPyqRating: 'Overall PYQ Test Rating',
    aggregatedUnderCompressed: 'Aggregated across 3 subjects under compressed time',
    highVsLowYieldMastery: 'High-Yield vs. Low-Yield Mastery',
    deepFocusStudyRoom: 'Deep Focus Study Room',
    focusTarget: 'Focus Target',
    startFocus: 'Start Focus',
    reset: 'Reset',
    completeLog25m: 'Complete & Log +25m Block',
    deepStudy25m: '25m Deep Study',
    pyqSprint45m: '45m PYQ Sprint',
    reset5m: '5m Reset',
    nextScheduledFocusQueue: 'Next Scheduled Focus Queue',
    openPlanner: 'Open Planner',
    giveDailyTest: 'Give Daily Test',
    startTodaysTest: 'Start Today’s PYQ Test',
    viewFullReportCard: 'View Full Report Card',
    generateAiStudyStrategy: 'Generate AI Study Strategy',
    highYieldPyq: 'High-Yield PYQ',
    lowYield: 'Low-Yield',
    activeInClass: 'Active in Class',
    coveredInClass: 'Covered in Class',
    upcomingInClass: 'Upcoming in Class',
    pending: 'Pending',
    done: 'Done',
    markCompleted: 'Mark as completed',
    markIncomplete: 'Mark as incomplete',

    // 7-Day Badge Luster Warning & Skill Refresh
    lusterWarningTitle:
      '{days} days since last {subject} drill — 1 quick sprint keeps Full Badge Luster',
    lusterWarningSub:
      '7-Day Luster Warning · Badge dims in {daysUntilDim} days · Last drill {lastDate}',
    startQuickSprint: 'Start Quick Sprint',
    skillRefreshNeeded: 'Skill Refresh Needed',
    restoreFlexCardLuster: 'Restore FlexCard Luster: {subject}',
    restoreLusterDesc:
      'When a subject goes unpracticed for 60+ days, SyllabiQ displays a subtle Skill Refresh Needed notice on your FlexCard so employers and faculty verifiers can trust up-to-date competence. Complete this 3-question check to restore full badge luster immediately.',
    verifyAndRestoreBadge: 'Verify & Restore Badge Luster',
    fullLusterRestoredTitle: 'Full FlexCard Badge Luster Restored!',
    returnToPolishedFlex: 'Return to Polished FlexCard',
    cancel: 'Cancel',

    // Credential Verification Modal
    verifyModalTitle: 'Verify FlexCard or Report Card Serial',
    verifyModalDesc:
      'Enter any official SyllabiQ credential serial code (SLQ-FC-... or SLQ-RC-...) to authenticate genuine exam mastery.',
    enterCodeLabel: 'Enter Credential Serial Code',
    verifyButton: 'Verify Credential',
    verifying: 'Verifying...',
    sampleFlexCard: 'Sample FlexCard',
    sampleReportCard: 'Sample Report Card',

    // Onboarding alerts
    nameRequiredAlert: 'Please provide your name to personalize your study timetable and FlexCards.',
  },
};

export type TranslationKey = keyof typeof TRANSLATIONS.en;

export function resolveAppLanguage(_paramString?: string): AppLanguage {
  return DEFAULT_LANGUAGE;
}

export function persistAppLanguage(_lang: AppLanguage): void {
  // English only
}

export function t(
  key: TranslationKey,
  _lang: AppLanguage = DEFAULT_LANGUAGE,
  replacements?: Record<string, string | number>
): string {
  let text: string = TRANSLATIONS.en[key] || key;

  if (replacements) {
    for (const [placeholder, val] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(val));
    }
  }
  return text;
}
