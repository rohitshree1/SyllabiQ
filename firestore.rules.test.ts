import test from 'node:test';
import assert from 'node:assert/strict';
import { FieldValue, serverTimestamp, Timestamp } from 'firebase/firestore';
import { createDemoSeedState } from './src/data/seedData';
import {
  BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
  buildSanitizedCandidateSummary,
  buildSanitizedWorkspacePayload,
  computeDelegatedRoleLabel,
  emailToInviteKey,
  evaluateFirestoreRuleOperation,
  filterCandidatePiiForStaff,
  isValidFirestoreId,
  resolveSandboxStaffAccess,
  stripUndefinedDeep,
  type SimulatedDatabaseState,
} from './src/utils/firestoreValidators';

const NOW = '2026-10-26T05:00:00.000Z';

function createBaseSimulatedDb(): SimulatedDatabaseState {
  return {
    users_private: {
      cand_alice: {
        ownerUid: 'cand_alice',
        email: 'alice@university.edu',
        authProvider: 'google.com',
        createdAt: NOW,
        updatedAt: NOW,
      },
    },
    candidates: {
      cand_alice: {
        ownerUid: 'cand_alice',
        displayName: 'Alice Sharma',
        boardOrUniversity: 'CBSE Class 12',
        examName: 'Board Finals',
        examDate: '2026-11-20',
        readinessPercent: 68,
        overallRatingOutOf10: 8.2,
        completedChapters: 6,
        totalChapters: 12,
        attemptsCount: 3,
        focusMinutesLogged: 75,
        bonusPoints: 100,
        banned: false,
        banReason: '',
        adsEnabled: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
      cand_banned: {
        ownerUid: 'cand_banned',
        displayName: 'Suspended User',
        boardOrUniversity: 'DTU',
        examName: 'Sem Finals',
        examDate: '2026-11-25',
        readinessPercent: 20,
        overallRatingOutOf10: 4.0,
        completedChapters: 1,
        totalChapters: 10,
        attemptsCount: 1,
        focusMinutesLogged: 0,
        bonusPoints: 0,
        banned: true,
        banReason: 'Terms violation',
        adsEnabled: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    },
    workspaces: {},
    global_updates: {},
    individual_bonuses: {
      bon_1: {
        id: 'bon_1',
        targetUserId: 'cand_alice',
        targetName: 'Alice Sharma',
        grantedByUid: 'super_admin_uid',
        grantedByName: 'Super Admin',
        bonusTitle: 'Top PYQ Velocity',
        bonusType: 'xp_boost',
        pointsAwarded: 250,
        message: 'Great accuracy streak!',
        acknowledged: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    },
    staff_invites: {
      inv_mod_updates_edu: {
        inviteKey: 'inv_mod_updates_edu',
        targetEmail: 'mod@updates.edu',
        displayName: 'Updates Moderator',
        adminPhone: '+91 98201 11223',
        canPostUpdates: true,
        canGrantBonuses: false,
        canBanUsers: false,
        status: 'active',
        createdByUid: 'super_admin_uid',
        createdAt: NOW,
        updatedAt: NOW,
      },
    },
    staff_members: {
      uid_updates_mod: {
        userId: 'uid_updates_mod',
        inviteKey: 'inv_mod_updates_edu',
        displayName: 'Updates Moderator',
        adminEmail: 'mod@updates.edu',
        adminPhone: '+91 98201 11223',
        role: 'sub_admin',
        canPostUpdates: true,
        canGrantBonuses: false,
        canBanUsers: false,
        active: true,
        createdAt: NOW,
        updatedAt: NOW,
      },
    },
    admin_digests: {},
  };
}

function validCandidatePayload(uid: string) {
  return {
    ownerUid: uid,
    displayName: 'Kabir Mehta',
    contactEmail: 'kabir@gmail.com',
    phoneNumber: '+91 98765 43210',
    notifyGmailOptIn: true,
    notifyWhatsappOptIn: true,
    boardOrUniversity: 'IIT / University',
    examName: 'Finals',
    examDate: '2026-12-01',
    readinessPercent: 50,
    overallRatingOutOf10: 0,
    completedChapters: 2,
    totalChapters: 10,
    attemptsCount: 0,
    focusMinutesLogged: 25,
    bonusPoints: 0,
    xpPoints: 180,
    flexTier: 'common',
    banned: false,
    banReason: '',
    adsEnabled: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

test('Dirty Dozen #01: Shadow field injection on Candidate create returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'create',
    docId: 'cand_kabir',
    auth: { uid: 'cand_kabir', email: 'kabir@uni.edu', email_verified: true },
    db,
    incomingData: { ...validCandidatePayload('cand_kabir'), isAdmin: true },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #02: Self-assigned bonusPoints on Candidate create returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'create',
    docId: 'cand_kabir',
    auth: { uid: 'cand_kabir', email: 'kabir@uni.edu', email_verified: true },
    db,
    incomingData: { ...validCandidatePayload('cand_kabir'), bonusPoints: 9999 },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #03: Candidate attempting to modify own bonusPoints on update returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: 'cand_alice',
    auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
    db,
    incomingData: { ...db.candidates.cand_alice, bonusPoints: 5000, updatedAt: NOW },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #04: Unverified Super Admin email spoofing returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'staff_invites',
    operation: 'create',
    docId: 'inv_evil',
    auth: {
      uid: 'spoof_uid',
      email: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
      email_verified: false,
    },
    db,
    incomingData: { inviteKey: 'inv_evil' },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #05: Cross-user PII read on users_private returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'users_private',
    operation: 'get',
    docId: 'cand_alice',
    auth: { uid: 'cand_bob', email: 'bob@university.edu', email_verified: true },
    db,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #06: Unauthorized blanket list scraping on individual_bonuses returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'individual_bonuses',
    operation: 'list',
    auth: { uid: 'cand_bob', email: 'bob@university.edu', email_verified: true },
    db,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #07: Updates-only Sub-Admin attempting to ban a candidate returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: 'cand_alice',
    auth: { uid: 'uid_updates_mod', email: 'mod@updates.edu', email_verified: true },
    db,
    incomingData: {
      ...db.candidates.cand_alice,
      banned: true,
      banReason: 'Unauthorized ban attempt',
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #08: Sub-Admin escalating own permissions beyond StaffInvite returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'staff_members',
    operation: 'create',
    docId: 'uid_new_mod',
    auth: { uid: 'uid_new_mod', email: 'mod@updates.edu', email_verified: true },
    db,
    incomingData: {
      userId: 'uid_new_mod',
      inviteKey: 'inv_mod_updates_edu',
      displayName: 'Escalated Mod',
      role: 'sub_admin',
      canPostUpdates: true,
      canGrantBonuses: true, // Not granted on invite!
      canBanUsers: true, // Not granted on invite!
      active: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #09: Banned candidate attempting to mutate workspace returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'workspaces',
    operation: 'update',
    docId: 'cand_banned',
    auth: { uid: 'cand_banned', email: 'banned@dtu.ac.in', email_verified: true },
    db,
    incomingData: { ownerUid: 'cand_banned', onboarded: true, updatedAt: NOW },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #10: Orphaned bonus creation for non-existent targetUserId returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'individual_bonuses',
    operation: 'create',
    docId: 'bon_orphan',
    auth: {
      uid: 'super_admin_uid',
      email: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
      email_verified: true,
    },
    db,
    incomingData: {
      targetUserId: 'non_existent_candidate_999',
      targetName: 'Ghost',
      grantedByUid: 'super_admin_uid',
      grantedByName: 'Admin',
      bonusTitle: 'Ghost Bonus',
      bonusType: 'xp_boost',
      pointsAwarded: 100,
      message: 'Test',
      acknowledged: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #11: Path ID poisoning and 5KB displayName exhaustion return PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  assert.equal(isValidFirestoreId('../etc/passwd'), false);
  const res = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'create',
    docId: 'cand_kabir',
    auth: { uid: 'cand_kabir', email: 'kabir@uni.edu', email_verified: true },
    db,
    incomingData: {
      ...validCandidatePayload('cand_kabir'),
      displayName: 'X'.repeat(5000),
    },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Dirty Dozen #12: Reversing terminal acknowledged state on bonus returns PERMISSION_DENIED', () => {
  const db = createBaseSimulatedDb();
  const res = evaluateFirestoreRuleOperation({
    collection: 'individual_bonuses',
    operation: 'update',
    docId: 'bon_1',
    auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
    db,
    incomingData: {
      ...db.individual_bonuses.bon_1,
      acknowledged: false,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(res, 'PERMISSION_DENIED');
});

test('Positive RBAC & Invite Sync: Verified Super Admin, Sub-Admin Updates, and Revocation work accurately', () => {
  const db = createBaseSimulatedDb();
  assert.equal(emailToInviteKey('Priya.Admin@School.org'), 'inv_priya_admin_school_org');

  // Updates Sub-Admin CAN post global update
  const postAllowed = evaluateFirestoreRuleOperation({
    collection: 'global_updates',
    operation: 'create',
    docId: 'upd_101',
    auth: { uid: 'uid_updates_mod', email: 'mod@updates.edu', email_verified: true },
    db,
    incomingData: {
      authorUid: 'uid_updates_mod',
      authorName: 'Updates Moderator',
      authorRoleLabel: 'Updates Admin',
      title: 'PYQ Mock Window Extended',
      body: 'Physics & Calculus PYQ window updated.',
      category: 'exam_alert',
      visibility: 'public',
      pinned: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(postAllowed, 'ALLOW');

  // Once Super Admin revokes parent StaffInvite, Sub-Admin loses global_updates write synchronously!
  db.staff_invites.inv_mod_updates_edu.status = 'revoked';
  const postAfterRevoke = evaluateFirestoreRuleOperation({
    collection: 'global_updates',
    operation: 'create',
    docId: 'upd_102',
    auth: { uid: 'uid_updates_mod', email: 'mod@updates.edu', email_verified: true },
    db,
    incomingData: {
      authorUid: 'uid_updates_mod',
      authorName: 'Updates Moderator',
      authorRoleLabel: 'Updates Admin',
      title: 'Blocked Update',
      body: 'Should fail synchronously.',
      category: 'exam_alert',
      visibility: 'public',
      pinned: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(postAfterRevoke, 'PERMISSION_DENIED');
});

test('Admin Outreach, Candidate Profile Access & Mandatory Admin Gmail/Phone Governance', () => {
  const db = createBaseSimulatedDb();
  assert.equal(BOOTSTRAPPED_SUPER_ADMIN_EMAIL, 'rohitshree1973@gmail.com');

  // 1. Candidate CAN create clean ad-free profile with contact opt-ins & XP fields
  const cleanCandidateCreate = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'create',
    docId: 'cand_kabir',
    auth: { uid: 'cand_kabir', email: 'kabir@gmail.com', email_verified: true },
    db,
    incomingData: validCandidatePayload('cand_kabir'),
    requestTimeISO: NOW,
  });
  assert.equal(cleanCandidateCreate, 'ALLOW');

  // 2. Candidate CANNOT mutate protected adsEnabled flag on own account via update
  const selfAdFlagMutate = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: 'cand_alice',
    auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
    db,
    incomingData: { ...db.candidates.cand_alice, adsEnabled: false, updatedAt: NOW },
    requestTimeISO: NOW,
  });
  assert.equal(selfAdFlagMutate, 'PERMISSION_DENIED');

  // 3. Provision a Delegated Sub-Admin with mandatory Gmail + Phone
  db.staff_invites.inv_max_mod_gmail_com = {
    inviteKey: 'inv_max_mod_gmail_com',
    targetEmail: 'max.mod@gmail.com',
    displayName: 'Maximum Sub-Admin',
    adminPhone: '+91 98334 55678',
    canPostUpdates: true,
    canGrantBonuses: true,
    canBanUsers: true,
    status: 'active',
    createdByUid: 'super_admin_uid',
    createdAt: NOW,
    updatedAt: NOW,
  };
  db.staff_members.uid_max_mod = {
    userId: 'uid_max_mod',
    inviteKey: 'inv_max_mod_gmail_com',
    displayName: 'Maximum Sub-Admin',
    adminEmail: 'max.mod@gmail.com',
    adminPhone: '+91 98334 55678',
    role: 'sub_admin',
    canPostUpdates: true,
    canGrantBonuses: true,
    canBanUsers: true,
    active: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  // Sub-Admin CAN inspect individual candidate academic profile & private Gmail doc for 1-click outreach
  const subAdminCandidateGet = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'get',
    docId: 'cand_alice',
    auth: { uid: 'uid_max_mod', email: 'max.mod@gmail.com', email_verified: true },
    db,
  });
  assert.equal(subAdminCandidateGet, 'ALLOW');

  const subAdminPrivateGet = evaluateFirestoreRuleOperation({
    collection: 'users_private',
    operation: 'get',
    docId: 'cand_alice',
    auth: { uid: 'uid_max_mod', email: 'max.mod@gmail.com', email_verified: true },
    db,
  });
  assert.equal(subAdminPrivateGet, 'ALLOW');

  // Sub-Admin still CANNOT bulk-list users_private or mutate adsEnabled
  const subAdminPrivateBulkList = evaluateFirestoreRuleOperation({
    collection: 'users_private',
    operation: 'list',
    auth: { uid: 'uid_max_mod', email: 'max.mod@gmail.com', email_verified: true },
    db,
  });
  assert.equal(subAdminPrivateBulkList, 'PERMISSION_DENIED');

  const subAdminAdFlagAttempt = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: 'cand_alice',
    auth: { uid: 'uid_max_mod', email: 'max.mod@gmail.com', email_verified: true },
    db,
    incomingData: { ...db.candidates.cand_alice, adsEnabled: false, updatedAt: NOW },
    requestTimeISO: NOW,
  });
  assert.equal(subAdminAdFlagAttempt, 'PERMISSION_DENIED');

  // 4. Super Admin CANNOT create StaffInvite without mandatory phone number or without @gmail.com
  const missingPhoneInvite = evaluateFirestoreRuleOperation({
    collection: 'staff_invites',
    operation: 'create',
    docId: 'inv_nophone_gmail_com',
    auth: {
      uid: 'super_admin_uid',
      email: 'rohitshree1973@gmail.com',
      email_verified: true,
    },
    db,
    incomingData: {
      inviteKey: 'inv_nophone_gmail_com',
      targetEmail: 'nophone@gmail.com',
      displayName: 'No Phone Admin',
      adminPhone: '',
      canPostUpdates: true,
      canGrantBonuses: false,
      canBanUsers: false,
      status: 'active',
      createdByUid: 'super_admin_uid',
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(missingPhoneInvite, 'PERMISSION_DENIED');

  const nonGmailInvite = evaluateFirestoreRuleOperation({
    collection: 'staff_invites',
    operation: 'create',
    docId: 'inv_faculty_school_org',
    auth: {
      uid: 'super_admin_uid',
      email: 'rohitshree1973@gmail.com',
      email_verified: true,
    },
    db,
    incomingData: {
      inviteKey: 'inv_faculty_school_org',
      targetEmail: 'faculty@school.org',
      displayName: 'Non Gmail Admin',
      adminPhone: '+91 98111 22334',
      canPostUpdates: true,
      canGrantBonuses: false,
      canBanUsers: false,
      status: 'active',
      createdByUid: 'super_admin_uid',
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(nonGmailInvite, 'PERMISSION_DENIED');

  const validStaffInvite = evaluateFirestoreRuleOperation({
    collection: 'staff_invites',
    operation: 'create',
    docId: 'inv_mentor_gmail_com',
    auth: {
      uid: 'super_admin_uid',
      email: 'rohitshree1973@gmail.com',
      email_verified: true,
    },
    db,
    incomingData: {
      inviteKey: 'inv_mentor_gmail_com',
      targetEmail: 'mentor@gmail.com',
      displayName: 'Mentor Admin',
      adminPhone: '+91 98111 22334',
      canPostUpdates: true,
      canGrantBonuses: true,
      canBanUsers: false,
      status: 'active',
      createdByUid: 'super_admin_uid',
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(validStaffInvite, 'ALLOW');
});

test('Gmail Admin Sync: Invited Gmail user syncs Minimal -> Maximum permission upgrades accurately on login', () => {
  const db = createBaseSimulatedDb();
  // Super Admin upgrades mod@updates.edu from Minimal (Updates-only) to Maximum (Updates + Bonuses + Bans)
  db.staff_invites.inv_mod_updates_edu.canGrantBonuses = true;
  db.staff_invites.inv_mod_updates_edu.canBanUsers = true;

  // Spoof attempt (mismatching invite flags) is rejected
  const mismatchSync = evaluateFirestoreRuleOperation({
    collection: 'staff_members',
    operation: 'update',
    docId: 'uid_updates_mod',
    auth: { uid: 'uid_updates_mod', email: 'mod@updates.edu', email_verified: true },
    db,
    incomingData: {
      ...db.staff_members.uid_updates_mod,
      canGrantBonuses: false,
      canBanUsers: true,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(mismatchSync, 'PERMISSION_DENIED');

  // Exact sync with active parent StaffInvite succeeds
  const validSync = evaluateFirestoreRuleOperation({
    collection: 'staff_members',
    operation: 'update',
    docId: 'uid_updates_mod',
    auth: { uid: 'uid_updates_mod', email: 'mod@updates.edu', email_verified: true },
    db,
    incomingData: {
      ...db.staff_members.uid_updates_mod,
      canPostUpdates: true,
      canGrantBonuses: true,
      canBanUsers: true,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(validSync, 'ALLOW');
});

test('Role Tier & PII Filter Helpers: All authorized Admins receive outreach + candidate contact visibility while non-staff strip PII', () => {
  const superProfile = resolveSandboxStaffAccess('super_admin');
  assert.equal(superProfile.tier, 'super_admin');
  assert.equal(superProfile.canManageAdmins, true);
  assert.equal(superProfile.canSendOutreach, true);
  assert.equal(superProfile.adminEmail, 'rohitshree1973@gmail.com');
  assert.ok(superProfile.adminPhone && superProfile.adminPhone.length >= 7);

  const minProfile = resolveSandboxStaffAccess('sub_admin_minimal');
  assert.equal(minProfile.tier, 'sub_admin');
  assert.equal(minProfile.canPostUpdates, true);
  assert.equal(minProfile.canGrantBonuses, false);
  assert.equal(minProfile.canBanUsers, false);
  assert.equal(minProfile.canManageAdmins, false);
  assert.equal(minProfile.canSendOutreach, true);
  assert.ok(minProfile.adminEmail?.endsWith('@gmail.com'));
  assert.ok(minProfile.adminPhone && minProfile.adminPhone.length >= 7);

  const maxProfile = resolveSandboxStaffAccess('sub_admin_maximum');
  assert.equal(maxProfile.tier, 'sub_admin');
  assert.equal(maxProfile.canPostUpdates, true);
  assert.equal(maxProfile.canGrantBonuses, true);
  assert.equal(maxProfile.canBanUsers, true);
  assert.equal(maxProfile.canManageAdmins, false);
  assert.equal(maxProfile.canSendOutreach, true);
  assert.ok(maxProfile.adminEmail?.endsWith('@gmail.com'));
  assert.ok(maxProfile.adminPhone && maxProfile.adminPhone.length >= 7);

  const candidateProfile = resolveSandboxStaffAccess('none');
  assert.equal(candidateProfile.tier, 'none');
  assert.equal(candidateProfile.canSendOutreach, false);

  assert.equal(
    computeDelegatedRoleLabel({ canPostUpdates: true, canGrantBonuses: false, canBanUsers: false }),
    'Minimal Delegated Admin'
  );
  assert.equal(
    computeDelegatedRoleLabel({ canPostUpdates: true, canGrantBonuses: true, canBanUsers: true }),
    'Maximum Delegated Admin'
  );

  const db = createBaseSimulatedDb();
  const rosterWithPii = [
    {
      ...db.candidates.cand_alice,
      email: 'alice@gmail.com',
      contactEmail: 'alice@gmail.com',
      phoneNumber: '+91 99887 76655',
      authProvider: 'google.com' as const,
    },
  ];

  const authorizedStaffView = filterCandidatePiiForStaff(rosterWithPii, true);
  assert.equal(authorizedStaffView[0].email, 'alice@gmail.com');
  assert.equal(authorizedStaffView[0].contactEmail, 'alice@gmail.com');
  assert.equal(authorizedStaffView[0].phoneNumber, '+91 99887 76655');
  assert.equal(authorizedStaffView[0].authProvider, 'google.com');

  const nonStaffView = filterCandidatePiiForStaff(rosterWithPii, false);
  assert.equal(nonStaffView[0].email, undefined);
  assert.equal(nonStaffView[0].contactEmail, undefined);
  assert.equal(nonStaffView[0].phoneNumber, undefined);
  assert.equal(nonStaffView[0].authProvider, undefined);
});

test('Regression: Returning Google candidate (jcVr6p3Om9bFYuaTZnI9FQ1uA2C3) cleanly syncs pre-existing legacy candidate summary without permission error', () => {
  const db = createBaseSimulatedDb();
  const returningUid = 'jcVr6p3Om9bFYuaTZnI9FQ1uA2C3';
  const returningEmail = 'shreeentertainment1998@gmail.com';

  // Simulate pre-existing legacy candidate record from an earlier build (with legacy keys, float numbers, and adsEnabled: true)
  db.candidates[returningUid] = {
    ownerUid: returningUid,
    displayName: 'Shree Scholar',
    email: returningEmail,
    authProvider: 'google.com',
    boardOrUniversity: 'Delhi University',
    examName: 'Semester Finals',
    examDate: '2026-12-10',
    readinessPercent: 64.5,
    overallRatingOutOf10: 7.5,
    completedChapters: 4,
    totalChapters: 12,
    attemptsCount: 2,
    focusMinutesLogged: 50,
    bonusPoints: 150,
    banned: false,
    banReason: '',
    adsEnabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  };

  // Schema-clean full replacement preserving ownerUid, createdAt, bonusPoints, banned, banReason, and adsEnabled succeeds
  const cleanMigrationUpdate = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: returningUid,
    auth: { uid: returningUid, email: returningEmail, email_verified: true },
    db,
    incomingData: {
      ownerUid: returningUid,
      displayName: 'Shree Scholar',
      contactEmail: returningEmail,
      phoneNumber: '+91 98765 11223',
      notifyGmailOptIn: true,
      notifyWhatsappOptIn: true,
      institutionType: 'university',
      boardOrUniversity: 'Delhi University',
      examName: 'Semester Finals',
      examDate: '2026-12-10',
      dailyStudyHours: 4.5,
      readinessPercent: 72.4,
      overallRatingOutOf10: 8.1,
      completedChapters: 6,
      totalChapters: 12,
      attemptsCount: 3,
      focusMinutesLogged: 95,
      bonusPoints: 150,
      xpPoints: 620,
      flexTier: 'Rare Sapphire',
      lastActiveDate: '2026-10-27',
      inactiveDays: 0,
      activeLearnerActive: true,
      unlockedBadges: ['Active Learner', 'First Diagnostic'],
      weakTopics: ['Electrodynamics'],
      banned: false,
      banReason: '',
      adsEnabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(cleanMigrationUpdate, 'ALLOW');

  // Keeping legacy 'email' shadow key inside incomingData is still strictly rejected by schema blueprint
  const leftoverShadowUpdate = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: returningUid,
    auth: { uid: returningUid, email: returningEmail, email_verified: true },
    db,
    incomingData: {
      ...validCandidatePayload(returningUid),
      email: returningEmail,
      bonusPoints: 150,
      adsEnabled: true,
    },
    requestTimeISO: NOW,
  });
  assert.equal(leftoverShadowUpdate, 'PERMISSION_DENIED');
});

test('Custom Profile Image (avatarUrl): Candidate can save compact avatarUrl and oversized payload is rejected', () => {
  const db = createBaseSimulatedDb();
  const compactAvatar = 'data:image/jpeg;base64,' + 'A'.repeat(2400);

  const validAvatarUpdate = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: 'cand_alice',
    auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
    db,
    incomingData: {
      ...db.candidates.cand_alice,
      avatarUrl: compactAvatar,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(validAvatarUpdate, 'ALLOW');

  const oversizedAvatarUpdate = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: 'cand_alice',
    auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
    db,
    incomingData: {
      ...db.candidates.cand_alice,
      avatarUrl: 'data:image/jpeg;base64,' + 'A'.repeat(35000),
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(oversizedAvatarUpdate, 'PERMISSION_DENIED');
});

test('Regression: stripUndefinedDeep preserves Firestore Timestamp & FieldValue sentinels for syncCandidateWorkspaceToCloud (qB4QaSSkqbXewu6fH1xDcpFcuLG3)', () => {
  const superAdminUid = 'qB4QaSSkqbXewu6fH1xDcpFcuLG3';
  const seedState = createDemoSeedState();
  const baseSummary = buildSanitizedCandidateSummary({
    ownerUid: superAdminUid,
    fallbackName: 'Rohit Shree',
    state: seedState,
    existingBonusPoints: 0,
    existingBanned: false,
    existingBanReason: '',
    existingAdsEnabled: false,
  });

  const tsNow = Timestamp.now();
  const serverTs = serverTimestamp();

  const cleaned = stripUndefinedDeep({
    ...baseSummary,
    optionalUndefinedField: undefined,
    nestedMap: { keep: 'ok', drop: undefined },
    nestedList: ['a', undefined, 'b'],
    createdAt: tsNow,
    updatedAt: serverTs,
  });

  // Critical regression assertions: Timestamp and FieldValue prototypes MUST remain intact
  assert.equal(cleaned.createdAt instanceof Timestamp, true);
  assert.equal(cleaned.updatedAt instanceof FieldValue, true);
  assert.equal('optionalUndefinedField' in cleaned, false);
  assert.deepEqual(cleaned.nestedMap, { keep: 'ok' });
  assert.deepEqual(cleaned.nestedList, ['a', 'b']);

  // Verify rule evaluation for qB4QaSSkqbXewu6fH1xDcpFcuLG3 (including healing legacy empty createdAt)
  const db = createBaseSimulatedDb();
  db.candidates[superAdminUid] = {
    ...validCandidatePayload(superAdminUid),
    flexTier: 'Common Slate',
    createdAt: '', // Simulate corrupted/legacy createdAt healed to request.time
  };

  const syncDecision = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: superAdminUid,
    auth: {
      uid: superAdminUid,
      email: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
      email_verified: true,
    },
    db,
    incomingData: {
      ...stripUndefinedDeep(baseSummary),
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(syncDecision, 'ALLOW');
});

test('Admin XP Deduction: Staff with canGrantBonuses can increment deductedPoints while candidate cannot lower it', () => {
  const db = createBaseSimulatedDb();
  db.candidates.cand_alice.deductedPoints = 100;

  const selfClear = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: 'cand_alice',
    auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
    db,
    incomingData: {
      ...db.candidates.cand_alice,
      deductedPoints: 0,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(selfClear, 'PERMISSION_DENIED');

  const superAdminDeduct = evaluateFirestoreRuleOperation({
    collection: 'candidates',
    operation: 'update',
    docId: 'cand_alice',
    auth: {
      uid: 'super_admin_uid',
      email: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
      email_verified: true,
    },
    db,
    incomingData: {
      ...db.candidates.cand_alice,
      deductedPoints: 300,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(superAdminDeduct, 'ALLOW');
});

test('Issued Credentials & Non-Admin Verifier Notifications: O(1) serial get, list denial, and PII isolation', () => {
  const db = createBaseSimulatedDb();
  const serial = 'SLQ-FC-AARAV101';

  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'issued_credentials',
      operation: 'list',
      auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
      db,
    }),
    'PERMISSION_DENIED'
  );

  const bannedRegister = evaluateFirestoreRuleOperation({
    collection: 'issued_credentials',
    operation: 'create',
    docId: 'SLQ-FC-BAN99999',
    auth: { uid: 'cand_banned', email: 'suspended@dtu.edu', email_verified: true },
    db,
    incomingData: {
      credentialCode: 'SLQ-FC-BAN99999',
      credentialType: 'flexcard',
      ownerUid: 'cand_banned',
      candidateName: 'Suspended User',
      boardOrUniversity: 'DTU',
      examName: 'Sem Finals',
      title: 'Accountability & Reset Mode',
      metricSummary: 'Terms violation',
      xpPoints: 120,
      flexTier: 'Common Slate',
      issuedDate: '2026-10-26',
      createdAt: NOW,
      updatedAt: NOW,
    },
    requestTimeISO: NOW,
  });
  assert.equal(bannedRegister, 'ALLOW');

  db.issued_credentials = {
    [serial]: {
      credentialCode: serial,
      credentialType: 'flexcard',
      ownerUid: 'cand_alice',
      candidateName: 'Alice Sharma',
      boardOrUniversity: 'CBSE Class 12',
      examName: 'Board Finals',
      title: '8+/10 Exam Distinction',
      metricSummary: '8.9/10 PYQ Rating',
      xpPoints: 1120,
      flexTier: 'Epic Amethyst',
      issuedDate: '2026-10-26',
      createdAt: NOW,
      updatedAt: NOW,
    },
  };

  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'issued_credentials',
      operation: 'get',
      docId: serial,
      auth: null,
      db,
    }),
    'ALLOW'
  );

  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'credential_verifications',
      operation: 'create',
      docId: 'ver_orphan',
      auth: { uid: 'verifier_1', email: 'teacher@gmail.com', email_verified: true },
      db,
      incomingData: {
        verificationId: 'ver_orphan',
        credentialCode: 'SLQ-FC-FAKE0000',
        credentialType: 'flexcard',
        targetUserId: 'cand_alice',
        credentialTitle: 'Fake Card',
        verifierUid: 'verifier_1',
        verifierName: 'Dr. Neha Verma',
        verifierGmail: 'teacher@gmail.com',
        verifierPost: 'teacher',
        verifiedAtDate: '2026-10-26',
        acknowledged: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
      requestTimeISO: NOW,
    }),
    'PERMISSION_DENIED'
  );

  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'credential_verifications',
      operation: 'create',
      docId: 'ver_valid_1',
      auth: { uid: 'verifier_1', email: 'teacher@gmail.com', email_verified: true },
      db,
      incomingData: {
        verificationId: 'ver_valid_1',
        credentialCode: serial,
        credentialType: 'flexcard',
        targetUserId: 'cand_alice',
        credentialTitle: '8+/10 Exam Distinction',
        verifierUid: 'verifier_1',
        verifierName: 'Dr. Neha Verma',
        verifierGmail: 'teacher@gmail.com',
        verifierPost: 'teacher',
        verifiedAtDate: '2026-10-26',
        acknowledged: false,
        createdAt: NOW,
        updatedAt: NOW,
      },
      requestTimeISO: NOW,
    }),
    'ALLOW'
  );

  db.credential_verifications = {
    ver_valid_1: {
      verificationId: 'ver_valid_1',
      credentialCode: serial,
      credentialType: 'flexcard',
      targetUserId: 'cand_alice',
      credentialTitle: '8+/10 Exam Distinction',
      verifierUid: 'verifier_1',
      verifierName: 'Dr. Neha Verma',
      verifierGmail: 'teacher@gmail.com',
      verifierPost: 'teacher',
      verifiedAtDate: '2026-10-26',
      acknowledged: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  };
  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'credential_verifications',
      operation: 'get',
      docId: 'ver_valid_1',
      auth: { uid: 'cand_bob', email: 'bob@uni.edu', email_verified: true },
      db,
    }),
    'PERMISSION_DENIED'
  );
  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'credential_verifications',
      operation: 'get',
      docId: 'ver_valid_1',
      auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
      db,
    }),
    'ALLOW'
  );
});

test('Workspace & Candidate Summary Sync: preserves avatarVisibility and recoveredEthicsXp accurately', () => {
  const baseState = createDemoSeedState();
  const stateWithRecovery = {
    ...baseState,
    student: {
      ...baseState.student,
      avatarVisibility: 'connections_only' as const,
      recoveredEthicsXp: 32,
      recoveredDeductionIds: ['bon-deduct-1'],
    },
  };

  const wsPayload = buildSanitizedWorkspacePayload('cand_alice', stateWithRecovery);
  assert.equal(wsPayload.student.avatarVisibility, 'connections_only');
  assert.equal(wsPayload.student.recoveredEthicsXp, 32);
  assert.deepEqual(wsPayload.student.recoveredDeductionIds, ['bon-deduct-1']);
  assert.ok(Object.keys(wsPayload.student).length <= 30);

  const summaryWithoutRecovery = buildSanitizedCandidateSummary({
    ownerUid: 'cand_alice',
    fallbackName: 'Alice',
    state: baseState,
    existingBonusPoints: 150,
    existingDeductedPoints: 80,
  });
  const summaryWithRecovery = buildSanitizedCandidateSummary({
    ownerUid: 'cand_alice',
    fallbackName: 'Alice',
    state: stateWithRecovery,
    existingBonusPoints: 150,
    existingDeductedPoints: 80,
  });

  assert.equal((summaryWithRecovery.xpPoints ?? 0) - (summaryWithoutRecovery.xpPoints ?? 0), 32);
});

test('Workspaces: permits optional aiStrategyBriefing while rejecting injected keys or wrong owner', () => {
  const db = createBaseSimulatedDb();
  const baseState = createDemoSeedState();
  const stateWithBriefing = {
    ...baseState,
    aiStrategyBriefing: {
      headline: 'Focus high-yield Physics & Calculus in peak morning block',
      alertnessStrategy: 'Morning sharp block reserved for derivations and PYQs.',
      pyqFocusAdvice: 'Complete Electrostatics + Integration sets first.',
      classSyncTip: 'Align evening review with ongoing lecture topics.',
      actionableSteps: ['Finish 20 PYQs', 'Log error notebook'],
      generatedAt: '2026-10-26T05:00:00.000Z',
      usedAi: true,
    },
  };

  const payload = {
    ...buildSanitizedWorkspacePayload('cand_alice', stateWithBriefing),
    createdAt: NOW,
    updatedAt: NOW,
  };

  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'workspaces',
      operation: 'create',
      docId: 'cand_alice',
      auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
      db,
      incomingData: payload,
      requestTimeISO: NOW,
    }),
    'ALLOW'
  );

  // Injecting unapproved key must be denied
  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'workspaces',
      operation: 'create',
      docId: 'cand_alice',
      auth: { uid: 'cand_alice', email: 'alice@university.edu', email_verified: true },
      db,
      incomingData: { ...payload, hackedFlag: true },
      requestTimeISO: NOW,
    }),
    'PERMISSION_DENIED'
  );

  // Attempting to overwrite another candidate's workspace must be denied
  assert.equal(
    evaluateFirestoreRuleOperation({
      collection: 'workspaces',
      operation: 'create',
      docId: 'cand_alice',
      auth: { uid: 'cand_bob', email: 'bob@university.edu', email_verified: true },
      db,
      incomingData: { ...payload, ownerUid: 'cand_bob' },
      requestTimeISO: NOW,
    }),
    'PERMISSION_DENIED'
  );
});
