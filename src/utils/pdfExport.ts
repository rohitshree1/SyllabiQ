import { jsPDF } from 'jspdf';
import type { AppState, TestAttempt } from '../types';
import { createCredentialVerificationQr } from './qrVerification';
import {
  ALERTNESS_SLOT_MAP,
  LEARNING_STYLE_LABELS,
  recalculateSubjectScoresOutOf10,
} from './studyEngine';

export function downloadTimetablePdf(state: AppState): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 44;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 44) {
      doc.addPage();
      y = 44;
    }
  };

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 88, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('SyllabiQ — Offline Academic Study Timetable', margin, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const slotInfo = ALERTNESS_SLOT_MAP[state.student.alertnessWindow];
  doc.text(
    `${state.student.name}  |  ${state.student.boardOrUniversity} (${state.student.examName})  |  Target Exam: ${state.student.examDate}`,
    margin,
    56
  );
  doc.text(
    `Peak Alertness: ${slotInfo.label} (${slotInfo.peakRange})  |  Daily Comfort Budget: ${state.student.dailyStudyHours} hrs/day`,
    margin,
    72
  );

  y = 112;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Subject Priority & Baseline Diagnostic', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  for (const subj of state.subjects) {
    ensureSpace(18);
    const ratingStr =
      subj.currentRatingOutOf10 !== null ? `${subj.currentRatingOutOf10}/10` : 'Pending first test';
    doc.text(
      `• ${subj.name} — Difficulty: ${subj.difficulty.toUpperCase()}  |  Past Marks: ${subj.previousScoreOutOf100}/100  |  Current PYQ Rating: ${ratingStr}`,
      margin + 6,
      y
    );
    y += 15;
  }

  y += 10;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Day-by-Day Study & Compressed Test Schedule (Print & Tick Offline)', margin, y);
  y += 18;

  for (const day of state.schedule) {
    ensureSpace(85);
    doc.setFillColor(241, 245, 249);
    doc.rect(margin, y - 12, pageWidth - margin * 2, 22, 'F');
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);

    const statusTag = day.missed
      ? '[MISSED — REDISTRIBUTED]'
      : day.reoptimizedExtraHours > 0
      ? `[SMOOTHED +${Math.round(day.reoptimizedExtraHours * 60)}m]`
      : '';
    doc.text(
      `Day ${day.dayIndex + 1} · ${day.dateISO}  —  Total Study: ${day.totalHours} hrs ${statusTag}`,
      margin + 8,
      y + 3
    );
    y += 22;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    if (day.sessions.length === 0) {
      doc.setTextColor(100, 116, 139);
      doc.text('   No active study blocks (marked missed and redistributed across upcoming days).', margin, y);
      y += 15;
    } else {
      for (const sess of day.sessions) {
        ensureSpace(32);
        const tick = sess.completed ? '[x]' : '[ ]';
        const yieldLabel = sess.yieldType === 'high' ? 'HIGH-YIELD PYQ' : 'Low-Yield';
        const classLabel = sess.classStatus === 'ongoing' ? ' · ACTIVE IN CLASS' : '';
        doc.setTextColor(15, 23, 42);
        doc.text(
          `${tick} ${sess.timeSlotLabel} | ${sess.subjectName}: ${sess.topicTitle} (${sess.durationHours}h · ${yieldLabel}${classLabel})`,
          margin + 6,
          y
        );
        y += 13;
        doc.setTextColor(71, 85, 105);
        doc.setFontSize(8.2);
        doc.text(
          `      Offline Video Ref: Search YouTube "${sess.youtubeQuery.slice(0, 78)}"`,
          margin + 6,
          y
        );
        doc.setFontSize(9);
        y += 15;
      }
    }

    ensureSpace(22);
    const tTarget = day.dailyTestTarget;
    const targetTick = tTarget.completed ? '[x]' : '[ ]';
    const mins = Math.round(tTarget.compressedTimeSeconds / 60);
    const stdMins = Math.round(tTarget.standardExamTimeSeconds / 60);
    doc.setTextColor(2, 132, 199);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.text(
      `${targetTick} DAILY PYQ TEST TARGET: ${tTarget.targetQuestionCount} Questions (${tTarget.difficultyTier}) in ${mins} mins (vs ${stdMins}m standard exam pace)`,
      margin + 6,
      y
    );
    y += 20;
  }

  doc.save(`SyllabiQ-Timetable-${state.student.name.replace(/\s+/g, '-')}.pdf`);
}

