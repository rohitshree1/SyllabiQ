import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Globe,
  Lock,
  MessageSquare,
  RefreshCw,
  Search,
  SearchCheck,
  Send,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserPlus,
  X,
} from 'lucide-react';
import type {
  AppState,
  AvatarVisibility,
  CandidateXpSnapshot,
  IssuedCredentialDoc,
  PostRoleBadge,
  SocialChatMessage,
  SocialConnection,
  SocialDirectoryPeer,
  SocialFlexAttachment,
  SocialVaultGrant,
  SubjectRefreshStatus,
  VaultPermissionScope,
} from '../types';
import {
  fetchSocialSyllabiQStateApi,
  postSocialMessageApi,
  requestOrAcceptSocialConnectionApi,
  updateSocialProfileVisibilityApi,
  updateSocialVaultPermissionApi,
} from '../utils/apiClient';
import {
  filterPermittedVaultForViewer,
  resolveVisibleAvatarForViewer,
  VAULT_SCOPE_LABELS,
  validateSocialMessageConduct,
} from '../utils/skillRefreshAndEthics';
import {
  formatPostRoleLabel,
  generateScholarProfileId,
  isBotAccountId,
  isBotDisplayName,
  normalizeProfileId,
} from '../utils/verificationAndReferral';
import {
  acceptSocialConnectionInCloud,
  publishSocialMessageInCloud,
  requestSocialConnectionInCloud,
  subscribeToSocialConnectionsInCloud,
  subscribeToSocialDmMessagesInCloud,
  subscribeToSocialProfilesInCloud,
  subscribeToSocialWorldMessagesInCloud,
  upsertSocialProfileInCloud,
} from '../services/cloudService';

interface SocialSyllabiQViewProps {
  state: AppState;
  ownerKey: string;
  isCloudAuthenticated?: boolean;
  isGmailAuthenticated?: boolean;
  userEmail?: string;
  currentUserRoleBadge?: PostRoleBadge;
  avatarUrl?: string;
  xpSnapshot: CandidateXpSnapshot;
  staleSubjects: SubjectRefreshStatus[];
  issuedFlexCards: IssuedCredentialDoc[];
  issuedReportCard: IssuedCredentialDoc;
  onUpdateAvatarVisibility: (visibility: AvatarVisibility) => void;
  onOpenVerifyModal: (prefillSerial?: string) => void;
  onNavigateAboutRules: () => void;
}

function buildDmChannelId(uidA: string, uidB: string): string {
  return `dm::${[uidA, uidB].sort().join('::')}`;
}

