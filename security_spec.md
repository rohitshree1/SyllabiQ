# SyllabiQ Zero-Trust Firestore Security Specification

## 1. Data Invariants & Master Source of Truth

1. **Default-Deny Catch-All**: All unmatched paths (`/{document=**}`) deny all reads and writes unconditionally.
2. **Verified Authentication Gate**: Every mutating operation across every collection strictly requires `request.auth != null && request.auth.token.email_verified == true`. Unverified email tokens (even if matching the Super Admin email string) are rejected.
3. **Authorized Staff Candidate Profile & PII Isolation**:
   - Candidate authentication PII (`/users_private/{userId}`) and candidate outreach/academic profiles (`/candidates/{userId}`) are strictly isolated to `isOwner(userId) || isSuperAdmin() || isSubAdmin()` on single-document `get`. Regular signed-in candidates receive `PERMISSION_DENIED` on cross-user reads (no blanket `isSignedIn()` reads).
   - `allow list` on `/users_private` is restricted strictly to `isSuperAdmin()`, and `allow list` on `/candidates` is restricted to `isSuperAdmin() || (isVerifiedUser() && existing().ownerUid == request.auth.uid)` with zero `get()`/`exists()` calls inside `allow list`.
   - Delegated Sub-Admins inspect full candidate academic + outreach profiles via O(1) single-document `get` on `/admin_digests/overview` and `/candidates/{userId}`.
4. **Bootstrapped Super Admin (`rohitshree1973@gmail.com`) & Mandatory Admin Contact Assignment**:
   - Primary Super Admin is strictly `request.auth.token.email == 'rohitshree1973@gmail.com' && request.auth.token.email_verified == true`.
   - Every `/staff_invites/{inviteKey}` created or updated by `isSuperAdmin()` MUST provide a verified `@gmail.com` `targetEmail` (`3..160` chars) AND a valid `adminPhone` (`7..32` chars) so every delegated admin has both a Super-Admin-assigned Gmail and phone number for candidate outreach.
   - Sub-Admins in `/staff_members/{userId}` (`active == true`) can ONLY be created/synced by `isSuperAdmin()` OR claimed/synced by an authenticated verified user whose email matches an active `/staff_invites/{inviteKey}` with identical boolean permission flags (`canPostUpdates`, `canGrantBonuses`, `canBanUsers`).
   - Users can NEVER self-assign admin roles, unban themselves, or modify their own `bonusPoints` or `adsEnabled`.
5. **Relational Master Gate on Workspaces & Bonuses**:
   - `/workspaces/{userId}` requires `/candidates/{userId}` to exist AND `get(.../candidates/$(userId)).data.banned == false` for candidate writes. Suspending a candidate in `/candidates/{userId}` synchronously revokes workspace write access.
   - `/individual_bonuses/{bonusId}` requires `/candidates/$(incoming().targetUserId)` to exist on creation, preventing orphaned bonus grants.
6. **Zero `get()`/`exists()` Inside `allow list`**:
   - Every `allow list` rule evaluates only `existing()` (`resource.data`) and token primitives (`request.auth.uid`, `isSuperAdmin()`), preventing O(n) read amplification attacks.
7. **Temporal & Identity Immutability**:
   - `createdAt == request.time` on `create`; `createdAt == existing().createdAt` and `updatedAt == request.time` on `update`.
   - Ownership/author keys (`ownerUid`, `authorUid`, `grantedByUid`, `targetUserId`, `inviteKey`, `targetEmail`, `credentialCode`, `verifierUid`) are immutable after creation.
8. **Admin XP Deduction Invariant**:
   - Candidate `deductedPoints` (`0..500000`) can never be lowered or self-edited by the candidate (`incoming().deductedPoints == existing().deductedPoints`).
   - Only `isSuperAdmin() || hasStaffPerm('canGrantBonuses')` can increment `deductedPoints` monotonically (up to `+5000` per action) alongside creating an `/individual_bonuses/{bonusId}` record (`bonusType == 'xp_deduction'`) with a mandatory non-empty `message` explaining the deduction reason.
