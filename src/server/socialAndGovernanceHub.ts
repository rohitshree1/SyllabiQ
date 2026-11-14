import type { Express, Request, Response } from 'express';
import type { Server as HttpServer } from 'http';
import fs from 'fs';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import type { GoogleGenAI } from '@google/genai';
import type {
  AppealInterviewMessage,
  AvatarVisibility,
  EthicsQuizQuestion,
  EthicsRecoveryModule,
  FlexCardRarityTier,
  IssuedCredentialDoc,
  SocialChatMessage,
  SocialConnection,
  SocialDirectoryPeer,
  SocialFlexAttachment,
  SocialVaultGrant,
  SuspensionAppealRecord,
  VaultPermissionScope,
} from '../types.ts';
import {
  buildFallbackEthicsModule,
  calculateEthicsRecoveryXp,
  validateSocialMessageConduct,
} from '../utils/skillRefreshAndEthics.ts';
import {
  generateFlexCardSerial,
  generateReportCardSerial,
  generateScholarProfileId,
} from '../utils/verificationAndReferral.ts';

interface PersistedSocialState {
  messages: SocialChatMessage[];
  connections: SocialConnection[];
  vaultGrants: SocialVaultGrant[];
  directory: Record<string, Omit<SocialDirectoryPeer, 'online'>>;
}

interface PersistedAppealsState {
  appeals: SuspensionAppealRecord[];
}

function buildStarterSocialState(): PersistedSocialState {
  const now = '2026-10-29T08:15:00.000Z';
  const ananyaFlexSerial = generateFlexCardSerial('cand-ananya-02', 'NINE_SOVEREIGN');
  const ananyaBlitzSerial = generateFlexCardSerial('cand-ananya-02', 'BLITZ_SPEED');
  const ananyaReportSerial = generateReportCardSerial('cand-ananya-02', 'ALL');
  const kabirFlexSerial = generateFlexCardSerial('cand-kabir-03', 'SYLLABUS_ARCHITECT');

  const ananyaFlex1: IssuedCredentialDoc = {
    credentialCode: ananyaFlexSerial,
    kind: 'flexcard',
    ownerUid: 'cand-ananya-02',
    ownerName: 'Ananya Verma',
    boardOrUniversity: 'CBSE Class 12',
    examName: 'Senior Secondary Board Physics & Math Finals',
    title: '9+/10 Sovereign Distinction',
    subtitleOrMetric: '9.4/10 Timed PYQ Rating · 91% Readiness',
    xpPoints: 1940,
    flexTier: 'Mythic Sovereign',
    issuedDateISO: '2026-10-28',
  };

  const ananyaFlex2: IssuedCredentialDoc = {
    credentialCode: ananyaBlitzSerial,
    kind: 'flexcard',
    ownerUid: 'cand-ananya-02',
    ownerName: 'Ananya Verma',
    boardOrUniversity: 'CBSE Class 12',
    examName: 'Senior Secondary Board Physics & Math Finals',
    title: 'Countdown Blitz Sprinter',
    subtitleOrMetric: 'Sub-85% Exam Clock · 100% Accuracy',
    xpPoints: 1940,
    flexTier: 'Mythic Sovereign',
    issuedDateISO: '2026-10-28',
  };

  const ananyaReport: IssuedCredentialDoc = {
    credentialCode: ananyaReportSerial,
    kind: 'report_card',
    ownerUid: 'cand-ananya-02',
    ownerName: 'Ananya Verma',
    boardOrUniversity: 'CBSE Class 12',
    examName: 'Senior Secondary Board Physics & Math Finals',
    title: 'Official SyllabiQ Assessment Report Card (All Subjects)',
    subtitleOrMetric: 'Aggregate 9.4/10 · 9/11 Chapters Mastered',
    xpPoints: 1940,
    flexTier: 'Mythic Sovereign',
    issuedDateISO: '2026-10-28',
  };

  return {
    directory: {
      'cand-ananya-02': {
        userId: 'cand-ananya-02',
        profileId: generateScholarProfileId('cand-ananya-02'),
        displayName: 'Ananya Verma',
        avatarVisibility: 'world',
        flexTier: 'Mythic Sovereign',
      },
      'cand-kabir-03': {
        userId: 'cand-kabir-03',
        profileId: generateScholarProfileId('cand-kabir-03'),
        displayName: 'Kabir Nair',
        avatarVisibility: 'connections_only',
        flexTier: 'Uncommon Emerald',
      },
      'cand-meera-04': {
        userId: 'cand-meera-04',
        profileId: generateScholarProfileId('cand-meera-04'),
        displayName: 'Meera Krishnan',
        avatarVisibility: 'connections_only',
        flexTier: 'Rare Sapphire',
      },
    },
    messages: [
      {
        id: 'soc-msg-1',
        channelType: 'world',
        channelId: 'world',
        senderId: 'cand-ananya-02',
        senderName: 'Ananya Verma',
        senderAvatarVisibility: 'world',
        text: 'Completed Wave Optics & Alternating Current PYQ drills in my 05:30 peak window. Sharing my Sovereign Distinction FlexCard—connect 1-on-1 to compare notes!',
        flexCard: {
          credentialCode: ananyaFlexSerial,
          title: '9+/10 Sovereign Distinction',
          metricBadge: '9.4 / 10 PYQ Rating',
          xpPoints: 1940,
          flexTier: 'Mythic Sovereign',
          boardOrUniversity: 'CBSE Class 12',
          examName: 'Senior Secondary Board Physics & Math Finals',
          needsSkillRefresh: false,
        },
        createdAt: '2026-10-29T06:40:00.000Z',
      },
      {
        id: 'soc-msg-2',
        channelType: 'world',
        channelId: 'world',
        senderId: 'cand-kabir-03',
        senderName: 'Kabir Nair',
        senderAvatarVisibility: 'connections_only',
        text: 'Back on daily schedule tackling Banker Algorithm & ARIES Recovery. Anyone studying Operating Systems can search my Profile ID or send a Join request to compare FlexCards.',
        flexCard: {
          credentialCode: kabirFlexSerial,
          title: 'Syllabus Architect',
          metricBadge: 'Roadmap Live',
          xpPoints: 340,
          flexTier: 'Uncommon Emerald',
          boardOrUniversity: 'VIT Vellore',
          examName: 'CS Core Operating Systems & DBMS CAT-2',
          needsSkillRefresh: false,
        },
        createdAt: '2026-10-29T07:20:00.000Z',
      },
      {
        id: 'soc-msg-3',
        channelType: 'dm',
        channelId: 'dm::cand-ananya-02::sandbox-candidate',
        senderId: 'cand-ananya-02',
        senderName: 'Ananya Verma',
        senderAvatarVisibility: 'world',
        text: 'Hey Aarav! Morning check-in: let’s hit at least one compressed-timer PYQ set today before evening revision.',
        createdAt: '2026-10-29T07:50:00.000Z',
      },
    ],
    connections: [
      {
        id: 'conn-ananya-sandbox',
        requesterId: 'cand-ananya-02',
        requesterName: 'Ananya Verma',
        requesterAvatarVisibility: 'world',
        recipientId: 'sandbox-candidate',
        recipientName: 'Aarav Mehta',
        recipientAvatarVisibility: 'world',
        status: 'connected',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'conn-meera-sandbox-pending',
        requesterId: 'cand-meera-04',
        requesterName: 'Meera Krishnan',
        requesterAvatarVisibility: 'connections_only',
        recipientId: 'sandbox-candidate',
        recipientName: 'Aarav Mehta',
        recipientAvatarVisibility: 'world',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      },
    ],
    vaultGrants: [
      {
        id: 'vault-ananya-to-sandbox',
        ownerId: 'cand-ananya-02',
        ownerName: 'Ananya Verma',
        granteeId: 'sandbox-candidate',
        granteeName: 'Aarav Mehta',
        scope: 'all_flexcards_and_report',
        status: 'granted',
        flexCardsSnapshot: [ananyaFlex1, ananyaFlex2],
        reportCardSnapshot: ananyaReport,
        updatedAt: now,
      },
    ],
  };
}

