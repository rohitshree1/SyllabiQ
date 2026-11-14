import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { extractJsonFromModelText } from './src/utils/aiHelpers.ts';
import {
  generateFlexCardSerial,
  generateReportCardSerial,
  normalizeSerialCode,
  validateVerifierSubmission,
} from './src/utils/verificationAndReferral.ts';
import { registerSocialAndGovernanceRoutes } from './src/server/socialAndGovernanceHub.ts';
import type {
  CredentialVerificationNotice,
  FlexCardRarityTier,
  IssuedCredentialDoc,
} from './src/types.ts';

dotenv.config();

process.on('uncaughtException', (err) => {
  console.error('Uncaught server exception (kept alive):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection (kept alive):', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'student_state.json');
const CREDENTIALS_FILE = path.join(DATA_DIR, 'credentials_registry.json');

interface PersistedCredentialsStore {
  credentials: Record<string, IssuedCredentialDoc>;
  notifications: CredentialVerificationNotice[];
}

function buildSeededCredentials(): Record<string, IssuedCredentialDoc> {
  const nowISO = '2026-10-27T09:00:00.000Z';
  const owners = ['sandbox-candidate', 'cand-aarav-01'];
  const seeded: Record<string, IssuedCredentialDoc> = {};

  for (const ownerUid of owners) {
    const badges: Array<{ code: string; title: string; metric: string }> = [
      {
        code: 'SCHOLAR_FLEX',
        title: 'Overall Scholar Readiness',
        metric: '76% Exam Readiness · 8.1/10 Rating',
      },
      {
        code: 'SYLLABUS_ARCHITECT',
        title: 'Syllabus Architect',
        metric: '3/3 Core Subjects Mapped with PYQ Weightage',
      },
      {
        code: 'ACTIVE_LEARNER',
        title: 'Active Learner',
        metric: 'Daily Active Study Streak Intact · 1,850 XP',
      },
      {
        code: 'PYQ_CRUSHER',
        title: 'PYQ Speed-Drill Crusher',
        metric: '8.4/10 Peak Timed PYQ Assessment',
      },
      {
        code: 'FOCUS_REACTOR',
        title: 'Deep-Focus Reactor',
        metric: '125 Uninterrupted Pomodoro Focus Minutes',
      },
    ];

    for (const b of badges) {
      const serial = generateFlexCardSerial(ownerUid, b.code);
      seeded[serial] = {
        credentialCode: serial,
        kind: 'flexcard',
        ownerUid,
        ownerName: 'Aarav Mehta',
        boardOrUniversity: 'Delhi Technological University (DTU)',
        examName: 'B.Tech Sem-IV End-Term Finals',
        title: b.title,
        subtitleOrMetric: b.metric,
        xpPoints: 1850,
        flexTier: 'Mythic Sovereign',
        issuedDateISO: '2026-10-27',
        createdAt: nowISO,
        updatedAt: nowISO,
      };
    }

    const rcSerial = generateReportCardSerial(ownerUid, 'ALL');
    seeded[rcSerial] = {
      credentialCode: rcSerial,
      kind: 'report_card',
      ownerUid,
      ownerName: 'Aarav Mehta',
      boardOrUniversity: 'Delhi Technological University (DTU)',
      examName: 'B.Tech Sem-IV End-Term Finals',
      title: 'Official SyllabiQ Assessment Report Card (All Subjects)',
      subtitleOrMetric: 'Aggregate 8.1/10 · 76% Exam Readiness',
      xpPoints: 1850,
      flexTier: 'Mythic Sovereign',
      issuedDateISO: '2026-10-27',
      createdAt: nowISO,
      updatedAt: nowISO,
    };
  }

  return seeded;
}

function loadCredentialsStore(): PersistedCredentialsStore {
  try {
    if (fs.existsSync(CREDENTIALS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf-8')) as Partial<PersistedCredentialsStore>;
      const seeded = buildSeededCredentials();
      return {
        credentials: { ...seeded, ...(raw.credentials || {}) },
        notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
      };
    }
  } catch (err) {
    console.error('Failed loading credentials registry:', err);
  }
  return {
    credentials: buildSeededCredentials(),
    notifications: [],
  };
}

function saveCredentialsStore(store: PersistedCredentialsStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed saving credentials registry:', err);
  }
}

// Fast free-tier Gemini models ordered by reliability & speed (per @google/genai guidance)
const FREE_GEMINI_MODELS = [
  'gemini-4-hydrogen',
  'gemini-3.1-flash-lite',
] as const;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: 18000,
      retryOptions: {
        attempts: 1,
      },
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function generateJsonWithFreeGemini(
  ai: GoogleGenAI,
  contents:
    | string
    | {
        parts: Array<
          { text: string } | { inlineData: { mimeType: string; data: string } }
        >;
      },
  systemInstruction?: string
): Promise<Record<string, unknown>> {
  let lastErr: unknown = null;
  for (const modelName of FREE_GEMINI_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });
      const parsed = extractJsonFromModelText(response.text || '');
      if (Object.keys(parsed).length > 0) {
        return parsed;
      }
      lastErr = new Error(`Model ${modelName} returned empty JSON payload.`);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error('Gemini JSON generation unavailable across fallback models.');
}

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  app.use(express.json({ limit: '15mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ ok: true, service: 'syllabiq', timestamp: new Date().toISOString() });
  });

  // Persisted workspace state endpoints
  app.get('/api/state', (_req: Request, res: Response) => {
    try {
      if (fs.existsSync(STATE_FILE)) {
        const raw = fs.readFileSync(STATE_FILE, 'utf-8');
        res.json({ state: JSON.parse(raw) });
        return;
      }
      res.json({ state: null });
    } catch (err) {
      console.error('Failed reading state file:', err);
      res.json({ state: null });
    }
  });

  app.post('/api/state', (req: Request, res: Response) => {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(STATE_FILE, JSON.stringify(req.body.state, null, 2), 'utf-8');
      res.json({ ok: true });
    } catch (err) {
      console.error('Failed saving state file:', err);
      res.status(500).json({ error: 'Unable to persist workspace state on server.' });
    }
  });

  // 1. Multimodal Syllabus Parser + PYQ Yield Classifier + Initial AI Advisor Greeting
  app.post('/api/syllabus/parse', async (req: Request, res: Response) => {
    const { rawText, fileData, boardOrUniversity, institutionType } = req.body as {
      rawText?: string;
      fileData?: { mimeType: string; base64: string; fileName?: string };
      boardOrUniversity?: string;
      institutionType?: string;
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key is not configured on the server; using deterministic curriculum parser.',
      });
      return;
    }

    try {
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
      if (fileData?.base64 && fileData?.mimeType && fileData.mimeType !== 'text/plain') {
        parts.push({
          inlineData: {
            mimeType: fileData.mimeType,
            data: fileData.base64,
          },
        });
      }

      const boardLabel = boardOrUniversity?.trim() || 'University / Board';
      const prompt = `Analyze this ${
        institutionType === 'school' ? 'School Board' : 'University'
      } syllabus for "${boardLabel}" and return ONLY a valid JSON object matching this exact structure:
{
  "pyqOverview": "1 concise sentence summarizing how ${boardLabel} past papers weight numericals vs conceptual derivations across these subjects",
  "advisorGreeting": "Warm 2-sentence AI Academic Advisor greeting referencing the extracted subjects by name, asking the student for their name, when they feel most alert studying, how many hours/day they can comfortably study, and which of these subjects feel easy vs hard (along with their previous test scores)",
  "subjects": [
    {
      "name": "Subject Name",
      "topics": [
        {
          "title": "Chapter or Unit Title",
          "estimatedHours": 2.5,
          "yieldType": "high",
          "pyqFrequencyNote": "Specific ${boardLabel} PYQ weightage note (e.g. Appears in ~80% of past papers - derivation & numericals)",
          "youtubeQuery": "Targeted YouTube search query for mastering this exact topic & PYQs",
          "youtubeTitle": "Recommended lecture title",
          "youtubeChannelHint": "Ideal lecture style or renowned academic channel hint",
          "keyConcepts": ["Concept 1", "Concept 2", "Concept 3"]
        }
      ]
    }
  ]
}

Rules:
- Extract all subjects and chapters cleanly (keep estimatedHours between 1.0 and 4.0).
- Set yieldType strictly to "high" or "low" based on authentic ${boardLabel} Previous Year Question frequency.
- Syllabus Input:
${rawText || `(Extract from attached file: ${fileData?.fileName || 'syllabus document'})`}`;

      parts.push({ text: prompt });

      const parsedJson = await generateJsonWithFreeGemini(
        ai,
        { parts },
        'You are an expert academic syllabus parser, Board/University PYQ analyst, and study advisor. Output strict JSON only.'
      );

      res.json({ parsed: parsedJson, aiGenerated: true });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to parse syllabus with Gemini';
      console.error('Syllabus parse error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 2. Interactive AI Onboarding Advisor Interview (extracts student details, alertness, easy/hard subjects & past test marks)
  app.post('/api/intake/chat', async (req: Request, res: Response) => {
    const { messages, currentDraft } = req.body as {
      messages: Array<{ role: 'advisor' | 'student'; text: string }>;
      currentDraft: {
        studentName: string;
        examDate: string;
        dailyStudyHours: number;
        alertnessWindow: string;
        learningStyle: string;
        customStyleFeedback: string;
        boardOrUniversity: string;
        subjects: Array<{
          id: string;
          name: string;
          difficulty: string;
          previousScoreOutOf100: number;
        }>;
        topics: Array<{
          id: string;
          subjectName: string;
          title: string;
          classStatus: string;
        }>;
      };
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key unavailable on server.',
      });
      return;
    }

    try {
      const transcript = (messages || [])
        .slice(-8)
        .map((m) => `${m.role === 'advisor' ? 'AI Advisor' : 'Student'}: ${m.text}`)
        .join('\n');

      const subjectsList = (currentDraft.subjects || [])
        .map(
          (s) =>
            `- id="${s.id}", name="${s.name}", currentDifficulty="${s.difficulty}", pastScore=${s.previousScoreOutOf100}/100`
        )
        .join('\n');

      const sampleTopics = (currentDraft.topics || [])
        .slice(0, 14)
        .map((t) => `"${t.title}" (${t.subjectName}, status=${t.classStatus})`)
        .join(', ');

      const prompt = `You are interviewing a student who just uploaded their ${
        currentDraft.boardOrUniversity || 'exam'
      } syllabus so you can build an analytical timetable and progressive PYQ daily test plan.

Current Known Draft State:
- Student Name: "${currentDraft.studentName || '(not provided yet)'}"
- Target Exam Date: "${currentDraft.examDate}"
- Daily Comfortable Study Hours: ${currentDraft.dailyStudyHours}
- Peak Alertness Window: "${currentDraft.alertnessWindow}" (valid values: "early_morning", "late_morning", "afternoon", "night_owl")
- Learning Style: "${currentDraft.learningStyle}" (valid values: "visual_analogies", "step_by_step", "exam_shortcuts", "first_principles")
- Extracted Subjects:
${subjectsList}
- Syllabus Chapters: ${sampleTopics}

Recent Conversation:
${transcript}

Tasks:
1. Extract any new facts from the student's latest message into "extractedUpdates" (only include fields the student actually mentioned or implied in their message).
2. Write a warm, concise 2-3 sentence "reply" directly to the student:
   - Acknowledge what they shared.
   - Ask naturally about whichever key details are still missing among: (a) their name, (b) when they feel most alert & how many hours/day they can comfortably study, (c) which subjects feel easy vs hard and their previous test marks out of 100, or (d) which chapters are currently going on in their live classes.
   - If they have already shared their name, alertness/hours, and subject difficulty/marks, set "readyToBuild": true and invite them to click "Build Analytical Timetable & Test Plan" (or review Step 3).

Return ONLY valid JSON with this structure:
{
  "reply": "Conversational response and next question",
  "readyToBuild": false,
  "extractedUpdates": {
    "name": "optional string",
    "examDate": "optional YYYY-MM-DD",
    "dailyStudyHours": 5.0,
    "alertnessWindow": "early_morning",
    "learningStyle": "visual_analogies",
    "customStyleFeedback": "optional string",
    "subjectUpdates": [
      { "subjectId": "subj-1", "subjectName": "Subject Name", "difficulty": "hard", "previousScoreOutOf100": 58 }
    ],
    "ongoingTopicTitles": ["Exact or partial chapter title currently going on in class"]
  }
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You are SyllabiQ’s empathetic, analytical Academic Intake Advisor. Output strict JSON only.'
      );

      res.json({
        reply: String(
          data.reply ||
            'Got it! Which of your subjects feels toughest right now, and what were your recent test scores out of 100?'
        ),
        readyToBuild: Boolean(data.readyToBuild),
        extractedUpdates:
          data.extractedUpdates && typeof data.extractedUpdates === 'object'
            ? data.extractedUpdates
            : {},
        aiGenerated: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed AI intake chat';
      console.error('Intake chat error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 3. Analytical AI Timetable, Readiness & Missed-Day Recovery Coach
  app.post('/api/timetable/ai-strategy', async (req: Request, res: Response) => {
    const {
      student,
      subjects,
      topics,
      metricsSummary,
      trigger,
      missedDateISO,
      redistributionSummary,
    } = req.body as {
      student: {
        name: string;
        boardOrUniversity: string;
        examName: string;
        examDate: string;
        dailyStudyHours: number;
        alertnessWindow: string;
        learningStyle: string;
      };
      subjects: Array<{
        name: string;
        difficulty: string;
        previousScoreOutOf100: number;
        currentRatingOutOf10: number | null;
      }>;
      topics: Array<{
        title: string;
        subjectName: string;
        yieldType: string;
        classStatus: string;
        completed: boolean;
        masteryPercent: number;
      }>;
      metricsSummary?: {
        examReadinessPercent: number;
        completedChapters: number;
        totalChapters: number;
        highYieldMasteryPercent: number;
        overallScoreOutOf10: number | null;
      };
      trigger?: 'dashboard_briefing' | 'missed_day_reoptimize';
      missedDateISO?: string;
      redistributionSummary?: string;
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key unavailable on server.',
      });
      return;
    }

    try {
      const subjText = (subjects || [])
        .map(
          (s) =>
            `${s.name} (feels ${s.difficulty}, past marks: ${s.previousScoreOutOf100}/100, current PYQ rating: ${
              s.currentRatingOutOf10 !== null ? `${s.currentRatingOutOf10}/10` : 'untested'
            })`
        )
        .join('; ');

      const pendingHighYield = (topics || [])
        .filter((t) => !t.completed && t.yieldType === 'high')
        .slice(0, 6)
        .map((t) => `${t.title} (${t.subjectName}, class: ${t.classStatus})`)
        .join(', ');

      const prompt = `Generate a personalized analytical exam strategy briefing for ${
        student.name || 'the student'
      } preparing for "${student.examName}" (${student.boardOrUniversity}) on ${student.examDate}.

Analytical Student Data:
- Daily Study Comfort Capacity: ${student.dailyStudyHours} hrs/day | Peak Alertness: ${student.alertnessWindow}
- Subjects & Scores: ${subjText}
- Open High-Yield PYQ Chapters: ${pendingHighYield || 'All high-yield chapters completed!'}
- Readiness Metrics: ${
        metricsSummary
          ? `Readiness ${metricsSummary.examReadinessPercent}%, Velocity ${metricsSummary.completedChapters}/${metricsSummary.totalChapters} chapters, High-Yield Mastery ${metricsSummary.highYieldMasteryPercent}%`
          : 'Initial plan calibration'
      }
${
  trigger === 'missed_day_reoptimize'
    ? `- Missed Day Triggered (${missedDateISO}): ${redistributionSummary}. Provide encouraging, specific guidance in "recoveryNote" on how to smoothly absorb the redistributed minutes without burnout.`
    : ''
}

Return ONLY valid JSON with this exact shape:
{
  "headline": "Sharp 1-line analytical diagnosis for ${student.name}",
  "alertnessStrategy": "1-2 sentences on how to use their ${student.alertnessWindow} peak slot for their hardest/lowest-scoring subject",
  "pyqFocusAdvice": "1-2 sentences naming specific high-yield ${student.boardOrUniversity} chapters to lock down next",
  "classSyncTip": "1 sentence on aligning ongoing live-class chapters with daily compressed PYQ tests",
  "recoveryNote": "Optional 1-2 sentence smooth missed-day catch-up reassurance (empty string if no missed day)",
  "actionableSteps": [
    "Concrete action step 1",
    "Concrete action step 2",
    "Concrete action step 3"
  ]
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You are an elite academic data strategist and PYQ exam coach. Output strict JSON only.'
      );

      res.json({
        briefing: {
          headline: String(data.headline || 'Analytical Study & PYQ Strategy'),
          alertnessStrategy: String(data.alertnessStrategy || ''),
          pyqFocusAdvice: String(data.pyqFocusAdvice || ''),
          classSyncTip: String(data.classSyncTip || ''),
          recoveryNote: data.recoveryNote ? String(data.recoveryNote) : undefined,
          actionableSteps: Array.isArray(data.actionableSteps)
            ? data.actionableSteps.slice(0, 3).map(String)
            : [],
          generatedAt: new Date().toISOString(),
          usedAi: true,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed generating AI strategy';
      console.error('AI strategy error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 4. Generate PYQ-aligned progressive MCQ questions
  app.post('/api/questions/generate', async (req: Request, res: Response) => {
    const { student, subjects, topics, count, difficultyTier, mode } = req.body as {
      student: {
        name: string;
        boardOrUniversity: string;
        examName: string;
        learningStyle: string;
        customStyleFeedback: string;
      };
      subjects?: Array<{
        id: string;
        name: string;
        difficulty: string;
        previousScoreOutOf100: number;
      }>;
      topics: Array<{
        id: string;
        subjectId: string;
        subjectName: string;
        title: string;
        yieldType: string;
      }>;
      count: number;
      difficultyTier: string;
      mode: 'daily_target' | 'countdown_blitz';
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key unavailable; falling back to local PYQ bank.',
      });
      return;
    }

    try {
      const qCount = Math.min(12, Math.max(3, count || 6));
      const topicSummary = (topics || [])
        .slice(0, 12)
        .map(
          (t) =>
            `- subjectId="${t.subjectId}", subjectName="${t.subjectName}", topicId="${t.id}", topicTitle="${t.title}" (${t.yieldType}-yield)`
        )
        .join('\n');

      const subjContext = (subjects || [])
        .map((s) => `${s.name}: ${s.difficulty} (past score ${s.previousScoreOutOf100}/100)`)
        .join(', ');

      const prompt = `Generate exactly ${qCount} exam-authentic multiple-choice questions modeled on real Previous Year Questions (PYQs) from "${
        student.boardOrUniversity || 'University/Board'
      }" (${student.examName || 'Final Exam'}).

Mode: ${
        mode === 'countdown_blitz'
          ? 'High-Speed 18-Second Countdown Active Recall MCQ (crisp conceptual traps, formula edge-cases, and rapid numericals across covered syllabus)'
          : `Progressive Compressed-Time Daily Target — Toughness Tier: "${difficultyTier}"`
      }
Student Subject Context: ${subjContext || 'Balanced across subjects'}

Distribute questions across these exact syllabus topics (keep subjectId, subjectName, topicId, and topicTitle matching the list):
${topicSummary}

Return ONLY valid JSON with this exact structure:
{
  "pyqPatternSummary": "1 concise sentence describing which ${student.boardOrUniversity} past-paper patterns and traps are tested in this set",
  "questions": [
    {
      "subjectId": "subj-1",
      "subjectName": "Subject Name",
      "topicId": "topic-1",
      "topicTitle": "Topic Title",
      "question": "Clear, specific exam-grade question stem",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 1,
      "pyqReference": "${student.boardOrUniversity} PYQ Pattern · Specific Year/Question Archetype",
      "baseExplanation": "2-3 sentence explanation tailored to ${student.name}'s style (${student.learningStyle}; ${
        student.customStyleFeedback || 'clear step-by-step intuition'
      })"
    }
  ]
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You are a senior examiner crafting authentic Board and University Previous Year Question (PYQ) assessments. Output strict JSON only.'
      );

      res.json({
        questions: Array.isArray(data.questions) ? data.questions : [],
        pyqPatternSummary: String(data.pyqPatternSummary || ''),
        aiGenerated: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate PYQ questions';
      console.error('PYQ generation error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 5. Personalized Wrong-Answer & Follow-Up AI Tutor
  app.post('/api/tutor/explain', async (req: Request, res: Response) => {
    const { question, selectedOption, correctOption, student, subjectMeta, followUpQuestion } =
      req.body as {
        question: {
          subjectName: string;
          topicTitle: string;
          question: string;
          pyqReference: string;
          baseExplanation: string;
        };
        selectedOption: string;
        correctOption: string;
        student: {
          name: string;
          boardOrUniversity: string;
          learningStyle: string;
          customStyleFeedback: string;
        };
        subjectMeta?: {
          difficulty: string;
          previousScoreOutOf100: number;
          currentRatingOutOf10: number | null;
        };
        followUpQuestion?: string;
      };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key unavailable on server.',
      });
      return;
    }

    try {
      const prompt = `Student Profile Saved Data:
- Name: ${student.name}
- Board/University: ${student.boardOrUniversity}
- Subject Context (${question.subjectName}): ${
        subjectMeta
          ? `Student finds this subject "${subjectMeta.difficulty}", past test score ${subjectMeta.previousScoreOutOf100}/100`
          : 'Core exam subject'
      }
- Preferred Learning Framework: ${student.learningStyle}
- Student's Custom Feedback Box Instruction: "${
        student.customStyleFeedback || 'Explain intuitively step-by-step without dense textbook jargon.'
      }"

Exam Question (${question.subjectName} — ${question.topicTitle} · ${question.pyqReference}):
"${question.question}"
- Student Selected: "${selectedOption || 'Ran out of time'}"
- Correct Answer: "${correctOption}"
${
  followUpQuestion
    ? `- Student's Specific Follow-Up Doubt: "${followUpQuestion}"`
    : ''
}

Return ONLY valid JSON:
{
  "explanation": "3-4 crystal-clear sentences speaking directly to ${student.name} in the EXACT style they requested in their Custom Feedback Box, explaining why their selected option was a trap (or answering their follow-up doubt) and how the correct answer works.",
  "memoryHook": "1 punchy 1-line exam shortcut or mental hook so ${student.name} never misses this ${student.boardOrUniversity} PYQ pattern again"
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You are a personalized 1-on-1 AI Tutor who adapts completely to how each individual student understands concepts best. Output strict JSON only.'
      );

      const mainText = String(data.explanation || '').trim();
      const hookText = data.memoryHook ? ` Exam Hook: ${String(data.memoryHook).trim()}` : '';
      res.json({
        explanation: `${mainText}${hookText}`.trim(),
        aiGenerated: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate personalized explanation';
      console.error('Tutor explain error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 6. Adaptive Revision Feedback Box -> Live AI Teaching Persona Recalibration & Demonstration
  app.post('/api/tutor/adapt-style', async (req: Request, res: Response) => {
    const { student, sampleTopicTitle, sampleSubjectName } = req.body as {
      student: {
        name: string;
        boardOrUniversity: string;
        learningStyle: string;
        customStyleFeedback: string;
      };
      sampleTopicTitle?: string;
      sampleSubjectName?: string;
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key unavailable on server.',
      });
      return;
    }

    try {
      const topicLabel = sampleTopicTitle || 'Core Exam Concept';
      const subjLabel = sampleSubjectName || 'your syllabus';

      const prompt = `Student ${student.name} (${student.boardOrUniversity}) just updated their Study Style Feedback Box in SyllabiQ:
- Core Framework: "${student.learningStyle}"
- Student's Own Words in Feedback Box: "${
        student.customStyleFeedback || 'Keep explanations intuitive, structured, and exam-focused.'
      }"

Return ONLY valid JSON:
{
  "confirmationNote": "1 warm sentence confirming to ${student.name} how you have recalibrated your tutoring & wrong-answer explanations to match their exact feedback",
  "sampleDemonstration": "A vivid 2-sentence live micro-explanation of '${topicLabel}' (${subjLabel}) written in this exact new style so ${student.name} can immediately verify it clicks for them"
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You are SyllabiQ’s adaptive study coach. Output strict JSON only.'
      );

      res.json({
        confirmationNote: String(data.confirmationNote || 'Updated your AI Tutor style.'),
        sampleDemonstration: String(data.sampleDemonstration || ''),
        aiGenerated: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed adapting AI study style';
      console.error('Adapt style error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 7. Algorithmic AI YouTube Study Resource Curator per Planner Topic
  app.post('/api/youtube/curate', async (req: Request, res: Response) => {
    const { topic, student, subjectDifficulty } = req.body as {
      topic: {
        title: string;
        subjectName: string;
        yieldType: string;
        pyqFrequencyNote: string;
        keyConcepts: string[];
      };
      student: {
        name: string;
        boardOrUniversity: string;
        learningStyle: string;
        customStyleFeedback: string;
      };
      subjectDifficulty?: string;
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key unavailable on server.',
      });
      return;
    }

    try {
      const prompt = `Recommend 3 highly specific YouTube study video searches for ${student.name} (${
        student.boardOrUniversity
      }) studying:
- Subject: ${topic.subjectName} (Student difficulty rating: ${subjectDifficulty || 'moderate'})
- Topic: ${topic.title} (${topic.yieldType}-yield PYQ · ${topic.pyqFrequencyNote})
- Key Checkpoints: ${(topic.keyConcepts || []).join(', ')}
- Student Learning Style: ${student.learningStyle} (${
        student.customStyleFeedback || 'clear conceptual & PYQ focus'
      })

Provide 3 complementary video types: (1) Deep Intuition / Concept Lecture, (2) ${
        student.boardOrUniversity
      } Solved PYQ & Numericals Walkthrough, and (3) Rapid Revision One-Shot.

Return ONLY valid JSON:
{
  "recommendations": [
    {
      "title": "Descriptive video lecture title",
      "channelOrFormatHint": "Renowned educator channel or format hint",
      "searchQuery": "Exact high-signal YouTube search query",
      "durationEstimate": "e.g. 25–40 min",
      "whyRecommended": "1 concise sentence explaining why this matches ${student.name}'s ${student.learningStyle} preference"
    }
  ]
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You are an algorithmic academic video curator for university and board exam students. Output strict JSON only.'
      );

      res.json({
        recommendations: Array.isArray(data.recommendations)
          ? data.recommendations.slice(0, 3)
          : [],
        aiGenerated: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed curating AI YouTube recommendations';
      console.error('YouTube curate error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 8. AI-Written 10-15 Line "About the Student" Narrative (Profile & Report Card)
  app.post('/api/student/about-summary', async (req: Request, res: Response) => {
    const {
      student,
      subjects,
      topics,
      metricsSummary,
      xpSummary,
      focusMinutesTotal,
      focusSessionsCompleted,
      unlockedBadges,
    } = req.body as {
      student: {
        name: string;
        institutionType: string;
        boardOrUniversity: string;
        examName: string;
        examDate: string;
        dailyStudyHours: number;
        alertnessWindow: string;
        learningStyle: string;
        customStyleFeedback?: string;
      };
      subjects: Array<{
        name: string;
        difficulty: string;
        previousScoreOutOf100: number;
        currentRatingOutOf10: number | null;
      }>;
      topics: Array<{
        title: string;
        subjectName: string;
        yieldType: string;
        completed: boolean;
        masteryPercent: number;
      }>;
      metricsSummary?: {
        examReadinessPercent: number;
        completedChapters: number;
        totalChapters: number;
        highYieldMasteryPercent: number;
        overallScoreOutOf10: number | null;
      };
      xpSummary?: {
        netXp: number;
        flexTier: string;
        activeLearnerDissolved: boolean;
        inactiveDays: number;
      };
      focusMinutesTotal?: number;
      focusSessionsCompleted?: number;
      unlockedBadges?: string[];
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key unavailable on server; using deterministic 12-line student narrative.',
      });
      return;
    }

    try {
      const subjDetails = (subjects || [])
        .map(
          (s) =>
            `${s.name} (difficulty=${s.difficulty}, pastScore=${s.previousScoreOutOf100}/100, currentPYQ=${
              s.currentRatingOutOf10 !== null ? `${s.currentRatingOutOf10}/10` : 'pending'
            })`
        )
        .join('; ');

      const openHighYield = (topics || [])
        .filter((t) => !t.completed && t.yieldType === 'high')
        .slice(0, 4)
        .map((t) => `${t.title} (${t.subjectName}, ${t.masteryPercent}% mastery)`)
        .join(', ');

      const prompt = `Write a polished, insightful 12-line "About the Student" academic profile for ${
        student?.name || 'the student'
      } (${student?.boardOrUniversity || 'University'} — ${student?.examName || 'Finals'}, exam date ${
        student?.examDate || 'upcoming'
      }).

Ground every line in their real performance and study telemetry:
- Daily Comfort Hours: ${student?.dailyStudyHours || 4} hrs/day | Peak Alertness Slot: ${
        student?.alertnessWindow || 'early_morning'
      } | Learning Style: ${student?.learningStyle || 'step_by_step'} ${
        student?.customStyleFeedback ? `("${student.customStyleFeedback}")` : ''
      }
- Subjects & Past Performance: ${subjDetails || 'Core syllabus mapped'}
- Readiness & PYQ Scores: Readiness ${metricsSummary?.examReadinessPercent ?? 0}%, Chapters ${
        metricsSummary?.completedChapters ?? 0
      }/${metricsSummary?.totalChapters ?? 0}, High-Yield Mastery ${
        metricsSummary?.highYieldMasteryPercent ?? 0
      }%, Overall PYQ Rating ${
        metricsSummary?.overallScoreOutOf10 !== null && metricsSummary?.overallScoreOutOf10 !== undefined
          ? `${metricsSummary.overallScoreOutOf10}/10`
          : 'baseline'
      }
- Deep Focus & Badges: ${focusMinutesTotal ?? 0} focus mins across ${
        focusSessionsCompleted ?? 0
      } sessions | Unlocked Badges: ${(unlockedBadges || []).join(', ') || 'In progress'}
- XP & FlexCard Rarity: ${xpSummary?.netXp ?? 0} XP (${xpSummary?.flexTier || 'Common Slate'})
- Next Priority High-Yield Topics: ${openHighYield || 'Consolidating full-syllabus revision'}

Return ONLY valid JSON with an array "lines" containing STRICTLY 12 concise, distinct, natural prose sentences (10 to 15 lines mandatory; no bullet symbols or line numbers):
{
  "lines": [
    "Line 1...",
    "Line 2...",
    "Line 3...",
    "Line 4...",
    "Line 5...",
    "Line 6...",
    "Line 7...",
    "Line 8...",
    "Line 9...",
    "Line 10...",
    "Line 11...",
    "Line 12..."
  ]
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You are an academic dean writing a factual, encouraging, data-grounded 12-line About the Student dossier for official profile and report card records. Output strict JSON only.'
      );

      res.json({
        lines: Array.isArray(data.lines) ? data.lines.map(String) : [],
        aiGenerated: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed generating AI student about summary';
      console.error('Student about summary error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 9. AI-Optimized Accountability / Comeback FlexCard Message for Restricted (Banned) Candidates
  app.post('/api/moderation/ban-flex-message', async (req: Request, res: Response) => {
    const { candidateName, examName, banReason, xpPoints, flexTier } = req.body as {
      candidateName?: string;
      examName?: string;
      banReason?: string;
      xpPoints?: number;
      flexTier?: FlexCardRarityTier;
    };

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        aiUnavailable: true,
        error: 'Gemini API key unavailable on server; using deterministic accountability message.',
      });
      return;
    }

    try {
      const cleanName = (candidateName || 'Scholar').trim();
      const cleanExam = (examName || 'Final Examinations').trim();
      const cleanReason = (banReason || 'Workspace policy & academic integrity review').trim();

      const prompt = `A candidate named "${cleanName}" preparing for "${cleanExam}" (${
        xpPoints ?? 0
      } XP · ${flexTier || 'Common Slate'}) currently has a restricted SyllabiQ account for the following admin reason:
"${cleanReason}"

Write a constructive, dignified, self-aware social media FlexCard message optimized around WHY the restriction happened and how ${cleanName} is owning the lesson and resetting their study discipline. Do not be harsh, shaming, or sarcastic—make it honest, accountable, and motivating to share publicly.

Return ONLY valid JSON:
{
  "headline": "Crisp 6-10 word FlexCard banner headline referencing accountability & reset",
  "caption": "2-3 punchy, share-ready sentences acknowledging '${cleanReason}' transparently and stating ${cleanName}'s commitment to disciplined exam preparation",
  "comebackPledge": "1 short 1-line pledge printed at the bottom of the FlexCard"
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You craft constructive, dignified accountability and comeback FlexCard messages for students resetting after a platform restriction. Output strict JSON only.'
      );

      res.json({
        headline: String(data.headline || ''),
        caption: String(data.caption || ''),
        comebackPledge: String(data.comebackPledge || ''),
        aiGenerated: true,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed generating ban FlexCard message';
      console.error('Ban flex message error:', msg);
      res.status(500).json({ error: msg });
    }
  });

  // 10. Official Verifiable Credential Registry & Non-Admin Verifier Notification Bridge
  app.post('/api/credentials/register', (req: Request, res: Response) => {
    const incomingList = Array.isArray(req.body?.credentials)
      ? (req.body.credentials as Array<Partial<IssuedCredentialDoc>>)
      : req.body?.credential
      ? [req.body.credential as Partial<IssuedCredentialDoc>]
      : [];

    const validItems = incomingList.filter(
      (item) => item && item.credentialCode && item.ownerUid
    );

    if (validItems.length === 0) {
      res.status(400).json({ error: 'Missing credentialCode or ownerUid.' });
      return;
    }

    const nowISO = new Date().toISOString();
    const store = loadCredentialsStore();
    const savedRecords: IssuedCredentialDoc[] = [];

    for (const incoming of validItems.slice(0, 60)) {
      const code = normalizeSerialCode(incoming.credentialCode!);
      const existing = store.credentials[code];
      const record: IssuedCredentialDoc = {
        credentialCode: code,
        kind: incoming.kind === 'report_card' ? 'report_card' : 'flexcard',
        ownerUid: String(incoming.ownerUid).slice(0, 128),
        ownerName: String(incoming.ownerName || 'Scholar').slice(0, 80),
        boardOrUniversity: String(incoming.boardOrUniversity || 'University').slice(0, 120),
        examName: String(incoming.examName || 'Final Examinations').slice(0, 120),
        title: String(incoming.title || 'SyllabiQ Verified Credential').slice(0, 140),
        subtitleOrMetric: String(incoming.subtitleOrMetric || 'Verified Achievement').slice(0, 160),
        xpPoints: Math.max(0, Math.min(500000, Math.round(Number(incoming.xpPoints) || 0))),
        flexTier: (incoming.flexTier as FlexCardRarityTier) || 'Common Slate',
        issuedDateISO: String(incoming.issuedDateISO || nowISO.slice(0, 10)).slice(0, 20),
        createdAt: existing?.createdAt || nowISO,
        updatedAt: nowISO,
      };
      store.credentials[code] = record;
      savedRecords.push(record);
    }

    saveCredentialsStore(store);
    res.json({
      ok: true,
      count: savedRecords.length,
      credential: savedRecords[0],
      credentials: savedRecords,
    });
  });

  app.post('/api/credentials/verify', (req: Request, res: Response) => {
    const {
      serialCode,
      isStaff,
      verifierName,
      verifierGmail,
      verifierPost,
      cloudCredential,
    } = req.body as {
      serialCode?: string;
      isStaff?: boolean;
      verifierName?: string;
      verifierGmail?: string;
      verifierPost?: string;
      cloudCredential?: IssuedCredentialDoc | null;
    };

    const validation = validateVerifierSubmission({
      serialInput: String(serialCode || ''),
      isStaff: Boolean(isStaff),
      verifierName: String(verifierName || ''),
      verifierGmail: String(verifierGmail || ''),
      verifierPost: String(verifierPost || 'teacher'),
    });

    if (!validation.valid) {
      res.status(400).json({ error: validation.error || 'Invalid verification details.' });
      return;
    }

    const store = loadCredentialsStore();
    let matched = store.credentials[validation.normalizedSerial] || null;

    if (!matched && cloudCredential && normalizeSerialCode(cloudCredential.credentialCode) === validation.normalizedSerial) {
      matched = cloudCredential;
      store.credentials[validation.normalizedSerial] = cloudCredential;
      saveCredentialsStore(store);
    }

    if (!matched) {
      res.json({
        authentic: false,
        normalizedSerial: validation.normalizedSerial,
        notifiedOwner: false,
      });
      return;
    }

    // If verifier is NOT Admin / Super Admin, record notification for the credential owner
    if (!isStaff) {
      const nowISO = new Date().toISOString();
      const notice: CredentialVerificationNotice = {
        id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        targetUserId: matched.ownerUid,
        credentialCode: matched.credentialCode,
        credentialKind: matched.kind,
        credentialTitle: matched.title,
        verifierName: validation.normalizedName,
        verifierGmail: validation.normalizedGmail,
        verifierPost: validation.normalizedPost,
        acknowledged: false,
        createdAt: nowISO,
      };
      store.notifications = [notice, ...store.notifications].slice(0, 200);
      saveCredentialsStore(store);

      res.json({
        authentic: true,
        normalizedSerial: validation.normalizedSerial,
        credential: matched,
        notifiedOwner: true,
        notice,
      });
      return;
    }

    res.json({
      authentic: true,
      normalizedSerial: validation.normalizedSerial,
      credential: matched,
      notifiedOwner: false,
    });
  });

  app.get('/api/credentials/notifications', (req: Request, res: Response) => {
    const rawOwner = String(req.query.ownerUid || '').trim();
    if (!rawOwner) {
      res.json({ notifications: [] });
      return;
    }
    const ownerSet = new Set(
      rawOwner
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const store = loadCredentialsStore();
    const notifications = store.notifications
      .filter((n) => ownerSet.has(n.targetUserId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 40);

    res.json({ notifications });
  });

  app.post('/api/credentials/acknowledge', (req: Request, res: Response) => {
    const noticeId = String(req.body?.noticeId || '').trim();
    if (!noticeId) {
      res.status(400).json({ error: 'Missing noticeId.' });
      return;
    }
    const store = loadCredentialsStore();
    store.notifications = store.notifications.map((n) =>
      n.id === noticeId ? { ...n, acknowledged: true } : n
    );
    saveCredentialsStore(store);
    res.json({ ok: true });
  });

  // 11. Real-Time Social SyllabiQ (/ws/social + /api/social/*), Appeal Suspension Interview & Ethics Module
  registerSocialAndGovernanceRoutes({
    app,
    httpServer,
    dataDir: DATA_DIR,
    getGeminiClient,
    generateJsonWithFreeGemini: (ai, contents, systemInstruction) =>
      generateJsonWithFreeGemini(ai, contents, systemInstruction),
  });

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : { ignored: ['**/data/**'] },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Unexpected server error';
    console.error('Express middleware error:', message);
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`SyllabiQ server listening on http://0.0.0.0:${PORT}`);
  });
  httpServer.keepAliveTimeout = 65000;
  httpServer.headersTimeout = 66000;
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
});