9. **Issued Credentials & Non-Admin Verifier Notifications**:
   - `/issued_credentials/{credentialCode}` contains zero PII, disables `list` (`allow list: if false;`), allows O(1) `get` by `isValidSerialId(credentialCode)` for serial authenticity verification, and restricts `create`/`update` to the verified `ownerUid` or `isSuperAdmin()`.
   - `/credential_verifications/{verificationId}` isolates verifier PII (`verifierGmail`, `verifierName`, `verifierPost`) strictly to `targetUserId == request.auth.uid || isSuperAdmin()`, enforces `exists(/issued_credentials/$(credentialCode))` and `ownerUid == targetUserId` on `create`, and locks `acknowledged` terminally (`false -> true`).

---

## 2. The "Dirty Dozen" Adversarial Payloads (Must All Return `PERMISSION_DENIED`)

1. **Payload 01 — Shadow Field Injection on Candidate Create**: Valid `/candidates/{uid}` payload plus injected `{ "isAdmin": true }` ghost property -> Blocked by `data.keys().hasOnly(...)`.
2. **Payload 02 — Self-Assigned Bonus Points on Candidate Create**: Candidate creates `/candidates/{uid}` with `bonusPoints: 9999` or `banned: true` -> Blocked by create gate requiring `bonusPoints == 0 && banned == false`.
3. **Payload 03 — Privilege Escalation or Self-Service Ad/Bonus Tampering via Candidate Update**: Candidate updates `/candidates/{uid}` attempting to change `bonusPoints`, `banned`, or `adsEnabled` -> Blocked by `affectedKeys().hasOnly(...)` in `CandidateProgressSync` action AND `!existing().banned`.
4. **Payload 04 — Unverified Super Admin Email Spoofing**: Attacker authenticates with `email: "rohitshree1973@gmail.com"` and `email_verified: false` attempting to create `/staff_invites/evil` -> Blocked by `request.auth.token.email_verified == true`.
5. **Payload 05 — Cross-User Candidate PII Leak (`users_private`)**: Authenticated Candidate B attempts `get` on `/users_private/cand_alice` -> Blocked by `isOwner(userId) || isSuperAdmin() || isSubAdmin()`.
6. **Payload 06 — Unauthorized Blanket Query Scraping on Bonuses**: Authenticated Candidate B attempts unfiltered `list` on `/individual_bonuses` -> Blocked because `allow list` enforces `existing().targetUserId == request.auth.uid || isSuperAdmin()`.
7. **Payload 07 — Sub-Admin Permission Overreach**: Updates-only Sub-Admin attempts to ban a candidate (`banned: true`) or toggle `adsEnabled` -> Blocked by action-based `hasStaffPerm('canBanUsers')` / `isSuperAdmin()` gates.
8. **Payload 08 — Self-Promoted Sub-Admin Claim Beyond StaffInvite**: Verified User attempts to create or update `/staff_members/{uid}` with `canGrantBonuses: true` when parent `/staff_invites/{inviteKey}` has `canGrantBonuses: false` -> Blocked by relational `get()` equality checks against `/staff_invites`.
9. **Payload 09 — Banned Candidate Workspace Mutation**: Candidate whose `/candidates/{uid}` has `banned == true` attempts to update `/workspaces/{uid}` -> Blocked by Relational Master Gate `isCandidateNotBanned(userId)`.
10. **Payload 10 — Orphaned Individual Bonus Creation**: Authorized staff attempts to create `/individual_bonuses/bon_orphan` for non-existent `targetUserId` -> Blocked by `exists(/databases/$(database)/documents/candidates/$(incoming().targetUserId))`.
11. **Payload 11 — Resource Exhaustion / ID Poisoning**: Candidate sends a 5,000-character `displayName` or `../etc/passwd` document ID -> Blocked by `isValidId()` regex + strict `.size() <= 80` check inside `isValidCandidateSummary()`.
12. **Payload 12 — Terminal State Reversal & Missing Admin Phone/Gmail**: Candidate attempts to flip `acknowledged` from `true` back to `false` on `/individual_bonuses/{bonusId}` OR Super Admin attempts to create `/staff_invites` without a valid `adminPhone` (`>= 7` chars) or `@gmail.com` email -> Blocked by Terminal State Gate and `isValidStaffInvite()` contact validation.
