import type {
  AvatarVisibility,
  FlexCardRarityTier,
  IssuedCredentialDoc,
  PostRoleBadge,
  SocialChatMessage,
  SocialConnection,
  SocialDirectoryPeer,
  SocialFlexAttachment,
  SocialVaultGrant,
  VaultPermissionScope,
} from '../types';
import { validateSocialMessageConduct } from './skillRefreshAndEthics';
import {
  formatPostRoleLabel,
  generateScholarProfileId,
  isBotAccountId,
  isBotDisplayName,
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

const LEGACY_BOT_RECORD_IDS = new Set([
  'soc-msg-1',
  'soc-msg-2',
  'soc-msg-3',
  'conn-ananya-sandbox',
  'conn-meera-sandbox-pending',
  'vault-ananya-to-sandbox',
]);

export function buildStarterSocialState(): LocalSocialState {
  return {
    directory: {},
    messages: [],
    connections: [],
    vaultGrants: [],
  };
}

function sanitizeLoadedSocialState(parsed: Partial<LocalSocialState>): LocalSocialState {
  const cleanDirectory: Record<string, Omit<SocialDirectoryPeer, 'online'>> = {};
  if (parsed.directory && typeof parsed.directory === 'object') {
    for (const [uid, entry] of Object.entries(parsed.directory)) {
      if (!entry || isBotAccountId(uid) || isBotAccountId(entry.userId) || isBotDisplayName(entry.displayName)) {
        continue;
      }
      if (entry.isGmailAccount !== true) {
        continue;
      }
      cleanDirectory[uid] = {
        ...entry,
        userId: entry.userId || uid,
        profileId: entry.profileId || generateScholarProfileId(entry.userId || uid),
        isGmailAccount: true,
        roleBadge: formatPostRoleLabel(entry.roleBadge),
      };
    }
  }

  const rawMsgs = Array.isArray(parsed.messages) ? parsed.messages : [];
  const cleanMsgs = rawMsgs.filter((m) => {
    if (!m || LEGACY_BOT_RECORD_IDS.has(m.id)) return false;
    if (m.channelType !== 'world' && m.channelType !== 'dm') return false;
    if (isBotAccountId(m.senderId) || isBotDisplayName(m.senderName)) return false;
    return m.senderIsGmailAccount === true;
  }).map((m) => ({
    ...m,
    senderIsGmailAccount: true,
    senderRoleBadge: formatPostRoleLabel(m.senderRoleBadge),
  }));

  const rawConns = Array.isArray(parsed.connections) ? parsed.connections : [];
  const cleanConns = rawConns.filter((c) => {
    if (!c || LEGACY_BOT_RECORD_IDS.has(c.id)) return false;
    if (
      isBotAccountId(c.requesterId) ||
      isBotAccountId(c.recipientId) ||
      isBotDisplayName(c.requesterName) ||
      isBotDisplayName(c.recipientName)
    ) {
      return false;
    }
    return true;
  });

  const rawGrants = Array.isArray(parsed.vaultGrants) ? parsed.vaultGrants : [];
  const cleanGrants = rawGrants.filter((g) => {
    if (!g || LEGACY_BOT_RECORD_IDS.has(g.id)) return false;
    if (isBotAccountId(g.ownerId) || isBotAccountId(g.granteeId)) return false;
    return true;
  });

  return {
    directory: cleanDirectory,
    messages: cleanMsgs,
    connections: cleanConns,
    vaultGrants: cleanGrants,
  };
}

export function loadLocalSocialState(): LocalSocialState {
  const starter = buildStarterSocialState();
  try {
    const raw = readRawStorage(SOCIAL_LOCAL_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalSocialState>;
      const cleaned = sanitizeLoadedSocialState(parsed);
      saveLocalSocialState(cleaned);
      return cleaned;
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
  const directory: SocialDirectoryPeer[] = Object.values(social.directory)
    .filter((entry) => entry.isGmailAccount === true && !isBotAccountId(entry.userId))
    .map((entry) => ({
      ...entry,
      profileId: entry.profileId || generateScholarProfileId(entry.userId),
      isGmailAccount: true,
      roleBadge: formatPostRoleLabel(entry.roleBadge),
      online: true,
    }));
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
  senderIsGmailAccount?: boolean;
  senderRoleBadge?: PostRoleBadge;
  text: string;
  flexCard?: SocialFlexAttachment;
}): { message?: SocialChatMessage; error?: string } {
  const cleanSenderId = String(payload.senderId || '').trim().slice(0, 128);
  const cleanSenderName = String(payload.senderName || 'Scholar').trim().slice(0, 80);
  if (!cleanSenderId || isBotAccountId(cleanSenderId)) {
    return { error: 'Missing scholar sender ID.' };
  }
  if (payload.senderIsGmailAccount !== true) {
    return { error: 'Only accounts signed in with Gmail (@gmail.com) can post in Social SyllabiQ.' };
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
  const roleBadge = formatPostRoleLabel(payload.senderRoleBadge);

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
    senderIsGmailAccount: true,
    ...(roleBadge ? { senderRoleBadge: roleBadge } : {}),
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
    isGmailAccount: true,
    ...(roleBadge ? { roleBadge } : {}),
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
  isGmailAccount?: boolean;
  roleBadge?: PostRoleBadge;
}): void {
  const cleanUid = String(payload.userId || '').trim().slice(0, 128);
  if (!cleanUid || isBotAccountId(cleanUid)) return;

  const social = loadLocalSocialState();
  if (payload.isGmailAccount !== true) {
    if (social.directory[cleanUid]) {
      delete social.directory[cleanUid];
      saveLocalSocialState(social);
    }
    return;
  }

  const vis: AvatarVisibility =
    payload.avatarVisibility === 'connections_only' ? 'connections_only' : 'world';
  const cleanName = String(payload.displayName || 'Scholar').trim().slice(0, 80);
  const roleBadge = formatPostRoleLabel(payload.roleBadge);

  social.directory[cleanUid] = {
    userId: cleanUid,
    profileId: payload.profileId || generateScholarProfileId(cleanUid),
    displayName: cleanName,
    avatarUrl: payload.avatarUrl
      ? String(payload.avatarUrl).slice(0, 350000)
      : social.directory[cleanUid]?.avatarUrl,
    avatarVisibility: vis,
    flexTier: payload.flexTier || social.directory[cleanUid]?.flexTier || 'Common Slate',
    isGmailAccount: true,
    ...(roleBadge ? { roleBadge } : {}),
  };
  social.messages = social.messages.map((m) =>
    m.senderId === cleanUid
      ? {
          ...m,
          senderName: cleanName,
          senderAvatarUrl: payload.avatarUrl ?? m.senderAvatarUrl,
          senderAvatarVisibility: vis,
          senderIsGmailAccount: true,
          ...(roleBadge ? { senderRoleBadge: roleBadge } : {}),
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
  if (
    !reqUid ||
    !recUid ||
    reqUid === recUid ||
    isBotAccountId(reqUid) ||
    isBotAccountId(recUid)
  ) {
    return null;
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
      saveLocalSocialState(social);
    }
    return existing;
  }

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
    status: 'pending',
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