export function registerSocialAndGovernanceRoutes(params: {
  app: Express;
  httpServer: HttpServer;
  dataDir: string;
  getGeminiClient: () => GoogleGenAI | null;
  generateJsonWithFreeGemini: (
    ai: GoogleGenAI,
    contents: string,
    systemInstruction?: string
  ) => Promise<Record<string, unknown>>;
}): void {
  const { app, httpServer, dataDir, getGeminiClient, generateJsonWithFreeGemini } = params;
  const socialFile = path.join(dataDir, 'social_state.json');
  const appealsFile = path.join(dataDir, 'appeals_registry.json');

  const ensureDir = () => {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  };

  const loadSocial = (): PersistedSocialState => {
    try {
      if (fs.existsSync(socialFile)) {
        const parsed = JSON.parse(fs.readFileSync(socialFile, 'utf-8')) as Partial<PersistedSocialState>;
        const starter = buildStarterSocialState();
        const rawMsgs = Array.isArray(parsed.messages) && parsed.messages.length > 0 ? parsed.messages : starter.messages;
        const cleanMsgs = rawMsgs.filter((m) => m.channelType === 'world' || m.channelType === 'dm');
        return {
          messages: cleanMsgs.length > 0 ? cleanMsgs : starter.messages,
          connections: Array.isArray(parsed.connections) ? parsed.connections : starter.connections,
          vaultGrants: Array.isArray(parsed.vaultGrants) ? parsed.vaultGrants : starter.vaultGrants,
          directory: { ...starter.directory, ...(parsed.directory || {}) },
        };
      }
    } catch (err) {
      console.error('Failed loading social_state.json:', err);
    }
    const starter = buildStarterSocialState();
    saveSocial(starter);
    return starter;
  };

  const saveSocial = (state: PersistedSocialState) => {
    try {
      ensureDir();
      fs.writeFileSync(socialFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed saving social_state.json:', err);
    }
  };

  const loadAppeals = (): PersistedAppealsState => {
    try {
      if (fs.existsSync(appealsFile)) {
        const parsed = JSON.parse(fs.readFileSync(appealsFile, 'utf-8')) as Partial<PersistedAppealsState>;
        return {
          appeals: Array.isArray(parsed.appeals) ? parsed.appeals : [],
        };
      }
    } catch (err) {
      console.error('Failed loading appeals_registry.json:', err);
    }
    return { appeals: [] };
  };

  const saveAppeals = (state: PersistedAppealsState) => {
    try {
      ensureDir();
      fs.writeFileSync(appealsFile, JSON.stringify(state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed saving appeals_registry.json:', err);
    }
  };

  // Real-time WebSocket Server attached on /ws/social
  const wss = new WebSocketServer({ noServer: true });
  const clientUsers = new Map<WebSocket, string>();

  const getOnlineUserIds = (): Set<string> => {
    const online = new Set<string>();
    for (const [sock, uid] of clientUsers.entries()) {
      if (sock.readyState === WebSocket.OPEN && uid) {
        online.add(uid);
      }
    }
    return online;
  };

  const buildPublicDirectory = (social: PersistedSocialState): SocialDirectoryPeer[] => {
    const online = getOnlineUserIds();
    return Object.values(social.directory).map((entry) => ({
      ...entry,
      profileId: entry.profileId || generateScholarProfileId(entry.userId),
      online: online.has(entry.userId),
    }));
  };

  const broadcastWs = (event: string, payload: unknown) => {
    const packet = JSON.stringify({ event, payload });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(packet);
      }
    }
  };

  httpServer.on('upgrade', (request, socket, head) => {
    const url = request.url || '';
    if (url.startsWith('/ws/social')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws) => {
    const current = loadSocial();
    ws.send(
      JSON.stringify({
        event: 'social:init',
        payload: {
          messages: current.messages.slice(-120),
          connections: current.connections,
          vaultGrants: current.vaultGrants,
          directory: buildPublicDirectory(current),
        },
      })
    );

    ws.on('message', (raw) => {
      try {
        const parsed = JSON.parse(raw.toString()) as {
          event?: string;
          payload?: Record<string, unknown>;
        };
        if (parsed.event === 'presence:hello' && parsed.payload) {
          const userId = String(parsed.payload.userId || '').trim().slice(0, 128);
          const displayName = String(parsed.payload.displayName || 'Scholar').trim().slice(0, 80);
          const avatarUrl = parsed.payload.avatarUrl
            ? String(parsed.payload.avatarUrl).slice(0, 350000)
            : undefined;
          const avatarVisibility: AvatarVisibility =
            parsed.payload.avatarVisibility === 'connections_only' ? 'connections_only' : 'world';
          const flexTier = (parsed.payload.flexTier as FlexCardRarityTier) || 'Common Slate';

          if (userId) {
            clientUsers.set(ws, userId);
            const social = loadSocial();
            social.directory[userId] = {
              userId,
              profileId: generateScholarProfileId(userId),
              displayName,
              avatarUrl,
              avatarVisibility,
              flexTier,
            };
            saveSocial(social);
            broadcastWs('social:presence:updated', {
              directory: buildPublicDirectory(social),
            });
          }
        }
      } catch {
        // Ignore malformed WS frame
      }
    });

    ws.on('close', () => {
      const hadUser = clientUsers.has(ws);
      clientUsers.delete(ws);
      if (hadUser) {
        const social = loadSocial();
        broadcastWs('social:presence:updated', {
          directory: buildPublicDirectory(social),
        });
      }
    });
  });

  // --- Social SyllabiQ REST + WS Broadcast Endpoints ---
  app.get('/api/social/state', (_req: Request, res: Response) => {
    const social = loadSocial();
    res.json({
      messages: social.messages.slice(-120),
      connections: social.connections,
      vaultGrants: social.vaultGrants,
      directory: buildPublicDirectory(social),
    });
  });

  app.post('/api/social/profile-visibility', (req: Request, res: Response) => {
    const { userId, displayName, avatarUrl, avatarVisibility, flexTier } = req.body as {
      userId?: string;
      displayName?: string;
      avatarUrl?: string;
      avatarVisibility?: AvatarVisibility;
      flexTier?: FlexCardRarityTier;
    };
    const cleanUid = String(userId || '').trim().slice(0, 128);
    if (!cleanUid) {
      res.status(400).json({ error: 'Missing userId.' });
      return;
    }
    const vis: AvatarVisibility =
      avatarVisibility === 'connections_only' ? 'connections_only' : 'world';
    const cleanName = String(displayName || 'Scholar').trim().slice(0, 80);

    const social = loadSocial();
    social.directory[cleanUid] = {
      userId: cleanUid,
      profileId: generateScholarProfileId(cleanUid),
      displayName: cleanName,
      avatarUrl: avatarUrl ? String(avatarUrl).slice(0, 350000) : social.directory[cleanUid]?.avatarUrl,
      avatarVisibility: vis,
      flexTier: flexTier || social.directory[cleanUid]?.flexTier || 'Common Slate',
    };
    social.messages = social.messages.map((m) =>
      m.senderId === cleanUid
        ? {
            ...m,
            senderName: cleanName,
            senderAvatarUrl: avatarUrl ?? m.senderAvatarUrl,
            senderAvatarVisibility: vis,
          }
        : m
    );
    social.connections = social.connections.map((c) => {
      if (c.requesterId === cleanUid) {
        return { ...c, requesterName: cleanName, requesterAvatarUrl: avatarUrl ?? c.requesterAvatarUrl, requesterAvatarVisibility: vis };
      }
      if (c.recipientId === cleanUid) {
        return { ...c, recipientName: cleanName, recipientAvatarUrl: avatarUrl ?? c.recipientAvatarUrl, recipientAvatarVisibility: vis };
      }
      return c;
    });
    saveSocial(social);

    broadcastWs('social:presence:updated', {
      directory: buildPublicDirectory(social),
    });
    res.json({ ok: true, avatarVisibility: vis });
  });

  app.post('/api/social/message', (req: Request, res: Response) => {
    const {
      id,
      channelType,
      channelId,
      senderId,
      senderName,
      senderAvatarUrl,
      senderAvatarVisibility,
      text,
      flexCard,
    } = req.body as {
      id?: string;
      channelType?: 'world' | 'dm';
      channelId?: string;
      senderId?: string;
      senderName?: string;
      senderAvatarUrl?: string;
      senderAvatarVisibility?: AvatarVisibility;
      text?: string;
      flexCard?: SocialFlexAttachment;
    };

    const cleanSenderId = String(senderId || '').trim().slice(0, 128);
    const cleanSenderName = String(senderName || 'Scholar').trim().slice(0, 80);
    if (!cleanSenderId) {
      res.status(400).json({ error: 'Missing senderId.' });
      return;
    }

    const validFlex = Boolean(flexCard && flexCard.credentialCode && flexCard.title);
    const conduct = validateSocialMessageConduct(String(text || ''), validFlex);
    if (!conduct.allowed) {
      res.status(400).json({ error: conduct.violationReason || 'Message blocked by conduct rules.' });
      return;
    }

    const social = loadSocial();
    const msgId = String(id || `soc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);

    // Idempotent duplicate check
    const existing = social.messages.find((m) => m.id === msgId);
    if (existing) {
      res.json({ ok: true, message: existing });
      return;
    }

    const vis: AvatarVisibility =
      senderAvatarVisibility === 'connections_only' ? 'connections_only' : 'world';

    const sanitizedFlex: SocialFlexAttachment | undefined = validFlex && flexCard
      ? {
          credentialCode: String(flexCard.credentialCode).slice(0, 40).toUpperCase(),
          title: String(flexCard.title).slice(0, 120),
          metricBadge: String(flexCard.metricBadge || 'Verified Distinction').slice(0, 80),
          xpPoints: Math.max(0, Math.round(Number(flexCard.xpPoints) || 0)),
          flexTier: flexCard.flexTier || 'Common Slate',
          boardOrUniversity: String(flexCard.boardOrUniversity || 'University').slice(0, 100),
          examName: String(flexCard.examName || 'Finals').slice(0, 100),
          needsSkillRefresh: Boolean(flexCard.needsSkillRefresh),
          staleSubjectNames: Array.isArray(flexCard.staleSubjectNames)
            ? flexCard.staleSubjectNames.slice(0, 4).map((s) => String(s).slice(0, 60))
            : undefined,
        }
      : undefined;

    const created: SocialChatMessage = {
      id: msgId,
      channelType: channelType === 'dm' ? 'dm' : 'world',
      channelId: String(channelId || 'world').slice(0, 128),
      senderId: cleanSenderId,
      senderName: cleanSenderName,
      senderAvatarUrl: senderAvatarUrl ? String(senderAvatarUrl).slice(0, 350000) : undefined,
      senderAvatarVisibility: vis,
      text: conduct.sanitizedText,
      flexCard: sanitizedFlex,
      createdAt: new Date().toISOString(),
    };

    social.messages = [...social.messages.slice(-199), created];
    social.directory[cleanSenderId] = {
      userId: cleanSenderId,
      profileId: social.directory[cleanSenderId]?.profileId || generateScholarProfileId(cleanSenderId),
      displayName: cleanSenderName,
      avatarUrl: created.senderAvatarUrl || social.directory[cleanSenderId]?.avatarUrl,
      avatarVisibility: vis,
      flexTier: sanitizedFlex?.flexTier || social.directory[cleanSenderId]?.flexTier || 'Common Slate',
    };
    saveSocial(social);

    broadcastWs('social:message:created', { message: created });
    res.json({ ok: true, message: created });
  });

  app.post('/api/social/connect', (req: Request, res: Response) => {
    const {
      action,
      requesterId,
      requesterName,
      requesterAvatarUrl,
      requesterAvatarVisibility,
      recipientId,
      recipientName,
      connectionId,
    } = req.body as {
      action?: 'request' | 'accept';
      requesterId?: string;
      requesterName?: string;
      requesterAvatarUrl?: string;
      requesterAvatarVisibility?: AvatarVisibility;
      recipientId?: string;
      recipientName?: string;
      connectionId?: string;
    };

    const social = loadSocial();
    const now = new Date().toISOString();

    if (action === 'accept' && connectionId) {
      let updatedConn: SocialConnection | null = null;
      social.connections = social.connections.map((c) => {
        if (c.id === connectionId) {
          updatedConn = { ...c, status: 'connected', updatedAt: now };
          return updatedConn;
        }
        return c;
      });
      saveSocial(social);
      if (updatedConn) {
        broadcastWs('social:connection:updated', { connection: updatedConn });
      }
      res.json({ ok: true, connection: updatedConn });
      return;
    }

    const reqUid = String(requesterId || '').trim().slice(0, 128);
    const recUid = String(recipientId || '').trim().slice(0, 128);
    if (!reqUid || !recUid || reqUid === recUid) {
      res.status(400).json({ error: 'Invalid connection peer IDs.' });
      return;
    }

    const existing = social.connections.find(
      (c) =>
        (c.requesterId === reqUid && c.recipientId === recUid) ||
        (c.requesterId === recUid && c.recipientId === reqUid)
    );

    if (existing) {
      if (existing.status === 'pending' && existing.recipientId === reqUid) {
        existing.status = 'connected';
        existing.updatedAt = now;
        saveSocial(social);
        broadcastWs('social:connection:updated', { connection: existing });
      }
      res.json({ ok: true, connection: existing });
      return;
    }

    // Seeded demo scholars auto-accept join requests so single-user sandbox sessions can immediately test Private chat & vault sharing, while real live users stay 'pending' until accepted!
    const isSeededPeer = ['cand-ananya-02', 'cand-kabir-03', 'cand-meera-04'].includes(recUid);
    const recPeer = social.directory[recUid];

    const created: SocialConnection = {
      id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      requesterId: reqUid,
      requesterName: String(requesterName || 'Scholar').trim().slice(0, 80),
      requesterAvatarUrl: requesterAvatarUrl ? String(requesterAvatarUrl).slice(0, 350000) : undefined,
      requesterAvatarVisibility:
        requesterAvatarVisibility === 'connections_only' ? 'connections_only' : 'world',
      recipientId: recUid,
      recipientName: String(recipientName || recPeer?.displayName || 'Scholar').trim().slice(0, 80),
      recipientAvatarUrl: recPeer?.avatarUrl,
      recipientAvatarVisibility: recPeer?.avatarVisibility || 'world',
      status: isSeededPeer ? 'connected' : 'pending',
      createdAt: now,
      updatedAt: now,
    };

    social.connections.push(created);
    saveSocial(social);
    broadcastWs('social:connection:updated', { connection: created });
    res.json({ ok: true, connection: created });
  });

  app.post('/api/social/vault-permission', (req: Request, res: Response) => {
    const {
      action,
      ownerId,
      ownerName,
      granteeId,
      granteeName,
      scope,
      singleCredentialCode,
      flexCardsSnapshot,
      reportCardSnapshot,
    } = req.body as {
      action?: 'request' | 'grant' | 'revoke';
      ownerId?: string;
      ownerName?: string;
      granteeId?: string;
      granteeName?: string;
      scope?: VaultPermissionScope;
      singleCredentialCode?: string;
      flexCardsSnapshot?: IssuedCredentialDoc[];
      reportCardSnapshot?: IssuedCredentialDoc | null;
    };

    const cleanOwnerId = String(ownerId || '').trim().slice(0, 128);
    const cleanGranteeId = String(granteeId || '').trim().slice(0, 128);
    if (!cleanOwnerId || !cleanGranteeId || cleanOwnerId === cleanGranteeId) {
      res.status(400).json({ error: 'Invalid ownerId or granteeId.' });
      return;
    }

    const validScope: VaultPermissionScope =
      scope === 'all_flexcards_only' ||
      scope === 'report_card_only' ||
      scope === 'single_credential'
        ? scope
        : 'all_flexcards_and_report';

    const social = loadSocial();
    const now = new Date().toISOString();
    const existingIdx = social.vaultGrants.findIndex(
      (g) => g.ownerId === cleanOwnerId && g.granteeId === cleanGranteeId
    );

    const status: SocialVaultGrant['status'] =
      action === 'revoke' ? 'revoked' : action === 'request' ? 'requested' : 'granted';

    const record: SocialVaultGrant = {
      id:
        existingIdx >= 0
          ? social.vaultGrants[existingIdx].id
          : `vault_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerId: cleanOwnerId,
      ownerName: String(ownerName || social.directory[cleanOwnerId]?.displayName || 'Scholar').slice(0, 80),
      granteeId: cleanGranteeId,
      granteeName: String(
        granteeName || social.directory[cleanGranteeId]?.displayName || 'Scholar'
      ).slice(0, 80),
      scope: validScope,
      singleCredentialCode: singleCredentialCode
        ? String(singleCredentialCode).trim().toUpperCase().slice(0, 40)
        : undefined,
      status,
      flexCardsSnapshot: Array.isArray(flexCardsSnapshot)
        ? flexCardsSnapshot.slice(0, 20)
        : existingIdx >= 0
        ? social.vaultGrants[existingIdx].flexCardsSnapshot
        : [],
      reportCardSnapshot:
        reportCardSnapshot !== undefined
          ? reportCardSnapshot
          : existingIdx >= 0
          ? social.vaultGrants[existingIdx].reportCardSnapshot
          : null,
      updatedAt: now,
    };

    if (existingIdx >= 0) {
      social.vaultGrants[existingIdx] = record;
    } else {
      social.vaultGrants.push(record);
    }

    saveSocial(social);
    broadcastWs('social:vault:updated', { grant: record });
    res.json({ ok: true, grant: record });
  });

  // --- Automated AI Suspension Appeal Interview & Super-Admin-Only Review ---
  app.post('/api/moderation/appeal-interview', async (req: Request, res: Response) => {
    const { candidateName, banReason, transcript } = req.body as {
      candidateName?: string;
      banReason?: string;
      transcript?: AppealInterviewMessage[];
    };

    const cleanName = String(candidateName || 'Scholar').trim();
    const cleanReason = String(banReason || 'Platform conduct & integrity policy violation').trim();
    const turns = Array.isArray(transcript) ? transcript : [];
    const candidateMessages = turns.filter((t) => t.role === 'candidate');

    const ai = getGeminiClient();
    if (ai) {
      try {
        const formatted = turns
          .map((t) => `${t.role === 'interviewer' ? 'AI Appeal Officer' : 'Candidate'}: ${t.text}`)
          .join('\n');

        const prompt = `You are SyllabiQ's impartial Automated Appeal Interviewer conducting a suspension review for candidate "${cleanName}".
Recorded Administrator Suspension Reason: "${cleanReason}"
Candidate responses so far: ${candidateMessages.length}

Conversation Transcript:
${formatted || '(Start of interview)'}

Instructions:
- If the candidate has answered fewer than 2 times, ask ONE clear, respectful follow-up question probing: (1) what specifically happened in their own words, or (2) what concrete safeguard they will follow so this violation never recurs. Set "readyToSubmit": false.
- Once the candidate has provided at least 2 substantive responses (or clearly explained both what happened and their commitment), set "readyToSubmit": true, thank them calmly, remind them that ONLY the Super Admin can approve an unban, and populate a crisp, objective structured summary for the Super Admin.

Return ONLY valid JSON:
{
  "interviewerReply": "Direct message to ${cleanName}",
  "readyToSubmit": false,
  "aiStructuredSummary": "3-4 sentence neutral executive summary for the Super Admin",
  "rootCauseAcknowledged": "1 sentence on whether and how the candidate owned the root cause",
  "candidateCommitment": "1 sentence capturing the candidate's concrete corrective pledge",
  "recommendedActionNote": "1 objective verification note for Super Admin review"
}`;

        const data = await generateJsonWithFreeGemini(
          ai,
          prompt,
          'You are an objective Academic Integrity Appeal Interviewer summarizing appeals for the Super Admin. Output strict JSON only.'
        );

        const ready = candidateMessages.length >= 2 || Boolean(data.readyToSubmit);
        res.json({
          interviewerReply: String(
            data.interviewerReply ||
              'Thank you. Please share what concrete change you will follow to uphold SyllabiQ conduct standards.'
          ),
          readyToSubmit: ready,
          aiStructuredSummary: String(data.aiStructuredSummary || ''),
          rootCauseAcknowledged: String(data.rootCauseAcknowledged || ''),
          candidateCommitment: String(data.candidateCommitment || ''),
          recommendedActionNote: String(data.recommendedActionNote || ''),
          aiGenerated: true,
        });
        return;
      } catch (err) {
        console.error('Appeal interview AI fallback triggered:', err);
      }
    }

    // Deterministic structured multi-step fallback
    if (candidateMessages.length === 0) {
      res.json({
        interviewerReply: `Hello ${cleanName}. Your account is restricted for: "${cleanReason}". In your own words, please explain what happened and any context the Super Admin should know.`,
        readyToSubmit: false,
        aiStructuredSummary: '',
        rootCauseAcknowledged: '',
        candidateCommitment: '',
        recommendedActionNote: '',
        aiGenerated: false,
      });
      return;
    }

    if (candidateMessages.length === 1) {
      res.json({
        interviewerReply:
          'Thank you for explaining. What specific study and platform conduct safeguard do you commit to following if the Super Admin restores your workspace access?',
        readyToSubmit: false,
        aiStructuredSummary: '',
        rootCauseAcknowledged: '',
        candidateCommitment: '',
        recommendedActionNote: '',
        aiGenerated: false,
      });
      return;
    }

    const explanation1 = candidateMessages[0]?.text || '';
    const explanation2 = candidateMessages[candidateMessages.length - 1]?.text || '';
    res.json({
      interviewerReply:
        'Your appeal interview is complete. Review the structured summary below and click "Forward Appeal to Super Admin". Please note that accounts are only unbanned if the Super Admin agrees.',
      readyToSubmit: true,
      aiStructuredSummary: `${cleanName} appealed the suspension ("${cleanReason}"). They explained the incident ("${explanation1.slice(
        0,
        160
      )}") and stated a corrective commitment ("${explanation2.slice(0, 160)}").`,
      rootCauseAcknowledged: explanation1.slice(0, 200),
      candidateCommitment: explanation2.slice(0, 200),
      recommendedActionNote:
        'Verify past XP deduction history before granting Super Admin reinstatement.',
      aiGenerated: false,
    });
  });

  app.post('/api/moderation/appeals/submit', (req: Request, res: Response) => {
    const {
      ownerUid,
      candidateName,
      candidateEmail,
      banReason,
      interviewTranscript,
      aiStructuredSummary,
      rootCauseAcknowledged,
      candidateCommitment,
      recommendedActionNote,
    } = req.body as Partial<SuspensionAppealRecord>;

    const cleanUid = String(ownerUid || '').trim().slice(0, 128);
    if (!cleanUid) {
      res.status(400).json({ error: 'Missing candidate ownerUid.' });
      return;
    }

    const store = loadAppeals();
    const record: SuspensionAppealRecord = {
      id: `apl_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ownerUid: cleanUid,
      candidateName: String(candidateName || 'Scholar').trim().slice(0, 80),
      candidateEmail: String(candidateEmail || '').trim().slice(0, 160),
      banReason: String(banReason || 'Account Suspension').trim().slice(0, 240),
      interviewTranscript: Array.isArray(interviewTranscript) ? interviewTranscript.slice(0, 16) : [],
      aiStructuredSummary: String(
        aiStructuredSummary || 'Candidate completed automated appeal interview for Super Admin review.'
      ).slice(0, 800),
      rootCauseAcknowledged: String(rootCauseAcknowledged || 'Acknowledged during appeal interview.').slice(
        0,
        300
      ),
      candidateCommitment: String(candidateCommitment || 'Committed to full compliance.').slice(0, 300),
      recommendedActionNote: String(
        recommendedActionNote || 'Awaiting exclusive Super Admin decision.'
      ).slice(0, 240),
      status: 'pending_super_admin',
      createdAt: new Date().toISOString(),
    };

    // Replace any older pending appeal for same ownerUid so queue stays crisp
    store.appeals = [
      record,
      ...store.appeals.filter(
        (a) => !(a.ownerUid === cleanUid && a.status === 'pending_super_admin')
      ),
    ].slice(0, 100);
    saveAppeals(store);

    broadcastWs('moderation:appeal:updated', { appeal: record });
    res.json({ ok: true, appeal: record });
  });

  app.get('/api/moderation/appeals', (req: Request, res: Response) => {
    const ownerUid = String(req.query.ownerUid || '').trim();
    const store = loadAppeals();
    const list = ownerUid
      ? store.appeals.filter((a) => a.ownerUid === ownerUid)
      : store.appeals;
    res.json({ appeals: list });
  });

  app.post('/api/moderation/appeals/decide', (req: Request, res: Response) => {
    const { appealId, staffTier, reviewerEmail, decision, decisionNote } = req.body as {
      appealId?: string;
      staffTier?: string;
      reviewerEmail?: string;
      decision?: 'approved_unbanned' | 'rejected';
      decisionNote?: string;
    };

    // STRICT GOVERNANCE GATE: Only Super Admin can unban / decide appeals!
    if (staffTier !== 'super_admin') {
      res.status(403).json({
        error: 'Strict Governance Rule: Only the Super Admin can approve or reject suspension appeals.',
      });
      return;
    }

    if (!appealId || (decision !== 'approved_unbanned' && decision !== 'rejected')) {
      res.status(400).json({ error: 'Missing appealId or valid decision.' });
      return;
    }

    const store = loadAppeals();
    let updatedAppeal: SuspensionAppealRecord | null = null;
    const now = new Date().toISOString();

    store.appeals = store.appeals.map((a) => {
      if (a.id === appealId) {
        updatedAppeal = {
          ...a,
          status: decision,
          reviewedAt: now,
          reviewedByEmail: String(reviewerEmail || 'Super Admin').slice(0, 160),
          superAdminDecisionNote: String(
            decisionNote ||
              (decision === 'approved_unbanned'
                ? 'Appeal accepted by Super Admin. Account unbanned.'
                : 'Appeal declined by Super Admin. Suspension remains active.')
          ).slice(0, 240),
        };
        return updatedAppeal;
      }
      return a;
    });

    if (!updatedAppeal) {
      res.status(404).json({ error: 'Appeal record not found.' });
      return;
    }

    saveAppeals(store);
    broadcastWs('moderation:appeal:updated', { appeal: updatedAppeal });
    res.json({ ok: true, appeal: updatedAppeal });
  });

  // --- AI-Generated "Academic Integrity & Ethics" Recovery Module ---
  app.post('/api/ethics/generate-module', async (req: Request, res: Response) => {
    const { bonusId, infractionTitle, infractionReason, deductedPoints } = req.body as {
      bonusId?: string;
      infractionTitle?: string;
      infractionReason?: string;
      deductedPoints?: number;
    };

    const cleanId = String(bonusId || 'deduction-1');
    const cleanTitle = String(infractionTitle || 'Minor Academic Infraction').trim();
    const cleanReason = String(
      infractionReason || 'Violation of timed test or platform conduct guidelines.'
    ).trim();
    const points = Math.max(10, Math.round(Number(deductedPoints) || 100));
    const fallback = buildFallbackEthicsModule({
      bonusId: cleanId,
      infractionTitle: cleanTitle,
      infractionReason: cleanReason,
      deductedPoints: points,
    });

    const ai = getGeminiClient();
    if (!ai) {
      res.json({ module: fallback, aiGenerated: false });
      return;
    }

    try {
      const prompt = `Generate a concise, constructive "Academic Integrity & Ethics" learning module for a SyllabiQ student who received a ${points} XP deduction.
Infraction Title: "${cleanTitle}"
Specific Reason Logged by Admin: "${cleanReason}"
Recoverable XP on Completion: ${calculateEthicsRecoveryXp(points, false)} XP (40% recovery)

Explain clearly (without shaming) WHAT they did, WHY it was wrong for their own exam readiness and SyllabiQ's verifiable credential ecosystem, 3 core ethical principles, and 3 multiple-choice scenario questions (4 options each, 0-based correctIndex) testing genuine understanding.

Return ONLY valid JSON:
{
  "whatHappenedSummary": "1-2 clear sentences summarizing what occurred",
  "whyItWasWrong": "2-3 insightful sentences explaining why this behavior harms fair diagnostics and credential trust",
  "corePrinciples": ["Principle 1", "Principle 2", "Principle 3"],
  "questions": [
    {
      "question": "Scenario question 1",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "1-sentence takeaway"
    }
  ]
}`;

      const data = await generateJsonWithFreeGemini(
        ai,
        prompt,
        'You are an empathetic Academic Integrity mentor helping students reflect on minor infractions and earn back fractional XP honestly. Output strict JSON only.'
      );

      const rawQs = Array.isArray(data.questions) ? data.questions : [];
      const parsedQs: EthicsQuizQuestion[] =
        rawQs.length >= 3
          ? rawQs.slice(0, 3).map((q: Record<string, unknown>, idx: number) => {
              const opts =
                Array.isArray(q.options) && q.options.length >= 4
                  ? q.options.slice(0, 4).map(String)
                  : fallback.questions[idx].options;
              const cIdx = Number(q.correctIndex);
              return {
                id: `eth-ai-${idx + 1}`,
                question: String(q.question || fallback.questions[idx].question),
                options: opts,
                correctIndex: cIdx >= 0 && cIdx < 4 ? cIdx : 0,
                explanation: String(q.explanation || fallback.questions[idx].explanation),
              };
            })
          : fallback.questions;

      const built: EthicsRecoveryModule = {
        bonusId: cleanId,
        infractionTitle: cleanTitle,
        infractionReason: cleanReason,
        deductedPoints: points,
        recoverableXp: fallback.recoverableXp,
        whatHappenedSummary: String(data.whatHappenedSummary || fallback.whatHappenedSummary),
        whyItWasWrong: String(data.whyItWasWrong || fallback.whyItWasWrong),
        corePrinciples:
          Array.isArray(data.corePrinciples) && data.corePrinciples.length >= 2
            ? data.corePrinciples.slice(0, 3).map(String)
            : fallback.corePrinciples,
        questions: parsedQs,
        usedAi: true,
      };

      res.json({ module: built, aiGenerated: true });
    } catch (err) {
      console.error('Ethics module AI generation fallback:', err);
      res.json({ module: fallback, aiGenerated: false });
    }
  });
}