function getInitials(name: string): string {
  const parts = String(name || 'Scholar')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'SQ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function renderPostRoleTag(badge?: PostRoleBadge | string, darkBg = false) {
  const formatted = formatPostRoleLabel(badge);
  if (!formatted) return null;
  if (darkBg) {
    const darkColor =
      formatted === 'Super Admin'
        ? 'text-amber-300'
        : formatted === 'Delegated Team Admin'
        ? 'text-sky-300'
        : 'text-indigo-200';
    return <span className={`text-[11px] font-semibold ${darkColor}`}>· {formatted}</span>;
  }
  const styleClass =
    formatted === 'Super Admin'
      ? 'text-amber-900 bg-amber-50 border-amber-200'
      : formatted === 'Delegated Team Admin'
      ? 'text-sky-900 bg-sky-50 border-sky-200'
      : 'text-indigo-900 bg-indigo-50 border-indigo-200';
  return (
    <span
      data-testid={`role-label-${formatted.toLowerCase().replace(/\s+/g, '-')}`}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold leading-none whitespace-nowrap ${styleClass}`}
    >
      {formatted}
    </span>
  );
}

export const SocialSyllabiQView: React.FC<SocialSyllabiQViewProps> = ({
  state,
  ownerKey,
  isCloudAuthenticated = false,
  isGmailAuthenticated = false,
  userEmail,
  currentUserRoleBadge,
  avatarUrl,
  xpSnapshot,
  staleSubjects,
  issuedFlexCards,
  issuedReportCard,
  onUpdateAvatarVisibility,
  onOpenVerifyModal,
  onNavigateAboutRules,
}) => {
  const [section, setSection] = useState<'world' | 'private'>('world');
  const [wsConnected, setWsConnected] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState(false);

  const [messages, setMessages] = useState<SocialChatMessage[]>([]);
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [vaultGrants, setVaultGrants] = useState<SocialVaultGrant[]>([]);
  const [directory, setDirectory] = useState<SocialDirectoryPeer[]>([]);

  // Active 1-on-1 Peer in Private mode (strictly 1-on-1, no groups)
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);

  // Profile ID Search in World mode
  const [profileIdSearch, setProfileIdSearch] = useState<string>('');
  const [copiedMyId, setCopiedMyId] = useState<boolean>(false);

  // Message Composer
  const [draftText, setDraftText] = useState('');
  const [selectedFlexSerial, setSelectedFlexSerial] = useState<string>('');
  const [composerError, setComposerError] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  // Granular Vault Permission Controls (for active 1-on-1 peer)
  const [grantScopeDraft, setGrantScopeDraft] =
    useState<VaultPermissionScope>('all_flexcards_and_report');
  const [singleCredDraft, setSingleCredDraft] = useState<string>('');
  const [vaultFeedback, setVaultFeedback] = useState<string>('');

  const avatarVisibility: AvatarVisibility = state.student.avatarVisibility || 'world';
  const candidateName = state.student.name || 'Scholar';
  const myProfileId = useMemo(() => generateScholarProfileId(ownerKey), [ownerKey]);

  const latestIdentityRef = useRef({
    ownerKey,
    candidateName,
    avatarUrl,
    avatarVisibility,
    flexTier: xpSnapshot.rarity.tier,
    profileId: myProfileId,
    isGmailAuthenticated,
    currentUserRoleBadge,
  });
  latestIdentityRef.current = {
    ownerKey,
    candidateName,
    avatarUrl,
    avatarVisibility,
    flexTier: xpSnapshot.rarity.tier,
    profileId: myProfileId,
    isGmailAuthenticated,
    currentUserRoleBadge,
  };

  // Merge helpers (strictly idempotent per real-time guidelines)
  const upsertMessage = (incoming: SocialChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === incoming.id)) return prev;
      return [...prev, incoming].slice(-200);
    });
  };

  const upsertConnection = (incoming: SocialConnection) => {
    setConnections((prev) => {
      const idx = prev.findIndex((c) => c.id === incoming.id);
      if (idx === -1) return [...prev, incoming];
      const next = [...prev];
      next[idx] = incoming;
      return next;
    });
  };

  const upsertVaultGrant = (incoming: SocialVaultGrant) => {
    setVaultGrants((prev) => {
      const idx = prev.findIndex((v) => v.id === incoming.id);
      if (idx === -1) return [...prev, incoming];
      const next = [...prev];
      next[idx] = incoming;
      return next;
    });
  };

  // Initial HTTP/local state sync + live WebSocket ONLY when Express backend is present
  useEffect(() => {
    let active = true;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let retryAttempt = 0;

    const connectSocket = () => {
      if (!active) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${proto}//${window.location.host}/ws/social`;

      try {
        ws = new WebSocket(url);
      } catch {
        const delayMs = Math.min(15000, 2500 * Math.pow(2, retryAttempt));
        retryAttempt += 1;
        reconnectTimer = window.setTimeout(connectSocket, delayMs);
        return;
      }

      ws.onopen = () => {
        if (!active || !ws) return;
        retryAttempt = 0;
        setWsConnected(true);
        const ident = latestIdentityRef.current;
        if (ident.isGmailAuthenticated && ident.ownerKey !== 'sandbox-candidate') {
          ws.send(
            JSON.stringify({
              event: 'presence:hello',
              payload: {
                userId: ident.ownerKey,
                displayName: ident.candidateName,
                avatarUrl: ident.avatarUrl,
                avatarVisibility: ident.avatarVisibility,
                flexTier: ident.flexTier,
                profileId: ident.profileId,
                isGmailAccount: true,
                roleBadge: ident.currentUserRoleBadge,
              },
            })
          );
        }
      };

      ws.onmessage = (evt) => {
        if (!active) return;
        try {
          const packet = JSON.parse(String(evt.data)) as {
            event?: string;
            payload?: Record<string, unknown>;
          };
          if (packet.event === 'social:init' && packet.payload) {
            if (Array.isArray(packet.payload.messages)) {
              setMessages(
                (packet.payload.messages as SocialChatMessage[]).filter(
                  (m) =>
                    m.senderIsGmailAccount === true &&
                    !isBotAccountId(m.senderId) &&
                    !isBotDisplayName(m.senderName)
                )
              );
            }
            if (Array.isArray(packet.payload.connections)) {
              setConnections(
                (packet.payload.connections as SocialConnection[]).filter(
                  (c) => !isBotAccountId(c.requesterId) && !isBotAccountId(c.recipientId)
                )
              );
            }
            if (Array.isArray(packet.payload.vaultGrants)) {
              setVaultGrants(
                (packet.payload.vaultGrants as SocialVaultGrant[]).filter(
                  (v) => !isBotAccountId(v.ownerId) && !isBotAccountId(v.granteeId)
                )
              );
            }
            if (Array.isArray(packet.payload.directory)) {
              setDirectory(
                (packet.payload.directory as SocialDirectoryPeer[]).filter(
                  (d) =>
                    d.isGmailAccount === true &&
                    !isBotAccountId(d.userId) &&
                    !isBotDisplayName(d.displayName)
                )
              );
            }
          } else if (packet.event === 'social:message:created' && packet.payload?.message) {
            const incomingMsg = packet.payload.message as SocialChatMessage;
            if (
              incomingMsg.senderIsGmailAccount === true &&
              !isBotAccountId(incomingMsg.senderId) &&
              !isBotDisplayName(incomingMsg.senderName)
            ) {
              upsertMessage(incomingMsg);
            }
          } else if (packet.event === 'social:connection:updated' && packet.payload?.connection) {
            const incomingConn = packet.payload.connection as SocialConnection;
            if (!isBotAccountId(incomingConn.requesterId) && !isBotAccountId(incomingConn.recipientId)) {
              upsertConnection(incomingConn);
            }
          } else if (packet.event === 'social:vault:updated' && packet.payload?.grant) {
            const incomingGrant = packet.payload.grant as SocialVaultGrant;
            if (!isBotAccountId(incomingGrant.ownerId) && !isBotAccountId(incomingGrant.granteeId)) {
              upsertVaultGrant(incomingGrant);
            }
          } else if (packet.event === 'social:presence:updated' && packet.payload?.directory) {
            setDirectory(
              (packet.payload.directory as SocialDirectoryPeer[]).filter(
                (d) =>
                  d.isGmailAccount === true &&
                  !isBotAccountId(d.userId) &&
                  !isBotDisplayName(d.displayName)
              )
            );
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onclose = () => {
        if (!active) return;
        setWsConnected(false);
        const delayMs = Math.min(15000, 2500 * Math.pow(2, retryAttempt));
        retryAttempt += 1;
        reconnectTimer = window.setTimeout(connectSocket, delayMs);
      };
    };

    void fetchSocialSyllabiQStateApi().then((initial) => {
      if (!active) return;
      setBackendAvailable(initial.backendAvailable);
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of initial.messages) {
          if (
            m.senderIsGmailAccount === true &&
            !isBotAccountId(m.senderId) &&
            !isBotDisplayName(m.senderName)
          ) {
            map.set(m.id, m);
          }
        }
        return Array.from(map.values()).slice(-200);
      });
      setConnections((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        for (const c of initial.connections) {
          if (!isBotAccountId(c.requesterId) && !isBotAccountId(c.recipientId)) {
            map.set(c.id, c);
          }
        }
        return Array.from(map.values());
      });
      setVaultGrants(
        initial.vaultGrants.filter((v) => !isBotAccountId(v.ownerId) && !isBotAccountId(v.granteeId))
      );
      setDirectory((prev) => {
        const map = new Map(prev.map((d) => [d.userId, d]));
        for (const d of initial.directory) {
          if (
            d.isGmailAccount === true &&
            !isBotAccountId(d.userId) &&
            !isBotDisplayName(d.displayName)
          ) {
            map.set(d.userId, d);
          }
        }
        return Array.from(map.values());
      });

      if (initial.backendAvailable) {
        connectSocket();
      } else if (latestIdentityRef.current.isGmailAuthenticated && ownerKey !== 'sandbox-candidate') {
        // Register local verified Gmail scholar card into directory on static hosts
        const ident = latestIdentityRef.current;
        void updateSocialProfileVisibilityApi({
          userId: ident.ownerKey,
          profileId: ident.profileId,
          displayName: ident.candidateName,
          avatarUrl: ident.avatarUrl,
          avatarVisibility: ident.avatarVisibility,
          flexTier: ident.flexTier,
          isGmailAccount: true,
          roleBadge: ident.currentUserRoleBadge,
        });
      }
    });

    return () => {
      active = false;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [ownerKey, isGmailAuthenticated, currentUserRoleBadge]);

  // Real-time Cloud Firestore Social Sync for verified Gmail accounts (cross-browser on GitHub Pages)
  useEffect(() => {
    if (!isCloudAuthenticated || !ownerKey || ownerKey === 'sandbox-candidate') return;

    if (isGmailAuthenticated) {
      const ident = latestIdentityRef.current;
      void upsertSocialProfileInCloud({
        userId: ident.ownerKey,
        profileId: ident.profileId,
        displayName: ident.candidateName,
        avatarUrl: ident.avatarUrl,
        avatarVisibility: ident.avatarVisibility,
        flexTier: ident.flexTier,
        isGmailAccount: true,
        roleBadge: ident.currentUserRoleBadge,
      });
    }

    const unsubProfiles = subscribeToSocialProfilesInCloud((cloudPeers) => {
      setDirectory((prev) => {
        const map = new Map(
          prev
            .filter(
              (p) =>
                p.isGmailAccount === true &&
                !isBotAccountId(p.userId) &&
                !isBotDisplayName(p.displayName)
            )
            .map((p) => [p.userId, p])
        );
        for (const p of cloudPeers) {
          if (
            p.isGmailAccount === true &&
            !isBotAccountId(p.userId) &&
            !isBotDisplayName(p.displayName)
          ) {
            map.set(p.userId, p);
          }
        }
        return Array.from(map.values());
      });
    });

    const unsubWorld = subscribeToSocialWorldMessagesInCloud((cloudMsgs) => {
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of cloudMsgs) {
          if (
            m.senderIsGmailAccount === true &&
            !isBotAccountId(m.senderId) &&
            !isBotDisplayName(m.senderName)
          ) {
            map.set(m.id, m);
          }
        }
        return Array.from(map.values())
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(-200);
      });
    });

    const unsubDm = subscribeToSocialDmMessagesInCloud(ownerKey, (cloudDms) => {
      setMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        for (const m of cloudDms) {
          if (
            m.senderIsGmailAccount === true &&
            !isBotAccountId(m.senderId) &&
            !isBotDisplayName(m.senderName)
          ) {
            map.set(m.id, m);
          }
        }
        return Array.from(map.values())
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
          .slice(-200);
      });
    });

    const unsubConns = subscribeToSocialConnectionsInCloud(ownerKey, (cloudConns) => {
      setConnections((prev) => {
        const map = new Map(prev.map((c) => [c.id, c]));
        for (const c of cloudConns) {
          if (!isBotAccountId(c.requesterId) && !isBotAccountId(c.recipientId)) {
            map.set(c.id, c);
          }
        }
        return Array.from(map.values());
      });
    });

    return () => {
      unsubProfiles();
      unsubWorld();
      unsubDm();
      unsubConns();
    };
  }, [isCloudAuthenticated, isGmailAuthenticated, ownerKey, currentUserRoleBadge]);

  // Sync profile visibility & avatar updates to server directory (delegated to App handler)
  const handleToggleAvatarVisibility = (nextVis: AvatarVisibility) => {
    onUpdateAvatarVisibility(nextVis);
  };

  // 1-Click Copy Scholar Profile ID
  const handleCopyProfileId = async (idToCopy: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(idToCopy);
      }
      setCopiedMyId(true);
      setTimeout(() => setCopiedMyId(false), 2500);
    } catch {
      // Fallback
    }
  };

  const gmailDirectory = useMemo(
    () =>
      directory.filter(
        (d) =>
          d.isGmailAccount === true &&
          !isBotAccountId(d.userId) &&
          !isBotDisplayName(d.displayName)
      ),
    [directory]
  );

  const otherGmailScholars = useMemo(
    () => gmailDirectory.filter((d) => d.userId !== ownerKey),
    [gmailDirectory, ownerKey]
  );

  // Connected peers & pending requests for current scholar (strictly real Gmail accounts, zero bots)
  const myConnections = useMemo(
    () =>
      connections.filter(
        (c) =>
          (c.requesterId === ownerKey || c.recipientId === ownerKey) &&
          !isBotAccountId(c.requesterId) &&
          !isBotAccountId(c.recipientId)
      ),
    [connections, ownerKey]
  );

  const connectedPeerIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of myConnections) {
      if (c.status === 'connected') {
        set.add(c.requesterId === ownerKey ? c.recipientId : c.requesterId);
      }
    }
    return set;
  }, [myConnections, ownerKey]);

  const connectedPeersList = useMemo(() => {
    return myConnections
      .filter((c) => c.status === 'connected')
      .map((c) => {
        const isReq = c.requesterId === ownerKey;
        const peerId = isReq ? c.recipientId : c.requesterId;
        const dirEntry = gmailDirectory.find((d) => d.userId === peerId);
        return {
          connectionId: c.id,
          peerId,
          profileId: dirEntry?.profileId || generateScholarProfileId(peerId),
          peerName: dirEntry?.displayName || (isReq ? c.recipientName : c.requesterName),
          peerAvatarUrl: dirEntry?.avatarUrl || (isReq ? c.recipientAvatarUrl : c.requesterAvatarUrl),
          peerAvatarVisibility:
            dirEntry?.avatarVisibility ||
            (isReq ? c.recipientAvatarVisibility : c.requesterAvatarVisibility) ||
            'world',
          flexTier: dirEntry?.flexTier || 'Rare Sapphire',
          roleBadge: formatPostRoleLabel(dirEntry?.roleBadge),
          online: Boolean(dirEntry?.online),
        };
      });
  }, [myConnections, ownerKey, gmailDirectory]);

  const incomingPendingRequests = useMemo(
    () =>
      myConnections.filter(
        (c) => c.status === 'pending' && c.recipientId === ownerKey
      ),
    [myConnections, ownerKey]
  );

  // Default Private 1-on-1 target selection when switching to Private
  useEffect(() => {
    if (selectedPeerId) return;
    if (connectedPeersList.length > 0) {
      setSelectedPeerId(connectedPeersList[0].peerId);
    }
  }, [connectedPeersList, selectedPeerId]);

  const allSelectableSingleCredentials = useMemo(
    () => [...issuedFlexCards, issuedReportCard],
    [issuedFlexCards, issuedReportCard]
  );

  useEffect(() => {
    if (!singleCredDraft && allSelectableSingleCredentials.length > 0) {
      setSingleCredDraft(allSelectableSingleCredentials[0].credentialCode);
    }
  }, [allSelectableSingleCredentials, singleCredDraft]);

  // Active DM Peer (strictly 1-on-1)
  const activeDmPeer = useMemo(
    () => connectedPeersList.find((p) => p.peerId === selectedPeerId) || null,
    [connectedPeersList, selectedPeerId]
  );

  // Active channel resolution: strictly 'world' or 'dm' (1-on-1)
  const activeChannelMeta = useMemo(() => {
    if (section === 'world') {
      return {
        channelType: 'world' as const,
        channelId: 'world',
        title: 'World Scholar Stream',
        subtitle:
          'Direct to World Communication · Gmail-verified accounts only · Teacher, Delegated Team Admin & Super Admin roles labeled',
        peer: null,
      };
    }
    if (!activeDmPeer) {
      return null;
    }
    return {
      channelType: 'dm' as const,
      channelId: buildDmChannelId(ownerKey, activeDmPeer.peerId),
      title: activeDmPeer.peerName,
      subtitle: `1-on-1 Private Study Conversation · ${activeDmPeer.flexTier} · Profile ID: ${activeDmPeer.profileId}`,
      peer: activeDmPeer,
    };
  }, [section, activeDmPeer, ownerKey]);

  const worldMessagesCount = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.channelType === 'world' &&
          m.senderIsGmailAccount === true &&
          !isBotAccountId(m.senderId) &&
          !isBotDisplayName(m.senderName)
      ).length,
    [messages]
  );

  const visibleChannelMessages = useMemo(() => {
    if (!activeChannelMeta) return [];
    return messages.filter(
      (m) =>
        m.channelType === activeChannelMeta.channelType &&
        m.channelId === activeChannelMeta.channelId &&
        m.senderIsGmailAccount === true &&
        !isBotAccountId(m.senderId) &&
        !isBotDisplayName(m.senderName)
    );
  }, [messages, activeChannelMeta]);

  const messagesFeedRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesFeedRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [visibleChannelMessages.length, activeChannelMeta?.channelId]);

  // Search filter for Gmail-verified scholars by Profile ID or Name in World section
  const matchedScholars = useMemo(() => {
    const raw = profileIdSearch.trim();
    if (!raw) return [];
    const normalized = normalizeProfileId(raw);
    const lower = raw.toLowerCase();
    return gmailDirectory.filter((peer) => {
      const pid = peer.profileId || generateScholarProfileId(peer.userId);
      const normPid = normalizeProfileId(pid);
      return (
        normPid.includes(normalized) ||
        peer.displayName.toLowerCase().includes(lower) ||
        peer.userId.toLowerCase().includes(lower)
      );
    });
  }, [gmailDirectory, profileIdSearch]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChannelMeta) return;
    setComposerError('');

    if (!isGmailAuthenticated || ownerKey === 'sandbox-candidate') {
      setComposerError(
        'Only accounts signed in with Google (@gmail.com) can post in World or 1-on-1 chats.'
      );
      return;
    }

    const matchedFlexDoc = selectedFlexSerial
      ? issuedFlexCards.find((f) => f.credentialCode === selectedFlexSerial)
      : undefined;

    const flexAttachment: SocialFlexAttachment | undefined = matchedFlexDoc
      ? {
          credentialCode: matchedFlexDoc.credentialCode,
          title: matchedFlexDoc.title,
          metricBadge: matchedFlexDoc.subtitleOrMetric,
          xpPoints: matchedFlexDoc.xpPoints,
          flexTier: matchedFlexDoc.flexTier,
          boardOrUniversity: matchedFlexDoc.boardOrUniversity,
          examName: matchedFlexDoc.examName,
          needsSkillRefresh: staleSubjects.length > 0,
          staleSubjectNames: staleSubjects.map((s) => s.subjectName),
        }
      : undefined;

    const conductCheck = validateSocialMessageConduct(draftText, Boolean(flexAttachment));
    if (!conductCheck.allowed) {
      setComposerError(
        conductCheck.violationReason || 'Message blocked by Social SyllabiQ conduct rules.'
      );
      return;
    }

    const msgId = `soc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setSendingMsg(true);
    try {
      const res = await postSocialMessageApi({
        id: msgId,
        channelType: activeChannelMeta.channelType,
        channelId: activeChannelMeta.channelId,
        senderId: ownerKey,
        senderName: candidateName,
        senderAvatarUrl: avatarUrl,
        senderAvatarVisibility: avatarVisibility,
        senderIsGmailAccount: true,
        senderRoleBadge: currentUserRoleBadge,
        text: conductCheck.sanitizedText,
        flexCard: flexAttachment,
      });

      if (res.error) {
        setComposerError(res.error);
        return;
      }
      if (res.message) {
        upsertMessage(res.message);
      }

      if (isCloudAuthenticated) {
        void publishSocialMessageInCloud({
          id: msgId,
          channelType: activeChannelMeta.channelType,
          channelId: activeChannelMeta.channelId,
          peerId: activeChannelMeta.peer?.peerId,
          senderId: ownerKey,
          senderName: candidateName,
          senderAvatarUrl: avatarUrl,
          senderAvatarVisibility: avatarVisibility,
          senderIsGmailAccount: true,
          senderRoleBadge: currentUserRoleBadge,
          text: conductCheck.sanitizedText,
          flexCard: flexAttachment,
        });
      }

      setDraftText('');
      setSelectedFlexSerial('');
    } finally {
      setSendingMsg(false);
    }
  };

  const handleConnectPeer = async (peerId: string, peerName: string) => {
    if (!isGmailAuthenticated || ownerKey === 'sandbox-candidate') {
      setComposerError('Only Gmail-signed-in accounts can initiate 1-on-1 study connections.');
      return;
    }
    if (isBotAccountId(peerId)) return;

    if (isCloudAuthenticated) {
      const cloudConn = await requestSocialConnectionInCloud({
        requesterId: ownerKey,
        requesterName: candidateName,
        requesterAvatarUrl: avatarUrl,
        requesterAvatarVisibility: avatarVisibility,
        recipientId: peerId,
        recipientName: peerName,
      });
      if (cloudConn) {
        upsertConnection(cloudConn);
        if (cloudConn.status === 'connected') {
          setSection('private');
          setSelectedPeerId(peerId);
        }
        return;
      }
    }

    const conn = await requestOrAcceptSocialConnectionApi({
      action: 'request',
      requesterId: ownerKey,
      requesterName: candidateName,
      requesterAvatarUrl: avatarUrl,
      requesterAvatarVisibility: avatarVisibility,
      recipientId: peerId,
      recipientName: peerName,
    });
    if (conn) {
      upsertConnection(conn);
      if (conn.status === 'connected') {
        setSection('private');
        setSelectedPeerId(peerId);
      }
    }
  };

  const handleAcceptPendingRequest = async (conn: SocialConnection) => {
    if (!isGmailAuthenticated || ownerKey === 'sandbox-candidate') return;
    if (isCloudAuthenticated && conn.id.startsWith('conn_')) {
      await acceptSocialConnectionInCloud({
        connectionId: conn.id,
        recipientAvatarUrl: avatarUrl,
        recipientAvatarVisibility: avatarVisibility,
      });
    }
    const updated = await requestOrAcceptSocialConnectionApi({
      action: 'accept',
      connectionId: conn.id,
    });
    if (updated) {
      upsertConnection(updated);
      setSection('private');
      setSelectedPeerId(conn.requesterId);
    }
  };

  // Vault grants for currently selected 1-on-1 peer
  const peerGrantToMe = useMemo(() => {
    if (!activeDmPeer) return null;
    return (
      vaultGrants.find(
        (g) => g.ownerId === activeDmPeer.peerId && g.granteeId === ownerKey
      ) || null
    );
  }, [vaultGrants, activeDmPeer, ownerKey]);

  const myGrantToPeer = useMemo(() => {
    if (!activeDmPeer) return null;
    return (
      vaultGrants.find(
        (g) => g.ownerId === ownerKey && g.granteeId === activeDmPeer.peerId
      ) || null
    );
  }, [vaultGrants, activeDmPeer, ownerKey]);

  const permittedFromPeer = useMemo(
    () => filterPermittedVaultForViewer({ grant: peerGrantToMe, viewerId: ownerKey }),
    [peerGrantToMe, ownerKey]
  );

  const handleRequestPeerVault = async () => {
    if (!activeDmPeer) return;
    const updated = await updateSocialVaultPermissionApi({
      action: 'request',
      ownerId: activeDmPeer.peerId,
      ownerName: activeDmPeer.peerName,
      granteeId: ownerKey,
      granteeName: candidateName,
      scope: 'all_flexcards_and_report',
    });
    if (updated) {
      upsertVaultGrant(updated);
      setVaultFeedback(`Sent credential view request to ${activeDmPeer.peerName}.`);
      setTimeout(() => setVaultFeedback(''), 3000);
    }
  };

  const handleUpdateMyGrantToPeer = async (action: 'grant' | 'revoke') => {
    if (!activeDmPeer) return;
    const updated = await updateSocialVaultPermissionApi({
      action,
      ownerId: ownerKey,
      ownerName: candidateName,
      granteeId: activeDmPeer.peerId,
      granteeName: activeDmPeer.peerName,
      scope: grantScopeDraft,
      singleCredentialCode:
        grantScopeDraft === 'single_credential' ? singleCredDraft : undefined,
      flexCardsSnapshot: issuedFlexCards,
      reportCardSnapshot: issuedReportCard,
    });
    if (updated) {
      upsertVaultGrant(updated);
      setVaultFeedback(
        action === 'grant'
          ? `Granted "${VAULT_SCOPE_LABELS[grantScopeDraft]}" to ${activeDmPeer.peerName}.`
          : `Revoked credential vault access for ${activeDmPeer.peerName}.`
      );
      setTimeout(() => setVaultFeedback(''), 3000);
    }
  };

  const renderScholarAvatar = (params: {
    userId: string;
    displayName: string;
    rawAvatarUrl?: string;
    visibility: AvatarVisibility;
    sizeClass?: string;
  }) => {
    const isConnected = connectedPeerIds.has(params.userId);
    const resolvedUrl = resolveVisibleAvatarForViewer({
      ownerId: params.userId,
      viewerId: ownerKey,
      avatarUrl: params.rawAvatarUrl,
      avatarVisibility: params.visibility,
      isConnectedPeer: isConnected,
    });
    const sz = params.sizeClass || 'h-9 w-9';

    if (resolvedUrl) {
      return (
        <img
          src={resolvedUrl}
          alt={`${params.displayName} avatar`}
          referrerPolicy="no-referrer"
          className={`${sz} shrink-0 rounded-full border border-slate-200 object-cover`}
        />
      );
    }

    return (
      <div
        title={
          params.visibility === 'connections_only' && !isConnected && params.userId !== ownerKey
            ? 'Profile photo visible only to joined 1-on-1 Private connections'
            : params.displayName
        }
        className={`${sz} shrink-0 rounded-full border border-slate-300 bg-slate-900 text-white flex items-center justify-center font-mono text-xs font-bold`}
      >
        {getInitials(params.displayName)}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Your Own Profile ID with 1-Click Copy */}
      <section
        aria-label="Your SyllabiQ Profile ID Banner"
        className="rounded-2xl border border-sky-200 bg-linear-to-r from-sky-50 via-white to-blue-50/70 p-4 sm:p-5 shadow-2xs"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 font-mono text-[11px] font-bold text-sky-800">
                <Sparkles className="h-3 w-3 text-sky-600" />
                <span>YOUR PROFILE ID</span>
              </span>
              <span className="text-xs text-slate-500">
                Share this unique ID so peers can find and chat with you 1-on-1.
              </span>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <code className="font-mono text-base sm:text-lg font-bold tracking-wider text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-200/90 shadow-2xs">
                {myProfileId}
              </code>
              <button
                type="button"
                onClick={() => handleCopyProfileId(myProfileId)}
                aria-label="Copy your Profile ID"
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors shadow-2xs whitespace-nowrap"
              >
                {copiedMyId ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-slate-600" />
                    <span>Copy ID</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="text-xs text-slate-600 sm:text-right space-y-0.5">
            <div className="flex flex-wrap items-center sm:justify-end gap-1.5">
              <p className="font-semibold text-slate-900">{candidateName}</p>
              {renderPostRoleTag(currentUserRoleBadge)}
            </div>
            <p className="text-[11px] text-slate-500">
              {xpSnapshot.netXp} XP · {xpSnapshot.rarity.tier}
              {userEmail ? ` · ${userEmail}` : ''}
            </p>
          </div>
        </div>
      </section>

      {!isGmailAuthenticated && (
        <section
          role="status"
          data-testid="social-gmail-only-notice"
          className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-950 flex items-start gap-2.5"
        >
          <ShieldCheck className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <p className="font-semibold">
              Verified Gmail Sign-In Required for Social SyllabiQ
            </p>
            <p className="text-amber-900/90 leading-relaxed">
              Only accounts signed in with Google (<span className="font-mono">@gmail.com</span>)
              appear in the Scholars Directory and can post in World or 1-on-1 chats. Posts made
              by a Teacher, Delegated Team Admin, or Super Admin always show their role label.
            </p>
          </div>
        </section>
      )}

      {/* Header: Direct to World / 1-on-1 Private Switch + Photo Visibility Policy */}
      <section className="glass-panel rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
              <span className="font-semibold text-sky-700">Social SyllabiQ</span>
              <span aria-hidden="true">·</span>
              <span>Gmail-Verified Accounts Only</span>
              <span aria-hidden="true">·</span>
              <span>1-on-1 Private Conversations</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {wsConnected
                  ? 'Live Socket Synced'
                  : isCloudAuthenticated
                  ? 'Cloud Firestore Live'
                  : backendAvailable
                  ? 'HTTP Sync Active'
                  : 'Local Storage Synced'}
              </span>
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900">
              Scholarly World Stream &amp; 1-on-1 Private Study Vaults
            </h2>
            <p className="text-xs text-slate-600 max-w-2xl leading-relaxed">
              Only Gmail-verified accounts and verified FlexCards appear in chat—zero bot accounts,
              links, or spam. Posts by Teachers, Delegated Team Admins, and Super Admins are clearly
              labeled. Search any account using its unique Profile ID in World to start a direct
              1-on-1 conversation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <div
              role="tablist"
              aria-label="Social SyllabiQ communication modes"
              className="flex items-center gap-1 rounded-xl bg-slate-100 p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={section === 'world'}
                onClick={() => setSection('world')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  section === 'world'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="h-3.5 w-3.5" />
                <span>World ({worldMessagesCount})</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={section === 'private'}
                onClick={() => setSection('private')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  section === 'private'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Lock className="h-3.5 w-3.5" />
                <span>
                  1-on-1 Private ({connectedPeersList.length} Joined
                  {incomingPendingRequests.length > 0
                    ? ` · ${incomingPendingRequests.length} Request`
                    : ''}
                  )
                </span>
              </button>
            </div>

            <button
              type="button"
              onClick={onNavigateAboutRules}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-sky-600" />
              <span>Conduct Rules</span>
            </button>
          </div>
        </div>

        {/* Profile Photo Visibility Control */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="text-slate-600">
            <strong className="text-slate-900">Your Profile Photo Visibility:</strong>{' '}
            {avatarVisibility === 'world'
              ? 'Everyone in World & 1-on-1 Private sees your profile photo.'
              : 'Hidden as monogram in World; only joined scholars in 1-on-1 Private can see your photo.'}
          </div>

          <div
            role="group"
            aria-label="Profile photo visibility"
            className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start sm:self-auto"
          >
            <button
              type="button"
              onClick={() => handleToggleAvatarVisibility('world')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                avatarVisibility === 'world'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye className="h-3.5 w-3.5 text-sky-600" />
              <span>Everyone (World)</span>
            </button>
            <button
              type="button"
              onClick={() => handleToggleAvatarVisibility('connections_only')}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                avatarVisibility === 'connections_only'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <EyeOff className="h-3.5 w-3.5 text-amber-600" />
              <span>Joined 1-on-1 Only</span>
            </button>
          </div>
        </div>
      </section>

      {/* Main Two-Column Social Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sidebar (4 cols): Profile ID Search & Scholars in World OR 1-on-1 Peers in Private */}
        <aside className="lg:col-span-4 space-y-5">
          {section === 'world' ? (
            <section className="glass-panel rounded-2xl p-5 space-y-4">
              <div className="border-b border-slate-200 pb-3 space-y-1">
                <h3 className="font-display text-base font-bold text-slate-900">
                  Search Scholar by Profile ID
                </h3>
                <p className="text-xs text-slate-500">
                  Search an individual person on World using their Profile ID to start a 1-on-1 private conversation.
                </p>
              </div>

              {/* Profile ID Search Input */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={profileIdSearch}
                    onChange={(e) => setProfileIdSearch(e.target.value)}
                    placeholder="Search by Profile ID (e.g., SLQ-USR-...) or Name"
                    className="w-full rounded-xl border border-slate-300 bg-white pl-9 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                  {profileIdSearch && (
                    <button
                      type="button"
                      onClick={() => setProfileIdSearch('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick-Test Search Chips */}
                {(otherGmailScholars.length > 0 || isGmailAuthenticated) && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-400">Quick Filter:</span>
                    {otherGmailScholars.slice(0, 3).map((peer) => {
                      const peerPid = peer.profileId || generateScholarProfileId(peer.userId);
                      return (
                        <button
                          key={peer.userId}
                          type="button"
                          onClick={() => setProfileIdSearch(peerPid)}
                          className="rounded-md bg-slate-100 hover:bg-slate-200 px-2 py-0.5 text-slate-700 font-mono transition-colors"
                        >
                          {peer.displayName.split(' ')[0]} ({peerPid.slice(-4)})
                        </button>
                      );
                    })}
                    {isGmailAuthenticated && (
                      <button
                        type="button"
                        onClick={() => setProfileIdSearch(myProfileId)}
                        className="rounded-md bg-sky-50 hover:bg-sky-100 px-2 py-0.5 text-sky-700 font-mono transition-colors"
                      >
                        My ID
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Search Results Card */}
              {profileIdSearch.trim() && (
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-sky-950">
                      Search Results ({matchedScholars.length})
                    </span>
                    <span className="font-mono text-[11px] text-sky-700">
                      Query: {profileIdSearch.trim()}
                    </span>
                  </div>

                  {matchedScholars.length === 0 ? (
                    <p className="text-xs text-slate-500 py-1">
                      No Gmail-signed-in scholar found matching ID &ldquo;{profileIdSearch.trim()}&rdquo;. Ask the person to sign in with Gmail and share their exact Profile ID.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {matchedScholars.map((peer) => {
                        const isMe = peer.userId === ownerKey;
                        const peerPid = peer.profileId || generateScholarProfileId(peer.userId);
                        const existingConn = myConnections.find(
                          (c) =>
                            c.requesterId === peer.userId || c.recipientId === peer.userId
                        );
                        const isConnected = existingConn?.status === 'connected';
                        const isPendingIncoming =
                          existingConn?.status === 'pending' &&
                          existingConn.recipientId === ownerKey;
                        const isPendingOutgoing =
                          existingConn?.status === 'pending' &&
                          existingConn.requesterId === ownerKey;

                        return (
                          <div
                            key={peer.userId}
                            className="rounded-lg border border-slate-200 bg-white p-2.5 flex items-center justify-between gap-2.5"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {renderScholarAvatar({
                                userId: peer.userId,
                                displayName: peer.displayName,
                                rawAvatarUrl: peer.avatarUrl,
                                visibility: peer.avatarVisibility,
                              })}
                              <div className="min-w-0 space-y-0.5">
                                <p className="text-xs font-bold text-slate-900 truncate flex flex-wrap items-center gap-1.5">
                                  <span>{peer.displayName}</span>
                                  {renderPostRoleTag(peer.roleBadge)}
                                  {isMe && (
                                    <span className="text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded font-semibold">
                                      You
                                    </span>
                                  )}
                                </p>
                                <p className="font-mono text-[10px] font-semibold text-sky-700 bg-sky-50/80 px-1.5 py-0.5 rounded inline-block">
                                  {peerPid}
                                </p>
                                <p className="text-[11px] text-slate-500 truncate">
                                  {peer.flexTier}
                                </p>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isMe ? (
                                <span className="text-xs font-semibold text-slate-400">Your Card</span>
                              ) : isConnected ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSection('private');
                                    setSelectedPeerId(peer.userId);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                                >
                                  <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>Open 1-on-1</span>
                                </button>
                              ) : isPendingIncoming && existingConn ? (
                                <button
                                  type="button"
                                  onClick={() => handleAcceptPendingRequest(existingConn)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  <span>Accept Join</span>
                                </button>
                              ) : isPendingOutgoing ? (
                                <span className="text-xs font-medium text-slate-400 whitespace-nowrap">
                                  Requested
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleConnectPeer(peer.userId, peer.displayName)}
                                  className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                                >
                                  <UserPlus className="h-3.5 w-3.5 text-sky-400" />
                                  <span>Start 1-on-1</span>
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* All Active Gmail Accounts List */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <h4 className="font-bold text-slate-900">
                    Scholars Directory ({otherGmailScholars.length})
                  </h4>
                  <span className="text-[11px] text-slate-500">Gmail-Only · 1-on-1</span>
                </div>

                {otherGmailScholars.length === 0 ? (
                  <p
                    data-testid="empty-gmail-directory"
                    className="text-xs text-slate-500 py-3 leading-relaxed"
                  >
                    No other Gmail-signed-in accounts online yet.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {otherGmailScholars.map((peer) => {
                      const peerPid = peer.profileId || generateScholarProfileId(peer.userId);
                      const existingConn = myConnections.find(
                        (c) =>
                          c.requesterId === peer.userId || c.recipientId === peer.userId
                      );
                      const isConnected = existingConn?.status === 'connected';
                      const isPendingIncoming =
                        existingConn?.status === 'pending' &&
                        existingConn.recipientId === ownerKey;
                      const isPendingOutgoing =
                        existingConn?.status === 'pending' &&
                        existingConn.requesterId === ownerKey;

                      return (
                        <div
                          key={peer.userId}
                          className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {renderScholarAvatar({
                              userId: peer.userId,
                              displayName: peer.displayName,
                              rawAvatarUrl: peer.avatarUrl,
                              visibility: peer.avatarVisibility,
                            })}
                            <div className="min-w-0 space-y-0.5">
                              <p className="text-xs font-bold text-slate-900 truncate flex flex-wrap items-center gap-1.5">
                                <span>{peer.displayName}</span>
                                {renderPostRoleTag(peer.roleBadge)}
                              </p>
                              <p className="font-mono text-[10px] text-sky-700 bg-sky-50 px-1.5 py-0.2 rounded inline-block truncate">
                                {peerPid}
                              </p>
                              <p className="text-[11px] text-slate-500 truncate">
                                {peer.flexTier}
                                {peer.avatarVisibility === 'connections_only' && !isConnected
                                  ? ' · Photo 1-on-1 Only'
                                  : ''}
                              </p>
                            </div>
                          </div>

                          {isConnected ? (
                            <button
                              type="button"
                              onClick={() => {
                                setSection('private');
                                setSelectedPeerId(peer.userId);
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                            >
                              <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                              <span>Open 1-on-1</span>
                            </button>
                          ) : isPendingIncoming && existingConn ? (
                            <button
                              type="button"
                              onClick={() => handleAcceptPendingRequest(existingConn)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                            >
                              <Check className="h-3.5 w-3.5" />
                              <span>Accept Join</span>
                            </button>
                          ) : isPendingOutgoing ? (
                            <span className="text-xs font-medium text-slate-400 whitespace-nowrap shrink-0">
                              Requested
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!isGmailAuthenticated}
                              onClick={() => handleConnectPeer(peer.userId, peer.displayName)}
                              className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                            >
                              <UserPlus className="h-3.5 w-3.5 text-sky-400" />
                              <span>Join</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          ) : (
            <section className="glass-panel rounded-2xl p-5 space-y-5">
              {/* Incoming Pending Join Requests */}
              {incomingPendingRequests.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 space-y-2.5">
                  <p className="text-xs font-bold text-amber-950">
                    Pending Join Requests ({incomingPendingRequests.length})
                  </p>
                  {incomingPendingRequests.map((req) => {
                    const reqDir = gmailDirectory.find((d) => d.userId === req.requesterId);
                    return (
                      <div
                        key={req.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-semibold text-slate-900 truncate flex items-center gap-1.5">
                          <span>{req.requesterName}</span>
                          {renderPostRoleTag(reqDir?.roleBadge)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAcceptPendingRequest(req)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Accept &amp; Join</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Joined 1-on-1 Scholars List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900">
                    Joined 1-on-1 Scholars ({connectedPeersList.length})
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSection('world')}
                    className="text-[11px] font-semibold text-sky-700 hover:underline"
                  >
                    + Find in World
                  </button>
                </div>

                {connectedPeersList.length === 0 ? (
                  <p className="text-xs text-slate-500 py-3">
                    No 1-on-1 scholars joined yet. Switch to World to search by Profile ID and send a Join request.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {connectedPeersList.map((peer) => {
                      const active = selectedPeerId === peer.peerId;
                      return (
                        <button
                          key={peer.peerId}
                          type="button"
                          onClick={() => setSelectedPeerId(peer.peerId)}
                          className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
                            active
                              ? 'bg-slate-900 text-white shadow-2xs'
                              : 'hover:bg-slate-100 text-slate-800'
                          }`}
                        >
                          {renderScholarAvatar({
                            userId: peer.peerId,
                            displayName: peer.peerName,
                            rawAvatarUrl: peer.peerAvatarUrl,
                            visibility: peer.peerAvatarVisibility,
                            sizeClass: 'h-8 w-8',
                          })}
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-xs font-semibold truncate flex items-center gap-1.5">
                              <span>{peer.peerName}</span>
                              {renderPostRoleTag(peer.roleBadge, active)}
                            </p>
                            <p
                              className={`font-mono text-[10px] truncate ${
                                active ? 'text-sky-300' : 'text-sky-700'
                              }`}
                            >
                              {peer.profileId}
                            </p>
                            <p
                              className={`text-[11px] truncate ${
                                active ? 'text-slate-300' : 'text-slate-500'
                              }`}
                            >
                              {peer.flexTier}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </aside>

        {/* Right Main Column (8 cols): Chat Stream + FlexCard Composer + 1-on-1 Private Vault Sharing */}
        <div className="lg:col-span-8 space-y-6">
          <section className="glass-panel rounded-2xl p-6 space-y-4">
            {activeChannelMeta ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                  <div>
                    <h3 className="font-display text-lg font-bold text-slate-900 flex flex-wrap items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-sky-600 shrink-0" />
                      <span>{activeChannelMeta.title}</span>
                      {activeChannelMeta.peer?.roleBadge &&
                        renderPostRoleTag(activeChannelMeta.peer.roleBadge)}
                    </h3>
                    <p className="text-xs text-slate-500">{activeChannelMeta.subtitle}</p>
                  </div>

                  {section === 'private' && activeDmPeer && (
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-sky-800 bg-sky-50 border border-sky-200 rounded px-2 py-0.5">
                        {activeDmPeer.profileId}
                      </span>
                    </div>
                  )}
                </div>

                {/* Messages Feed */}
                <div
                  ref={messagesFeedRef}
                  className="max-h-[420px] overflow-y-auto space-y-3 pr-1"
                >
                  {visibleChannelMessages.length === 0 ? (
                    <div
                      data-testid="empty-world-stream"
                      className="py-10 text-center text-xs text-slate-500"
                    >
                      No messages in <strong>{activeChannelMeta.title}</strong> yet.{' '}
                      {isGmailAuthenticated
                        ? 'Share a study check-in or attach one of your verified FlexCards below.'
                        : 'Sign in with Gmail to start the conversation.'}
                    </div>
                  ) : (
                    visibleChannelMessages.map((msg) => {
                      const isMine = msg.senderId === ownerKey;
                      const senderDir = gmailDirectory.find((d) => d.userId === msg.senderId);
                      const resolvedRoleBadge = formatPostRoleLabel(
                        msg.senderRoleBadge ||
                          senderDir?.roleBadge ||
                          (isMine ? currentUserRoleBadge : undefined)
                      );
                      return (
                        <article
                          key={msg.id}
                          className={`rounded-xl border p-4 space-y-2.5 ${
                            isMine
                              ? 'border-sky-200 bg-sky-50/40'
                              : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {renderScholarAvatar({
                                userId: msg.senderId,
                                displayName: msg.senderName,
                                rawAvatarUrl: isMine ? avatarUrl : msg.senderAvatarUrl,
                                visibility: isMine
                                  ? avatarVisibility
                                  : msg.senderAvatarVisibility,
                                sizeClass: 'h-8 w-8',
                              })}
                              <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-900">
                                  {msg.senderName}
                                </span>
                                {renderPostRoleTag(resolvedRoleBadge)}
                                {isMine && (
                                  <span className="text-[11px] text-sky-700 font-medium">
                                    · You
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                                {msg.createdAt.slice(11, 16) || msg.createdAt.slice(0, 10)}
                              </span>
                              {!isMine &&
                                isGmailAuthenticated &&
                                !connectedPeerIds.has(msg.senderId) && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleConnectPeer(msg.senderId, msg.senderName)
                                    }
                                    className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap"
                                  >
                                    + Start 1-on-1
                                  </button>
                                )}
                            </div>
                          </div>

                          {msg.text && (
                            <p className="text-xs text-slate-800 leading-relaxed">{msg.text}</p>
                          )}

                          {/* Embedded Verified FlexCard Attachment */}
                          {msg.flexCard && (
                            <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-white space-y-2">
                              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <div className="flex flex-wrap items-center gap-1.5 text-sky-300 font-semibold">
                                  <Award className="h-3.5 w-3.5 shrink-0" />
                                  <span>{msg.flexCard.flexTier}</span>
                                  <span aria-hidden="true">·</span>
                                  <span className="font-mono tabular-nums">
                                    {msg.flexCard.xpPoints} XP
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => onOpenVerifyModal(msg.flexCard?.credentialCode)}
                                  className="inline-flex items-center gap-1 font-mono tabular-nums text-[11px] text-emerald-300 hover:underline whitespace-nowrap"
                                >
                                  <SearchCheck className="h-3.5 w-3.5" />
                                  <span>{msg.flexCard.credentialCode}</span>
                                </button>
                              </div>

                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                  <p className="font-display text-sm font-bold text-white">
                                    {msg.flexCard.title}
                                  </p>
                                  <p className="text-xs text-slate-300">
                                    {msg.flexCard.boardOrUniversity} · {msg.flexCard.examName}
                                  </p>
                                </div>
                                <span className="font-mono tabular-nums text-xs font-semibold text-amber-300 shrink-0">
                                  {msg.flexCard.metricBadge}
                                </span>
                              </div>

                              {msg.flexCard.needsSkillRefresh && (
                                <p className="text-[11px] text-amber-300 inline-flex items-center gap-1.5 pt-0.5">
                                  <RefreshCw className="h-3 w-3 shrink-0" />
                                  <span>
                                    Skill Refresh Needed (60+ days since subject drill
                                    {msg.flexCard.staleSubjectNames?.length
                                      ? `: ${msg.flexCard.staleSubjectNames.join(', ')}`
                                      : ''}
                                    )
                                  </span>
                                </p>
                              )}
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </div>

                {/* FlexCard-Only Chat Composer */}
                <form
                  onSubmit={handleSendMessage}
                  className="border-t border-slate-200 pt-4 space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                    <div className="sm:col-span-7">
                      <label htmlFor="social-message-input" className="sr-only">
                        Write a message to {activeChannelMeta.title}
                      </label>
                      <input
                        id="social-message-input"
                        type="text"
                        maxLength={500}
                        disabled={!isGmailAuthenticated || sendingMsg}
                        value={draftText}
                        onChange={(e) => {
                          setDraftText(e.target.value);
                          if (composerError) setComposerError('');
                        }}
                        placeholder={
                          isGmailAuthenticated
                            ? `Message ${activeChannelMeta.title} (names & FlexCards only — no external photos or links)...`
                            : 'Sign in with a verified @gmail.com account to post in Social SyllabiQ...'
                        }
                        className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-500"
                      />
                    </div>

                    <div className="sm:col-span-5 flex items-center gap-2">
                      <label htmlFor="social-flexcard-select" className="sr-only">
                        Attach Verified FlexCard
                      </label>
                      <select
                        id="social-flexcard-select"
                        disabled={!isGmailAuthenticated || sendingMsg}
                        value={selectedFlexSerial}
                        onChange={(e) => setSelectedFlexSerial(e.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-2.5 py-2.5 text-xs text-slate-800 focus:border-sky-600 focus:outline-hidden disabled:bg-slate-50 disabled:text-slate-500"
                      >
                        <option value="">No FlexCard attached</option>
                        {issuedFlexCards.map((fc) => (
                          <option key={fc.credentialCode} value={fc.credentialCode}>
                            FlexCard: {fc.title} ({fc.credentialCode})
                          </option>
                        ))}
                      </select>

                      <button
                        type="submit"
                        data-testid="social-post-submit"
                        disabled={!isGmailAuthenticated || sendingMsg}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
                      >
                        <Send className="h-3.5 w-3.5 text-sky-400" />
                        <span>{sendingMsg ? 'Sending...' : 'Post'}</span>
                      </button>
                    </div>
                  </div>

                  {composerError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-medium text-red-800 flex items-center gap-2"
                    >
                      <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                      <span>{composerError}</span>
                    </div>
                  )}
                </form>
              </>
            ) : (
              <div className="py-10 text-center text-xs text-slate-500">
                Select a joined scholar on the left or search a Profile ID in World to start a 1-on-1 private conversation.
              </div>
            )}
          </section>

          {/* Granular Private Credential Vault Sharing (1-on-1 Joined Peer Only) */}
          {section === 'private' && activeDmPeer && (
            <section
              aria-label={`Private credential vault permissions with ${activeDmPeer.peerName}`}
              className="glass-panel rounded-2xl p-6 space-y-5"
            >
              <div className="border-b border-slate-200 pb-3">
                <h3 className="font-display text-lg font-bold text-slate-900 flex items-center gap-2">
                  <span>Private Credential Vault Permissions · {activeDmPeer.peerName}</span>
                  <span className="font-mono text-xs font-semibold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    {activeDmPeer.profileId}
                  </span>
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  Joined 1-on-1 scholars can ask or allow each other to view all FlexCards + Report Card,
                  all FlexCards only, Report Card only, or a single selected credential.
                </p>
              </div>

              {vaultFeedback && (
                <div
                  role="status"
                  className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-xs font-semibold text-emerald-800"
                >
                  ✓ {vaultFeedback}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* 1. Peer's Credentials Shared With Me */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-bold text-slate-900">
                      {activeDmPeer.peerName}’s Shared Vault
                    </h4>
                    <span className="text-[11px] font-medium text-slate-500">
                      {peerGrantToMe?.status === 'granted'
                        ? VAULT_SCOPE_LABELS[peerGrantToMe.scope]
                        : peerGrantToMe?.status === 'requested'
                        ? 'Access Requested'
                        : 'Locked'}
                    </span>
                  </div>

                  {peerGrantToMe?.status === 'granted' ? (
                    <div className="space-y-2.5 text-xs">
                      {permittedFromPeer.permittedFlexCards.map((fc) => (
                        <div
                          key={fc.credentialCode}
                          className="rounded-lg border border-slate-200 bg-white p-3 space-y-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">{fc.title}</span>
                            <button
                              type="button"
                              onClick={() => onOpenVerifyModal(fc.credentialCode)}
                              className="font-mono tabular-nums text-[11px] font-semibold text-sky-700 hover:underline"
                            >
                              {fc.credentialCode}
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {fc.subtitleOrMetric} · {fc.flexTier} ({fc.xpPoints} XP)
                          </p>
                        </div>
                      ))}

                      {permittedFromPeer.permittedReportCard && (
                        <div className="rounded-lg border border-sky-200 bg-white p-3 space-y-1">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-slate-900">
                              {permittedFromPeer.permittedReportCard.title}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenVerifyModal(
                                  permittedFromPeer.permittedReportCard?.credentialCode
                                )
                              }
                              className="font-mono tabular-nums text-[11px] font-semibold text-sky-700 hover:underline"
                            >
                              {permittedFromPeer.permittedReportCard.credentialCode}
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-600">
                            {permittedFromPeer.permittedReportCard.subtitleOrMetric}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2.5 text-xs text-slate-600">
                      <p>
                        {peerGrantToMe?.status === 'requested'
                          ? `Waiting for ${activeDmPeer.peerName} to approve your view request.`
                          : `${activeDmPeer.peerName} has not unlocked their credential vault for you yet.`}
                      </p>
                      <button
                        type="button"
                        disabled={peerGrantToMe?.status === 'requested'}
                        onClick={handleRequestPeerVault}
                        className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                      >
                        {peerGrantToMe?.status === 'requested'
                          ? 'Request Pending'
                          : 'Ask Permission to View Credentials'}
                      </button>
                    </div>
                  )}
                </div>

                {/* 2. My Granular Sharing Controls With Peer */}
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="font-bold text-slate-900">
                      What {activeDmPeer.peerName} Can View From You
                    </h4>
                    <span className="font-mono text-[11px] text-sky-700 font-semibold">
                      {myGrantToPeer?.status === 'granted'
                        ? 'Active Grant'
                        : myGrantToPeer?.status === 'requested'
                        ? 'Requested by Peer'
                        : 'Private'}
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor="vault-scope-select"
                      className="block font-semibold text-slate-700 mb-1"
                    >
                      Select Exact Permission Scope
                    </label>
                    <select
                      id="vault-scope-select"
                      value={grantScopeDraft}
                      onChange={(e) =>
                        setGrantScopeDraft(e.target.value as VaultPermissionScope)
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                    >
                      {(Object.keys(VAULT_SCOPE_LABELS) as VaultPermissionScope[]).map((sc) => (
                        <option key={sc} value={sc}>
                          {VAULT_SCOPE_LABELS[sc]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {grantScopeDraft === 'single_credential' && (
                    <div>
                      <label
                        htmlFor="vault-single-cred-select"
                        className="block font-semibold text-slate-700 mb-1"
                      >
                        Choose the Individual Credential
                      </label>
                      <select
                        id="vault-single-cred-select"
                        value={singleCredDraft}
                        onChange={(e) => setSingleCredDraft(e.target.value)}
                        className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                      >
                        {allSelectableSingleCredentials.map((cred) => (
                          <option key={cred.credentialCode} value={cred.credentialCode}>
                            {cred.kind === 'report_card' ? 'Report Card' : 'FlexCard'}:{' '}
                            {cred.title} ({cred.credentialCode})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleUpdateMyGrantToPeer('grant')}
                      className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
                    >
                      Allow Selected Access
                    </button>
                    {myGrantToPeer?.status === 'granted' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateMyGrantToPeer('revoke')}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Revoke Access
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