export function downloadReportCardPdf(
  state: AppState,
  filteredAttempts: TestAttempt[],
  subjectFilterLabel: string,
  timeframeFilterLabel: string,
  options?: {
    reportSerialCode?: string;
    studentAboutLines?: string[];
    originUrl?: string;
  }
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = 44;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 44) {
      doc.addPage();
      y = 44;
    }
  };

  const { updatedSubjects, overallSyllabusScoreOutOf10 } = recalculateSubjectScoresOutOf10(
    state.subjects,
    filteredAttempts
  );

  const serialCode = options?.reportSerialCode || 'SLQ-RC-VERIFIED';
  const qrVerification = createCredentialVerificationQr(serialCode, options?.originUrl);

  // Header Banner with Embedded Vector QR Verification Stamp
  const headerHeight = 116;
  const qrCardWidth = 86;
  const qrCardHeight = 96;
  const qrCardX = pageWidth - margin - qrCardWidth;
  const qrCardY = 10;
  const leftTextMaxWidth = qrCardX - margin - 14;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, headerHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16.5);
  doc.text('SyllabiQ — Academic Assessment Report Card', margin, 30);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const studentLine = (
    doc.splitTextToSize(
      `Student: ${state.student.name}  |  Board/University: ${state.student.boardOrUniversity}  |  Exam: ${state.student.examName}`,
      leftTextMaxWidth
    ) as string[]
  )[0];
  doc.text(studentLine || `Student: ${state.student.name}`, margin, 49);

  const filterLine = (
    doc.splitTextToSize(
      `Scope — Subject: ${subjectFilterLabel}  |  Period: ${timeframeFilterLabel}  |  Generated: ${new Date()
        .toISOString()
        .slice(0, 10)}`,
      leftTextMaxWidth
    ) as string[]
  )[0];
  doc.text(filterLine || `Subject: ${subjectFilterLabel}`, margin, 65);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(125, 211, 252);
  doc.text(`Official Verification Serial: ${qrVerification.serialCode}`, margin, 83);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225);
  const urlLine = (
    doc.splitTextToSize(`One-Scan Verify URL: ${qrVerification.verifyUrl}`, leftTextMaxWidth) as string[]
  )[0];
  doc.text(urlLine || qrVerification.verifyUrl, margin, 99);

  // Vector QR Stamp Card (top-right, camera-scannable from print or screen)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(56, 189, 248);
  doc.setLineWidth(1.2);
  doc.rect(qrCardX, qrCardY, qrCardWidth, qrCardHeight, 'FD');

  const quietModules = 2;
  const totalModules = qrVerification.matrix.size + quietModules * 2;
  const qrSquarePt = 72;
  const qrOriginX = qrCardX + (qrCardWidth - qrSquarePt) / 2;
  const qrOriginY = qrCardY + 5;
  const cellPt = qrSquarePt / totalModules;

  doc.setFillColor(15, 23, 42);
  for (let r = 0; r < qrVerification.matrix.size; r++) {
    for (let c = 0; c < qrVerification.matrix.size; c++) {
      if (qrVerification.matrix.modules[r][c]) {
        doc.rect(
          qrOriginX + (c + quietModules) * cellPt,
          qrOriginY + (r + quietModules) * cellPt,
          cellPt + 0.12,
          cellPt + 0.12,
          'F'
        );
      }
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(15, 23, 42);
  doc.text('SCAN TO VERIFY', qrCardX + qrCardWidth / 2, qrCardY + qrCardHeight - 7, {
    align: 'center',
  });

  y = 140;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  const overallText =
    overallSyllabusScoreOutOf10 !== null
      ? `${overallSyllabusScoreOutOf10} / 10.0`
      : 'No Graded Tests in Filter';
  doc.text(`Aggregate Score (Filtered Scope): ${overallText}`, margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Saved Learning Style: ${LEARNING_STYLE_LABELS[state.student.learningStyle]}${
      state.student.customStyleFeedback ? ` ("${state.student.customStyleFeedback}")` : ''
    }`,
    margin,
    y
  );
  y += 22;

  if (options?.studentAboutLines && options.studentAboutLines.length > 0) {
    ensureSpace(140);
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text('About the Student (AI Performance & Discipline Dossier)', margin, y);
    y += 15;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(51, 65, 85);
    for (const line of options.studentAboutLines.slice(0, 15)) {
      const wrapped = doc.splitTextToSize(line, pageWidth - margin * 2 - 8) as string[];
      ensureSpace(wrapped.length * 12 + 4);
      doc.text(wrapped, margin + 4, y);
      y += wrapped.length * 11.5 + 2;
    }
    y += 10;
    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 18;
  }

  // Subject ratings out of 10
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('Per-Subject Score Breakdown (Out of 10)', margin, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  for (const subj of updatedSubjects) {
    ensureSpace(18);
    const scoreStr =
      subj.currentRatingOutOf10 !== null
        ? `${subj.currentRatingOutOf10} / 10  (${subj.questionsCorrect}/${subj.questionsAnswered} PYQ items correct)`
        : 'No attempts in selected filter';
    doc.text(`• ${subj.name}:  ${scoreStr}`, margin + 6, y);
    y += 16;
  }

  y += 12;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text(`Detailed Test Log (${filteredAttempts.length} Assessments)`, margin, y);
  y += 18;

  if (filteredAttempts.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('No completed test attempts match the selected subject and date filter.', margin, y);
  } else {
    for (const att of filteredAttempts) {
      ensureSpace(46);
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 11, pageWidth - margin * 2, 34, 'F');
      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      const modeName = att.mode === 'daily_target' ? 'Daily PYQ Target' : 'Adaptive Countdown Blitz';
      doc.text(
        `${att.dateISO} · ${modeName} (${att.difficultyTier}) — Score: ${att.overallScoreOutOf10}/10 (${att.accuracyPercent}%)`,
        margin + 8,
        y + 2
      );
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      const subjSummary = att.subjectBreakdown
        .map((s) => `${s.subjectName}: ${s.scoreOutOf10}/10`)
        .join('  |  ');
      doc.text(
        `Time: ${att.durationSeconds}s (Target ${att.targetTimeSeconds}s)  |  Subjects: ${subjSummary}`,
        margin + 8,
        y + 16
      );
      y += 42;
    }
  }

  doc.save(
    `SyllabiQ-ReportCard-${subjectFilterLabel.replace(/\s+/g, '-')}-${timeframeFilterLabel.replace(/\s+/g, '-')}.pdf`
  );
}

export interface PrivacyDisclosurePdfItem {
  category: string;
  exactDataCollected: string;
  purposeAndUsage: string;
  whoCanAccess: string;
}

export function downloadPrivacyPolicyPdf(items: PrivacyDisclosurePdfItem[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  const usableWidth = pageWidth - margin * 2;
  let y = 44;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 44;
    }
  };

  // Header Banner
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 92, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(17);
  doc.text('SyllabiQ — Candidate Privacy Policy & Data Usage Charter', margin, 36);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(
    'Zero Third-Party Ads  |  Strict Educational & Credential Integrity Scope  |  Candidate-Controlled Sharing',
    margin,
    55
  );
  doc.setTextColor(125, 211, 252);
  doc.text(
    `Generated: ${new Date().toISOString().slice(0, 10)}  |  Complete Field-by-Field Data Collection & Purpose Inventory`,
    margin,
    73
  );

  y = 116;
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.text('Plain-Language Data Protection Summary', margin, y);
  y += 15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  const introLines = doc.splitTextToSize(
    'SyllabiQ operates completely free of advertising networks, behavioral trackers, and data brokers. Every data field listed below is collected strictly to build your biological-alertness study schedule and mastery charts, embed QR-verifiable FlexCard and Report Card serials, power Profile ID-searchable World and 1-on-1 Private Social SyllabiQ conversations (with zero group chats), support constructive academic ethics recovery and Super Admin appeals, and enable opt-in mentor guidance.',
    usableWidth
  ) as string[];
  doc.text(introLines, margin, y);
  y += introLines.length * 12 + 14;

  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Complete Itemized Inventory: Information Collected & Why We Use It', margin, y);
  y += 18;

  for (const row of items) {
    const collectedWrapped = doc.splitTextToSize(
      `Information Collected: ${row.exactDataCollected}`,
      usableWidth - 16
    ) as string[];
    const purposeWrapped = doc.splitTextToSize(
      `Why We Use It: ${row.purposeAndUsage}`,
      usableWidth - 16
    ) as string[];
    const blockHeight = 26 + (collectedWrapped.length + purposeWrapped.length) * 11.5 + 16;

    ensureSpace(blockHeight + 10);

    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y - 11, usableWidth, blockHeight, 'F');

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`${row.category}   [Access: ${row.whoCanAccess}]`, margin + 8, y + 3);
    y += 17;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(30, 41, 59);
    doc.text(collectedWrapped, margin + 8, y);
    y += collectedWrapped.length * 11.5 + 3;

    doc.setTextColor(71, 85, 105);
    doc.text(purposeWrapped, margin + 8, y);
    y += purposeWrapped.length * 11.5 + 16;
  }

  ensureSpace(64);
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, pageWidth - margin, y);
  y += 16;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('Governance & Candidate Control Rights', margin, y);
  y += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const footerNote = doc.splitTextToSize(
    'Candidates can update or remove custom profile photos, switch photo visibility between Everyone in World and 1-on-1 Connected Peers Only, search peers via Scholar Profile ID, revoke 1-on-1 Private credential vault shares at any time, toggle Gmail/WhatsApp mentor alerts, recover 40% XP through Ethics modules, and appeal account suspensions directly to the Super Admin.',
    usableWidth
  ) as string[];
  doc.text(footerNote, margin, y);

  doc.save('SyllabiQ-Privacy-Policy-Charter.pdf');
}

