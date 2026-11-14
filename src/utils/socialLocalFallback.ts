import type {
  AvatarVisibility,
  FlexCardRarityTier,
  IssuedCredentialDoc,
  SocialChatMessage,
  SocialConnection,
  SocialDirectoryPeer,
  SocialFlexAttachment,
  SocialVaultGrant,
  VaultPermissionScope,
} from '../types';
import { validateSocialMessageConduct } from './skillRefreshAndEthics';
import {
  generateFlexCardSerial,
  generateReportCardSerial,
  generateScholarProfileId,
} from './verificationAndReferral';

export const SOCIAL_LOCAL_STORAGE_KEY = 'syllabiq_social_local_v1';

export interface LocalSocialState {
  messages: SocialChatMessage[];
  connections: SocialConnection[];
  vaultGrants: SocialVaultGrant[];
  directory: Record<string, Omit<SocialDirectoryPeer, 'online'>>;
}

const memoryFallbackStore = new Map<string, string>();

function readRawStorage(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // Fallback to memory store in restricted contexts
  }
  return memoryFallbackStore.get(key) ?? null;
}

function writeRawStorage(key: string, value: string): void {
  memoryFallbackStore.set(key, value);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore quota / privacy mode storage errors cleanly
  }
}

export function resetSocialMemoryFallbackStoreForTests(): void {
  memoryFallbackStore.clear();
}

export function buildStarterSocialState(): LocalSocialState {
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

export function loadLocalSocialState(): LocalSocialState {
  const starter = buildStarterSocialState();
  try {
    const raw = readRawStorage(SOCIAL_LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalSocialState>;
      const rawMsgs =
        Array.isArray(parsed.messages) && parsed.messages.length > 0
          ? parsed.messages
          : starter.messages;
      const cleanMsgs = rawMsgs.filter(
        (m) => m.channelType === 'world' || m.channelType === 'dm'
      );
      return {
        messages: cleanMsgs.length > 0 ? cleanMsgs : starter.messages,
        connections: Array.isArray(parsed.connections)
          ? parsed.connections
          : starter.connections,
        vaultGrants: Array.isArray(parsed.vaultGrants)
          ? parsed.vaultGrants
          : starter.vaultGrants,
        directory: { ...starter.directory, ...(parsed.directory || {}) },
      };
    }
  } catch {
    // Fall through to starter state
  }
  saveLocalSocialState(starter);
  return starter;
}

export function saveLocalSocialState(state: LocalSocialState): void {
  writeRawStorage(SOCIAL_LOCAL_STORAGE_KEY, JSON.stringify(state));
}

export function fetchSocialStateLocal(): {
  messages: SocialChatMessage[];
  connections: SocialConnection[];
  vaultGrants: SocialVaultGrant[];
  directory: SocialDirectoryPeer[];
  backendAvailable: boolean;
} {
  const social = loadLocalSocialState();
  const directory: SocialDirectoryPeer[] = Object.values(social.directory).map(
    (entry) => ({
      ...entry,
      profileId: entry.profileId || generateScholarProfileId(entry.userId),
      online: true,
    })
  );
  return {
    messages: social.messages.slice(-120),
    connections: social.connections,
    vaultGrants: social.vaultGrants,
    directory,
    backendAvailable: false,
  };
}

export function postSocialMessageLocal(payload: {
  id: string;
  channelType: 'world' | 'dm';
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  senderAvatarVisibility: AvatarVisibility;
  text: string;
  flexCard?: SocialFlexAttachment;
}): { message?: SocialChatMessage; error?: string } {
  const cleanSenderId = String(payload.senderId || '').trim().slice(0, 128);
  const cleanSenderName = String(payload.senderName || 'Scholar').trim().slice(0, 80);
  if (!cleanSenderId) {
    return { error: 'Missing scholar sender ID.' };
  }

  const validFlex = Boolean(
    payload.flexCard && payload.flexCard.credentialCode && payload.flexCard.title
  );
  const conduct = validateSocialMessageConduct(String(payload.text || ''), validFlex);
  if (!conduct.allowed) {
    return {
      error: conduct.violationReason || 'Message blocked by Social SyllabiQ conduct rules.',
    };
  }

  const social = loadLocalSocialState();
  const existing = social.messages.find((m) => m.id === payload.id);
  if (existing) {
    return { message: existing };
  }

  const vis: AvatarVisibility =
    payload.senderAvatarVisibility === 'connections_only' ? 'connections_only' : 'world';

  const sanitizedFlex: SocialFlexAttachment | undefined =
    validFlex && payload.flexCard
      ? {
          credentialCode: String(payload.flexCard.credentialCode).slice(0, 40).toUpperCase(),
          title: String(payload.flexCard.title).slice(0, 120),
          metricBadge: String(payload.flexCard.metricBadge || 'Verified Distinction').slice(0, 80),
          xpPoints: Math.max(0, Math.round(Number(payload.flexCard.xpPoints) || 0)),
          flexTier: payload.flexCard.flexTier || 'Common Slate',
          boardOrUniversity: String(payload.flexCard.boardOrUniversity || 'University').slice(0, 100),
          examName: String(payload.flexCard.examName || 'Finals').slice(0, 100),
          needsSkillRefresh: Boolean(payload.flexCard.needsSkillRefresh),
          staleSubjectNames: Array.isArray(payload.flexCard.staleSubjectNames)
            ? payload.flexCard.staleSubjectNames.slice(0, 4).map((s) => String(s).slice(0, 60))
            : undefined,
        }
      : undefined;

  const created: SocialChatMessage = {
    id: payload.id || `soc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    channelType: payload.channelType === 'dm' ? 'dm' : 'world',
    channelId: String(payload.channelId || 'world').slice(0, 128),
    senderId: cleanSenderId,
    senderName: cleanSenderName,
    senderAvatarUrl: payload.senderAvatarUrl
      ? String(payload.senderAvatarUrl).slice(0, 350000)
      : undefined,
    senderAvatarVisibility: vis,
    text: conduct.sanitizedText,
    flexCard: sanitizedFlex,
    createdAt: new Date().toISOString(),
  };

  social.messages = [...social.messages.slice(-199), created];
  social.directory[cleanSenderId] = {
    userId: cleanSenderId,
    profileId:
      social.directory[cleanSenderId]?.profileId || generateScholarProfileId(cleanSenderId),
    displayName: cleanSenderName,
    avatarUrl: created.senderAvatarUrl || social.directory[cleanSenderId]?.avatarUrl,
    avatarVisibility: vis,
    flexTier:
      sanitizedFlex?.flexTier ||
      social.directory[cleanSenderId]?.flexTier ||
      'Common Slate',
  };
  saveLocalSocialState(social);
  return { message: created };
}

export function updateSocialProfileVisibilityLocal(payload: {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  avatarVisibility: AvatarVisibility;
  flexTier: FlexCardRarityTier;
  profileId?: string;
}): void {
  const cleanUid = String(payload.userId || '').trim().slice(0, 128);
  if (!cleanUid) return;
  const vis: AvatarVisibility =
    payload.avatarVisibility === 'connections_only' ? 'connections_only' : 'world';
  const cleanName = String(payload.displayName || 'Scholar').trim().slice(0, 80);

  const social = loadLocalSocialState();
  social.directory[cleanUid] = {
    userId: cleanUid,
    profileId: payload.profileId || generateScholarProfileId(cleanUid),
    displayName: cleanName,
    avatarUrl: payload.avatarUrl
      ? String(payload.avatarUrl).slice(0, 350000)
      : social.directory[cleanUid]?.avatarUrl,
    avatarVisibility: vis,
    flexTier: payload.flexTier || social.directory[cleanUid]?.flexTier || 'Common Slate',
  };
  social.messages = social.messages.map((m) =>
    m.senderId === cleanUid
      ? {
          ...m,
          senderName: cleanName,
          senderAvatarUrl: payload.avatarUrl ?? m.senderAvatarUrl,
          senderAvatarVisibility: vis,
        }
      : m
  );
  social.connections = social.connections.map((c) => {
    if (c.requesterId === cleanUid) {
      return {
        ...c,
        requesterName: cleanName,
        requesterAvatarUrl: payload.avatarUrl ?? c.requesterAvatarUrl,
        requesterAvatarVisibility: vis,
      };
    }
    if (c.recipientId === cleanUid) {
      return {
        ...c,
        recipientName: cleanName,
        recipientAvatarUrl: payload.avatarUrl ?? c.recipientAvatarUrl,
        recipientAvatarVisibility: vis,
      };
    }
    return c;
  });
  saveLocalSocialState(social);
}

export function requestOrAcceptSocialConnectionLocal(payload: {
  action: 'request' | 'accept';
  requesterId?: string;
  requesterName?: string;
  requesterAvatarUrl?: string;
  requesterAvatarVisibility?: AvatarVisibility;
  recipientId?: string;
  recipientName?: string;
  connectionId?: string;
}): SocialConnection | null {
  const social = loadLocalSocialState();
  const now = new Date().toISOString();

  if (payload.action === 'accept' && payload.connectionId) {
    let updatedConn: SocialConnection | null = null;
    social.connections = social.connections.map((c) => {
      if (c.id === payload.connectionId) {
        updatedConn = { ...c, status: 'connected', updatedAt: now };
        return updatedConn;
      }
      return c;
    });
    saveLocalSocialState(social);
    return updatedConn;
  }

  const reqUid = String(payload.requesterId || '').trim().slice(0, 128);
  const recUid = String(payload.recipientId || '').trim().slice(0, 128);
  if (!reqUid || !recUid || reqUid === recUid) return null;

  const existing = social.connections.find(
    (c) =>
      (c.requesterId === reqUid && c.recipientId === recUid) ||
      (c.requesterId === recUid && c.recipientId === reqUid)
  );
  if (existing) {
    if (existing.status === 'pending' && existing.recipientId === reqUid) {
      existing.status = 'connected';
      existing.updatedAt = now;
      saveLocalSocialState(social);
    }
    return existing;
  }

  const isSeededPeer = ['cand-ananya-02', 'cand-kabir-03', 'cand-meera-04'].includes(recUid);
  const recPeer = social.directory[recUid];

  const created: SocialConnection = {
    id: `conn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    requesterId: reqUid,
    requesterName: String(payload.requesterName || 'Scholar').trim().slice(0, 80),
    requesterAvatarUrl: payload.requesterAvatarUrl
      ? String(payload.requesterAvatarUrl).slice(0, 350000)
      : undefined,
    requesterAvatarVisibility:
      payload.requesterAvatarVisibility === 'connections_only' ? 'connections_only' : 'world',
    recipientId: recUid,
    recipientName: String(payload.recipientName || recPeer?.displayName || 'Scholar')
      .trim()
      .slice(0, 80),
    recipientAvatarUrl: recPeer?.avatarUrl,
    recipientAvatarVisibility: recPeer?.avatarVisibility || 'world',
    status: isSeededPeer ? 'connected' : 'pending',
    createdAt: now,
    updatedAt: now,
  };

  social.connections.push(created);
  saveLocalSocialState(social);
  return created;
}

export function updateSocialVaultPermissionLocal(payload: {
  action: 'request' | 'grant' | 'revoke';
  ownerId: string;
  ownerName: string;
  granteeId: string;
  granteeName: string;
  scope: VaultPermissionScope;
  singleCredentialCode?: string;
  flexCardsSnapshot?: IssuedCredentialDoc[];
  reportCardSnapshot?: IssuedCredentialDoc | null;
}): SocialVaultGrant | null {
  const cleanOwnerId = String(payload.ownerId || '').trim().slice(0, 128);
  const cleanGranteeId = String(payload.granteeId || '').trim().slice(0, 128);
  if (!cleanOwnerId || !cleanGranteeId || cleanOwnerId === cleanGranteeId) return null;

  const validScope: VaultPermissionScope =
    payload.scope === 'all_flexcards_only' ||
    payload.scope === 'report_card_only' ||
    payload.scope === 'single_credential'
      ? payload.scope
      : 'all_flexcards_and_report';

  const social = loadLocalSocialState();
  const now = new Date().toISOString();
  const existingIdx = social.vaultGrants.findIndex(
    (g) => g.ownerId === cleanOwnerId && g.granteeId === cleanGranteeId
  );

  const status: SocialVaultGrant['status'] =
    payload.action === 'revoke'
      ? 'revoked'
      : payload.action === 'request'
      ? 'requested'
      : 'granted';

  const existingGrant = existingIdx >= 0 ? social.vaultGrants[existingIdx] : undefined;

  const record: SocialVaultGrant = {
    id: existingGrant?.id || `vault_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    ownerId: cleanOwnerId,
    ownerName: String(
      payload.ownerName || social.directory[cleanOwnerId]?.displayName || 'Scholar'
    ).slice(0, 80),
    granteeId: cleanGranteeId,
    granteeName: String(
      payload.granteeName || social.directory[cleanGranteeId]?.displayName || 'Scholar'
    ).slice(0, 80),
    scope: validScope,
    singleCredentialCode: payload.singleCredentialCode
      ? String(payload.singleCredentialCode).trim().toUpperCase().slice(0, 40)
      : existingGrant?.singleCredentialCode,
    status,
    flexCardsSnapshot: Array.isArray(payload.flexCardsSnapshot)
      ? payload.flexCardsSnapshot.slice(0, 15)
      : existingGrant?.flexCardsSnapshot || [],
    reportCardSnapshot:
      payload.reportCardSnapshot !== undefined
        ? payload.reportCardSnapshot
        : existingGrant?.reportCardSnapshot ?? null,
    updatedAt: now,
  };

  if (existingIdx >= 0) {
    social.vaultGrants[existingIdx] = record;
  } else {
    social.vaultGrants.push(record);
  }
  saveLocalSocialState(social);
  return record;
}
