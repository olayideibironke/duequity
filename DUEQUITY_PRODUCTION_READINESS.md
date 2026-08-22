# DueQuity Production Readiness

Application bake closeout report.

Date: 2026-08-20
Scope: application layer only. No infrastructure was provisioned, configured or deployed.

---

## 1. What changed

### 1.1 Authentication and authorisation — fail closed

`src/lib/session.ts` was rewritten. It previously imported `DEMO_STAFF` from
`src/demo/cases.ts` and returned a hard-coded compliance-officer fixture on every
call, and `getClaimantSession(requested?)` accepted a claimant identity that
originated in a URL parameter.

The new module:

- exports only `tryGetStaffSession()` and `tryGetClaimantSession()`, both of which
  return `null` rather than a fabricated identity. `getStaffSession` and
  `getClaimantSession` no longer exist, so no call site can accidentally assume a
  session;
- issues a session only through a **local development adapter** gated twice:
  `process.env.NODE_ENV === "development"` **and**
  `DUEQUITY_LOCAL_DEV_SESSION === "enabled"`. `next build` and `next start` both
  set `NODE_ENV=production`, so a deployed build cannot activate it under any
  environment configuration;
- builds the local identity from environment variables only, with a reserved
  `.invalid` email domain and the title "Local development session adapter", so it
  cannot be mistaken for a real staff record;
- never reads an actor identity from a request body, query string, header or
  cookie.

The role/permission matrix was preserved verbatim, including the compliance
officer deliberately holding no `opportunity.write`.

### 1.2 Every server surface now gates

- **17 API route handlers** across 15 route files return HTTP 401 with
  `STAFF_AUTHENTICATION_REQUIRED_MESSAGE` before doing any work.
- **All 20 `/pro` pages plus `/pro/layout.tsx`** resolve the session themselves and
  return `StaffAuthenticationRequired`. The layout gate alone was insufficient:
  in the App Router the layout and page render in parallel, so an unguarded page
  still executed its store reads before its output was discarded.
- **All 7 `/portal` pages** return `ClaimantAuthenticationRequired`.
- `/api/geography/resolve`, `/api/jurisdiction-intelligence/sources` and
  `/api/jurisdiction-intelligence/evidence` were entirely unauthenticated. Each
  was an open outbound-request proxy to Census and government hosts, and the
  latter two disclosed Duequity's jurisdiction research targets. All three now
  require a session plus `jurisdiction.read` (or `jurisdiction.write` for the
  evidence harvest POST).

New component: `src/components/ui/authentication-required.tsx`. An unauthenticated
operations page and a page with zero records previously rendered identically; they
no longer do.

### 1.3 Global operations search moved server side

`src/components/pro/pro-search.tsx` ran `operationsSearch()` **in the browser**
against the in-bundle demo dataset. Every operator's browser therefore received
every opportunity, claim, claimant, property and jurisdiction record — including
internal jurisdiction notes and claimant contact details — regardless of that
operator's permissions.

Replaced with `src/app/api/pro/search/route.ts`, which resolves each query per
request against the persisted stores and filters by the authenticated operator's
permissions **and** state clearance before returning anything. Claimant contact
details require `claimant.read_sensitive`. The client component now holds no
operational data, debounces, and aborts in-flight requests.

### 1.4 Navigation counts derived from persisted records

`src/app/pro/layout.tsx` badge counts came from `taskLoad()`, `documentLoad()`,
`compliancePosture()`, `opportunitiesFiltered()` and `claimsFiltered()` in
`src/domain/operations.ts` — all reading demo fixtures.

New module `src/server/operations-workload.ts` is the single derivation of
outstanding work, read by both the layout badges and `/pro/tasks`, so the two
cannot disagree. Every item is derived live from a persisted fact (missing approved
rule, blocked intake gate, pending legal determination, unresolved classification
conflict, outstanding or overdue document requirement) and disappears when that
fact is resolved. `/pro/tasks` was refactored to consume it rather than duplicate
the derivation.

### 1.5 Public site de-demoed

- New `src/server/public-jurisdictions.ts` projects coverage from persisted
  jurisdiction rule packages. A jurisdiction is published as "open" only when the
  package is `approved`, a normalized rule is attached, `evaluateIntakeGate` does
  not block, **and** `evaluateJurisdictionPaymentRouting` reports ready. Internal
  review notes and the reviewing officer's identity are deliberately not
  projected.
- `/`, `/states`, `/states/[state]`, `/states/[state]/[county]` and `/fees` now
  read that projection. All render honest empty states — currently zero activated
  jurisdictions.
- The homepage "Verification preview" card presented a fabricated record
  (4218 Cheverly Court, case CAEF-25-14882, "Confirmed by agency"). Replaced with a
  field-by-field description of what a verified record shows.
- `/fees` presented a worked example described as "a completed claim in
  Hillsborough County, Florida". Replaced with explicitly labelled arithmetic on
  hypothetical figures, plus a callout stating no recovery has been completed.
- `generateStaticParams` was removed from the state and county routes: a static
  list would keep advertising a jurisdiction after its package was paused or
  superseded.
- `src/lib/slug.ts` now holds one canonical slug rule (`slugify`, `countySlug`),
  and `src/server/public-search.ts` was repointed at it, so a URL produced by
  search always resolves on the coverage pages.

### 1.6 Controls that pretended to work were removed

Each of these validated input, then displayed a success message without
transmitting or persisting anything:

| Surface | Resolution |
|---|---|
| Portal document upload | Replaced with an honest "not available yet" notice. A claimant told "Received" after photographing a driver license stops chasing it, and the claim stalls on a requirement they believe is met. A claimant upload endpoint cannot be built before claimant authentication exists. |
| Public contact form | Removed. `/contact` now publishes contact channels directly. |
| Public 4-step claim intake | Replaced with `src/components/public/claim-next-steps.tsx`, which keeps the jurisdiction-derived information (required documents, probate implications, disclosures, the free direct-claim path) and collects nothing. The wizard previously asked for a bereavement, relationship, heirs, name, email and phone, then discarded all of it. |
| `ClaimActions` ("Submit to the agency") | Deleted — unimported, and it implied an external submission that does not exist. |
| `MessageComposer`, `legal-status` | Deleted — unimported. |

### 1.7 Verification codes fail closed

`/verify` published working example codes resolved from a hard-coded
`DEMO_VERIFICATION_CODES` map. New `src/server/outreach-verification.ts` fails
closed: no outreach attempt store exists, so no code can resolve. The page states
plainly that Duequity has sent no outreach and that any message claiming otherwise
is impersonation. No example codes are published — a page that hands out codes
which resolve teaches visitors that a resolving code proves nothing.

### 1.8 Claimant onboarding UI aligned to the hardened API

- The client type omitted `jurisdiction` and `operationalGate`, which the API had
  been returning. The gate (jurisdiction cleared / Startup Green Lane / administrative
  legal lane / live filing deadline) is now rendered per-control, and every mutation
  control is disabled while it is closed. The server gate remains authoritative.
- Jurisdiction provenance (state, rule-package version, legal-rule version) is now
  displayed.
- The executed-agreement field was free text labelled "Optional in local
  validation", while the API required an **accepted `fee_agreement` document
  already on the claim**. It is now a select populated by the server from exactly
  the documents `assertAgreementMayBeSigned` will accept, and the submit is
  disabled without one. The onboarding GET was extended with
  `feeAgreementDocuments`.

### 1.9 React data-loading correctness

Three operations panels called a `setState`-containing loader directly from
`useEffect`, and none aborted on unmount — a panel unmounted mid-request wrote
state to an unmounted component. Each now separates a `setState`-free fetch (safe
to call from an effect body) from state application in the promise callback, with
`AbortController` cleanup. `address-autocomplete` now derives search eligibility
during render instead of clearing state in the effect on every keystroke.

### 1.10 Dead code removed after proving no imports

Deleted: `src/demo/` (6 files), `src/domain/operations.ts`,
`src/domain/portal.ts`, `src/domain/search.ts`, `src/components/pro/claim-actions.tsx`,
`src/components/portal/message-composer.tsx`,
`src/components/portal/legal-status.tsx`, `src/components/public/contact-form.tsx`,
`src/components/public/claim-intake.tsx`, `DemoTag` from `badge.tsx`,
`src/app/globals.before-universal-fit.css`, `dev-server.log`,
`dev-server-err.log`.

Content that was misfiled as demo data, not deleted:
- `RECOVERY_STAGES` → `src/domain/recovery-stages.ts` (a configured domain vocabulary)
- `RESOURCE_ARTICLES` → `src/content/resources.ts` (Duequity's own editorial copy)

### 1.11 Packaging

`server-only` moved from `devDependencies` to `dependencies`. It is imported by 12
runtime server modules; a production install with `--omit=dev` would have failed.

---

## 2. Files changed

**Rewritten**
```
src/lib/session.ts
src/lib/slug.ts
src/app/pro/layout.tsx
src/app/pro/tasks/page.tsx                        (header + derivation)
src/components/pro/pro-search.tsx
src/components/portal/document-upload.tsx
src/app/(public)/page.tsx
src/app/(public)/states/page.tsx
src/app/(public)/states/[state]/page.tsx
src/app/(public)/states/[state]/[county]/page.tsx
src/app/(public)/fees/page.tsx
src/app/(public)/verify/page.tsx
src/app/(public)/contact/page.tsx
```

**Added**
```
src/lib/../components/ui/authentication-required.tsx
src/components/public/claim-next-steps.tsx
src/server/operations-workload.ts
src/server/public-jurisdictions.ts
src/server/outreach-verification.ts
src/app/api/pro/search/route.ts
src/domain/recovery-stages.ts
src/content/resources.ts
DUEQUITY_PRODUCTION_READINESS.md
```

**Modified**
```
src/app/api/geography/resolve/route.ts
src/app/api/jurisdiction-intelligence/evidence/route.ts
src/app/api/jurisdiction-intelligence/sources/route.ts
src/app/api/jurisdiction-intelligence/reviews/route.ts
src/app/api/jurisdiction-intelligence/reviews/[id]/route.ts
src/app/api/jurisdiction-intelligence/reviews/[id]/approve/route.ts
src/app/api/pro/claims/[id]/documents/route.ts
src/app/api/pro/claims/[id]/filing-package/route.ts
src/app/api/pro/claims/[id]/onboarding/route.ts
src/app/api/pro/commercial-pricing/[opportunityId]/route.ts
src/app/api/pro/discovered-records/harvest/route.ts
src/app/api/pro/discovered-records/[id]/review/route.ts
src/app/api/pro/discovered-records/[id]/enrichment/route.ts
src/app/api/pro/opportunities/[opportunityId]/convert/route.ts
src/app/pro/{attorneys,claimants,claims,compliance,discovered-records,fee-policies,
             jurisdictions,manager,opportunities,properties,recoveries,tasks,audit,
             documents}/page.tsx
src/app/pro/{claimants,claims,opportunities,discovered-records,jurisdictions}/[id]/page.tsx
src/app/pro/page.tsx
src/app/portal/{page,claims,claims/[claimId],documents,messages,profile,security}/page.tsx
src/app/(public)/{about,disclosures,security,how-it-works,resources,resources/[slug],
                  verify/[token]}/page.tsx
src/components/pro/claimant-onboarding-panel.tsx
src/components/pro/claim-documents-panel.tsx
src/components/pro/claim-filing-package-panel.tsx
src/components/pro/convert-opportunity.tsx
src/components/public/address-autocomplete.tsx
src/components/ui/badge.tsx
src/domain/types.ts                               (doc comments only)
src/server/claimant-onboarding-store.ts           (doc comment only)
src/server/geography-resolver.ts                  (exported loadNationalGeography)
src/server/public-search.ts                       (canonical slug import)
src/app/pro/fee-policies/page.tsx
package.json
.env.local
```

**Whole-repo formatting**: `npm run format` was run as the last step (the project's
own declared formatter). It touched most files under `src/`. That reformat is
mechanical and AST-preserving; `tsc`, `lint` and `build` were all re-verified green
afterwards. Review the formatting commit separately from the functional changes.

---

## 3. Demo dependencies removed

Final targeted search over `src/` and `scripts/` — all counts zero:

| Pattern | Count |
|---|---|
| `@/demo` | 0 |
| `src/demo` (directory) | does not exist |
| `DEMO_` | 0 |
| `DemoTag` | 0 |
| `isDemoSession` | 0 |
| `DEMO_PORTAL_IDENTITIES` | 0 |
| `DEMO_TODAY` | 0 |
| `demonstration build` | 0 |
| `demonstration portal` | 0 |
| `demonstration codes` | 0 |
| `demo data` | 0 |
| `illustrative operational` | 0 |
| `operationsSearch` | 0 |
| `lookupVerificationCode` | 0 |
| `getStaffSession(` (non-`try`) | 0 |
| `getClaimantSession(` (non-`try`) | 0 |
| "No authentication in this build" | 0 |

Rendered-HTML check across 11 public pages: zero occurrences of "demo data",
"demonstration build", "Demonstration codes", "Demonstration data".

### Local validation data (gitignored, dev environment only)

Backed up to `.duequity-data/.backup-prebake/` first, then:

- **Removed** the operational chain built entirely on demo identifiers —
  conversion of `opp-9` / `jur-md-pg` / `demo-quote-opp-9`, the invented claimant
  "Elaine M. Harwood", 5 claim documents, 1 filing package, 5 uploaded files, and
  commercial approvals for demo opportunities `opp-1`, `opp-8`, `opp-9`. This chain
  was already inert — `opportunities.json` does not exist, so `resolveClaimRecord`
  failed closed and the claim never materialised.
- **Removed** both Prince George's County (GEOID 24033) review drafts. Their
  findings contained literal `"Test"` values for mandatory contract language and
  payment routing, they carried no `paymentRouting` block, and one sat at
  `ready_for_approval`. A Maryland jurisdiction one step from approval on test data
  is precisely what must not exist.
- **Reset** Carroll County (GEOID 24013) payment routing to the locked
  classification, removed `payment_routing` from `reviewedFindings`, and removed the
  telephone-verification source that was its sole support.

**Preserved:** all 23 real Carroll County discovered public records, the Brian
Owens enrichment record, harvested jurisdiction evidence packets, and the Census
geography / government-domain sync caches.

Brian Owens record verified intact: `2715 OLD TANEYTOWN RD`, Westminster MD,
property ID `02-009056`, case `C-06-CV-23-000194`, sale date `2024-02-12`,
source-listed surplus `$28,810.88`, current owner `DRAYER KYLE`, status `reviewed`.

---

## 4. Remaining local persistence stores

All 12 are JSON-file or filesystem backed under `.duequity-data/` and are **local
validation only**. The directory is gitignored and does not exist in a fresh
deployment, which is why production operational state is zero.

| Module | File | Contents |
|---|---|---|
| `src/server/opportunity-store.ts` | `opportunities.json` | Opportunity + Property records |
| `src/server/opportunity-conversion-store.ts` | `opportunity-conversions.json` | Conversions + audit |
| `src/server/claimant-onboarding-store.ts` | `claimant-onboarding.json` | Claimant, participant, disclosures, agreement + audit |
| `src/server/claim-document-store.ts` | `claim-documents.json` + `documents/**` | Requests, document metadata, audit, **uploaded file bytes** |
| `src/server/claim-filing-package-store.ts` | `claim-filing-packages.json` | Frozen packages + audit |
| `src/server/commercial-approval-store.ts` | `commercial-fee-approvals.json` | Quotes, snapshots, approvals, audit |
| `src/server/commercial-fee-policy-store.ts` | (JSON) | Commercial fee policies |
| `src/server/discovered-record-store.ts` | `discovered-records.json` | 23 real Carroll records |
| `src/server/discovered-record-enrichment-store.ts` | `discovered-record-enrichment.json` | Enrichment (Brian Owens) |
| `src/server/jurisdiction-review-store.ts` | `jurisdiction-reviews.json` | Review drafts |
| `src/server/jurisdiction-intelligence.ts` | (JSON) | Approved rule packages |
| `src/server/jurisdiction-evidence-harvester.ts` | `jurisdiction-evidence/*.json` | Evidence packets + content hashes |

Read-only generated data that stays in the repo (not migration targets):
`src/data/generated/us-geography.json` (51 states, 3,144 county equivalents) and
`src/data/generated/us-government-domains.json`.

---

## 5. Supabase migration manifest

Repository boundaries are already clean: every store exposes narrow async
functions, so each becomes a Supabase-backed implementation without touching the
workflows.

### Tables

| Table | From | Key notes |
|---|---|---|
| `opportunities` | opportunity-store | unique `reference`; FK `property_id`, `jurisdiction_id` |
| `properties` | opportunity-store | |
| `opportunity_conversions` | opportunity-conversion-store | unique `claim_id`, unique `opportunity_id` |
| `opportunity_conversion_audit` | " | append-only |
| `claimant_onboarding` | claimant-onboarding-store | unique `claim_id`; embeds contact methods, disclosure acks, agreement |
| `claimant_onboarding_audit` | " | append-only |
| `claim_document_requests` | claim-document-store | unique (`claim_id`,`kind`) where `required` |
| `claim_documents` | " | `storage_key` → Supabase Storage object |
| `claim_document_audit` | " | append-only |
| `claim_filing_packages` | claim-filing-package-store | unique (`claim_id`,`version`); `package_hash` |
| `claim_filing_package_audit` | " | append-only |
| `commercial_fee_quotes` | commercial-approval-store | `snapshot_hash`, `locked_fee_agreement_id` |
| `commercial_fee_quote_audit` | " | append-only |
| `commercial_fee_policies` | commercial-fee-policy-store | `version` monotonic per jurisdiction |
| `discovered_records` | discovered-record-store | unique (`adapter_key`,`record_key`) — **migrate all 23** |
| `discovered_record_enrichment` | discovered-record-enrichment-store | unique `discovered_record_id` — **migrate Brian Owens** |
| `jurisdiction_rule_packages` | jurisdiction-intelligence | unique (`state_fips`,`county_geoid`,`sale_type`,`version`) |
| `jurisdiction_review_drafts` | jurisdiction-review-store | **Carroll must migrate as `unknown`/`blocked`** |
| `jurisdiction_evidence_packets` | jurisdiction-evidence-harvester | `packet_hash`, per-source `content_hash` |
| `outreach_attempts` | **does not exist** | required before `/verify` can resolve any code |
| `staff_users` | **does not exist** | replaces the local development session adapter |
| `audit_events` | **does not exist** | unified immutable log; per-store audit tables feed it |

### Migration invariants

1. **Money stays integer cents.** `bigint`, never `numeric`/`float`.
2. **Dates stay calendar dates.** `date` for `IsoDate` (filing deadlines are legal
   calendar dates and must not shift by timezone); `timestamptz` for `IsoInstant`.
3. **Audit tables are append-only.** No UPDATE or DELETE grant to any role.
4. **Every hash migrates byte-identical.** `commercialSnapshotHash`,
   `packageHash`, `evidencePacketHash`, per-source `contentHash`. A re-computed hash
   is not a migrated hash, and `verifyCommercialQuoteSnapshot` /
   `verifyClaimFilingPackageSnapshot` must still pass afterwards.
5. **Version snapshots migrate as literals**, never recomputed from current state:
   `legalRuleVersionSnapshot`, `legalFeeCapPercentSnapshot`,
   `legalFeeCapAmountSnapshot`, `commercialPolicyVersion`, jurisdiction
   `packageVersion`. Rewriting one rewrites the historical legal basis of a signed
   agreement.
6. **Write serialisation.** Each store currently serialises mutations through an
   in-process promise queue. Replace with row-level locking or optimistic
   concurrency — the in-process queue does not survive multiple instances.
7. **Row Level Security on every table.** Claimant-readable rows must be scoped by
   `claimant_id`; the portal already scopes by session claimant, and RLS must
   enforce it independently rather than trusting the query.
8. **Migrate the empty state as empty.** Do not seed. Opportunities 0, claims 0,
   recoveries 0, client documents 0, approved jurisdictions 0.

---

## 6. Auth migration requirements

1. Supabase Auth for staff, with MFA enforced (`StaffUser.mfaEnrolled` exists and
   is currently `false` for the local adapter).
2. Supabase Auth for claimants, as a **separate** audience. A claimant must never
   receive a staff session.
3. Replace the bodies of `tryGetStaffSession()` and `tryGetClaimantSession()` in
   `src/lib/session.ts`. **Nothing else changes** — every call site already handles
   `null`.
4. Delete the local development adapter and its four `DUEQUITY_LOCAL_DEV_*`
   variables once real auth lands.
5. Persist `staff_users` with `role` and `statesCleared`. `ROLE_PERMISSIONS` stays
   in code (it is policy, not data); the role assignment becomes data.
6. `session.login`, `session.login_failed`, `session.logout`,
   `session.mfa_enrolled` audit actions already exist in `AuditAction` and must be
   written.
7. Preserve the compliance officer's lack of `opportunity.write`.
8. **Independent pre-filing review depends on real identity.** The filing-package
   store requires reviewer ≠ preparer by user ID. With one local adapter identity
   this control cannot be exercised; it becomes real only with real accounts.

---

## 7. Document storage migration requirements

Currently `src/server/claim-document-store.ts` writes bytes to
`.duequity-data/documents/<claimId>/<uuid>.<ext>` on the local filesystem.

Required before any claimant document is accepted:

1. Private Supabase Storage bucket, no public read.
2. Access exclusively through short-lived signed URLs issued **after** a
   server-side authorisation check. `document.read_restricted` already gates
   restricted-sensitivity documents in the API and must gate URL issuance.
3. Malware scanning before a document becomes reviewable. The upload route already
   validates magic bytes against the declared MIME type, size ≤ 15 MB, and the
   allowlist (PDF/JPEG/PNG/WebP) — that is not a substitute for scanning.
4. Encryption at rest.
5. Retention and deletion policy, including hard delete on request.
6. `document.viewed` / `document.downloaded` audit writes on URL issuance.
7. **Claimant upload endpoint does not exist.** Blocked on claimant auth — an
   unauthenticated endpoint accepting identity documents is not acceptable. The
   portal currently states this rather than faking it.
8. Migrate existing `storageKey` values, or rewrite them transactionally with the
   object move.

---

## 8. Email and communications integration points

No message transport is configured. Nothing in the application sends anything today.

| Integration point | Trigger | Current state |
|---|---|---|
| Public contact | visitor enquiry | no form; `/contact` publishes addresses |
| Claimant secure message | portal message | `/portal/messages` states messaging is not activated |
| Document request notice | request created/overdue | not implemented |
| Identity verification prompt | `documents_requested` | not implemented |
| Service agreement delivery | agreement ready | not implemented |
| Agency correspondence log | inbound letter/call | `Communication` type exists; no store |
| **Outreach to located owners** | outreach approved | **not implemented; blocks `/verify`** |
| Recovery / payment notice | recovery recorded | not implemented |
| Security alert | suspicious contact report | `security@duequity.com` published |

Notes for the Resend pass:

- Outreach is the one that gates a shipped feature. `/verify` cannot resolve any
  code until `outreach_attempts` persists issued `verificationCode` values.
  `src/server/outreach-verification.ts` has the seam prepared:
  `resolveIssuedOutreachToken()` is the only function to implement.
- Outreach must not begin before both the compliance gate and the commercial
  pricing gate pass, and must record `consentBasis` and
  `doNotContactScreenedAt`. Those fields already exist on `OutreachAttempt`.
- Do-not-contact screening against national and state registries is a prerequisite
  for any phone or SMS channel.

---

## 9. Environment variables required later

**Already in use**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_GEOAPIFY_API_KEY` | address autocomplete on `/check` |

**Local development only — must be absent in production**

| Variable | Purpose |
|---|---|
| `DUEQUITY_LOCAL_DEV_SESSION` | must equal `enabled`; also requires `NODE_ENV=development` |
| `DUEQUITY_LOCAL_DEV_STAFF_ROLE` | role for the local identity (default `super_admin`) |
| `DUEQUITY_LOCAL_DEV_STAFF_ID` | local identity ID |
| `DUEQUITY_LOCAL_DEV_STAFF_NAME` | display name |
| `DUEQUITY_LOCAL_DEV_STAFF_STATES` | optional comma-separated clearance; empty = national |
| `DUEQUITY_LOCAL_DEV_CLAIMANT_ID` | local portal claimant identity |

**Required for production (not yet consumed by any code)**

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser client, RLS-scoped |
| `SUPABASE_SERVICE_ROLE_KEY` | server only; must never reach the browser bundle |
| `SUPABASE_DB_URL` | migrations |
| `SUPABASE_STORAGE_BUCKET` | private claim-document bucket |
| `RESEND_API_KEY` | transactional email |
| `RESEND_FROM_ADDRESS` | verified sender |
| `IDENTITY_PROVIDER_API_KEY` | identity verification provider |
| `IDENTITY_PROVIDER_WEBHOOK_SECRET` | webhook signature verification |
| `MALWARE_SCAN_API_KEY` | document scanning |
| `SENTRY_DSN` (or equivalent) | error reporting |
| `NEXT_PUBLIC_SITE_URL` | canonical URL for links in email |

---

## 10. Security blockers

| # | Blocker | Severity |
|---|---|---|
| 1 | **No authentication provider.** Production fails closed — verified: every API route returns 401, every `/pro` and `/portal` page renders the authentication notice. Nothing is reachable, which is correct, and also means nothing is usable. | Blocking |
| 2 | **No MFA.** Staff hold `document.read_restricted` and `claimant.read_sensitive`. MFA is required before those exist against real records. | Blocking |
| 3 | **Local filesystem document storage.** No encryption at rest, no malware scanning, no signed-URL brokering, no retention controls. | Blocking |
| 4 | **JSON-file persistence.** No RLS, no transactions, no row locking, no backups, no point-in-time recovery. The in-process mutation queue does not survive multiple instances. | Blocking |
| 5 | **No rate limiting.** `/check`, `/verify`, `/api/geography/resolve` and `/api/pro/search` are all abusable. The geocoder proxy is now authenticated but still unthrottled. | Blocking |
| 6 | **No Content-Security-Policy.** `next.config.ts` sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-DNS-Prefetch-Control` and `no-store` on `/portal` and `/pro`. CSP and HSTS are edge-layer work. | Blocking |
| 7 | **No unified audit log.** Per-store audit tables exist and are written; `AuditAction` is fully enumerated; there is no single immutable `audit_events` sink and no tamper-evidence. | Blocking |
| 8 | **No identity verification provider.** `set_identity` is a staff-recorded value. A staff member can currently mark identity `verified` with a free-text reference. | Blocking |
| 9 | **Geoapify key is client-exposed.** `NEXT_PUBLIC_*` by necessity for autocomplete. Needs HTTP-referrer restriction and a usage cap, or proxying server-side. | Non-blocking |
| 10 | **No secret rotation or per-environment separation.** | Non-blocking |
| 11 | Turbopack build warning: "Dynamic filesystem access causes tracing of the whole project" — caused by the local JSON stores; resolves with Supabase. | Informational |

---

## 11. Legal and jurisdiction blockers

| # | Blocker |
|---|---|
| 1 | **Zero approved jurisdictions.** No jurisdiction has an approved rule package, so intake is closed everywhere. `/states` says so plainly. |
| 2 | **Maryland is not approved.** No Maryland rule package exists. `/states/md` returns 404 — correct. |
| 3 | **Carroll County payment routing is UNKNOWN.** Locked classification verified in the store: `paymentRoute: unknown`, `paymentLaunchTrack: blocked`, `representativeMayFile: unknown`, `representativeMayReceivePayment: unknown`, `assignmentRequiredForRepresentativePayment: unknown`, `feeCollectionMethod: unknown`, `complianceStatus: under_legal_review`, draft status `draft`. Unknown routing fails closed via `evaluateJurisdictionPaymentRouting`. |
| 4 | **Carroll outstanding review items:** payment routing, fee legality and limits, finder/recovery-company licensing, bond requirements, contract language requirements, cancellation requirements, final administrative-processing clearance. |
| 5 | **Maryland owner-location licensing.** Md. Business Occupations and Professions § 13-101 may treat compensated location of a person as private detective services. Compensated skip-tracing in Maryland must be confirmed exempt or performed through a licensed provider. |
| 6 | **No qualified-counsel review has occurred** on any jurisdiction rule, on the fee model, or on the public disclosures. |
| 7 | **No commercial fee policy is approved.** `/pro/fee-policies` correctly shows none and states no fallback is used. |
| 8 | **Acquisition Recovery remains disabled.** `assignee` payment route and assignment-dependent structures are blocked by `evaluateJurisdictionPaymentRouting`. Unchanged by this bake. |
| 9 | **No external filing endpoint exists.** `pre_filing_approved` means an independent authorised human approved a frozen internal snapshot. The filing-package API returns `submission: { submitted: false }` with an explicit message. No court, clerk, county, tax collector, trustee or custodian is contacted. |
| 10 | **No attorney network is engaged.** `attorney_only` jurisdictions cannot be served. |

---

## 12. Tests performed

| # | Test | Method |
|---|---|---|
| 1 | TypeScript compilation | `npx tsc --noEmit` |
| 2 | Lint | `npx eslint` (flat config, `next/core-web-vitals` + `next/typescript`) |
| 3 | Formatting | `npx prettier --check "src/**/*.{ts,tsx,css}"` |
| 4 | Production build | `npm run build` (Next.js 16.3.1, Turbopack) |
| 5 | Route inventory | build route manifest reviewed |
| 6 | API fail-closed | `next start` (NODE_ENV=production), 10 API endpoints curled |
| 7 | Page fail-closed | 15 `/pro` + 6 `/portal` pages curled, gate string asserted |
| 8 | Public pages render | 11 public pages curled |
| 9 | Rendered-HTML demo scrub | grep for demo strings in served HTML |
| 10 | Source demo scrub | 17 patterns over `src/` and `scripts/` |
| 11 | Session-accessor scrub | non-`try` accessors must be 0 |
| 12 | Guard coverage | every API route / `/pro` page / `/portal` page asserted guarded |
| 13 | Carroll classification | store re-read and asserted |
| 14 | Real-data preservation | discovered-record count and Brian Owens record asserted |

---

## 13. Exact test results

```
1.  npx tsc --noEmit                                  EXIT 0    no diagnostics
2.  npx eslint                                        EXIT 0    0 errors, 0 warnings
                                                                (baseline was 7 errors, 4 warnings)
3.  npx prettier --check "src/**/*.{ts,tsx,css}"      EXIT 0    "All matched files use Prettier code style!"
                                                                (baseline: 91 files failing; `npm run format` run)
4.  npm run build                                     EXIT 0    "Compiled successfully"
                                                                1 warning: dynamic filesystem access tracing
5.  Route inventory                                             68 routes: 15 API + 4 SSG + static + dynamic
                                                                /api/pro/search present

6.  API fail-closed (NODE_ENV=production, next start)
      /api/pro/search?q=owens                                   401
      /api/geography/resolve?address=1+Main+St                   401
      /api/jurisdiction-intelligence/sources?stateFips=24        401
      /api/jurisdiction-intelligence/evidence?stateFips=24       401
      /api/jurisdiction-intelligence/reviews                     401
      /api/pro/claims/x/onboarding                               401
      /api/pro/claims/x/documents                                401
      /api/pro/claims/x/filing-package                           401
      /api/pro/commercial-pricing/x                              401
      /api/pro/discovered-records/x/enrichment                   401
      body on all: {"ok":false,"error":"Staff authentication is required.
                    No authentication provider is configured for this deployment."}

7.  Page fail-closed  (gate=1 means the authentication notice rendered)
      /pro /pro/claims /pro/tasks /pro/opportunities /pro/recoveries
      /pro/manager /pro/fee-policies /pro/compliance /pro/attorneys
      /pro/properties /pro/claimants /pro/jurisdictions
      /pro/discovered-records /pro/audit /pro/documents      → 200, gate=1  (15/15)
      /portal /portal/claims /portal/documents /portal/messages
      /portal/profile /portal/security                       → 200, gate=1  (6/6)

8.  Public pages
      / /states /fees /verify /contact /check /resources
      /about /security /disclosures /how-it-works            → 200  (11/11)
      /states/md                                             → 404  (correct: no MD package)
      /states/md/carroll                                     → 404  (correct)

9.  Rendered-HTML demo scrub  ("demo data" | "demonstration build"
      | "Demonstration codes" | "Demonstration data")        → 0 across 11 pages

10. Source demo scrub                                        all 17 patterns → 0
                                                             src/demo/ → does not exist

11. Session-accessor scrub
      getStaffSession(    non-try                            → 0
      getClaimantSession( non-try                            → 0

12. Guard coverage
      API routes without a 401 guard                         → 0 of 15
      /pro pages without tryGetStaffSession                   → 0 of 20
      /portal pages without tryGetClaimantSession             → 0 of 7

13. Carroll County (GEOID 24013) review draft
      paymentRoute                                  unknown
      paymentLaunchTrack                            blocked
      representativeMayFile                         unknown
      representativeMayReceivePayment               unknown
      assignmentRequiredForRepresentativePayment    unknown
      feeCollectionMethod                           unknown
      status                                        draft

14. Real-data preservation
      discovered records                            23
      Brian Owens record present                    true
      2715 OLD TANEYTOWN RD / 02-009056 /
      C-06-CV-23-000194 / 2024-02-12 /
      $28,810.88 / DRAYER KYLE / reviewed           verified intact
      enrichment records                            1
```

### Not tested

Authenticated end-to-end execution of claimant onboarding, the `fee_agreement`
internal-document lane, and the filing-package prepare → submit → independent
review cycle was **not run** in this pass. Contract alignment was verified by
reading the API, store and UI together, and by type-checking, but the workflows
were not exercised against live requests. Two reasons:

1. The local operational chain those workflows ran against was demo-derived
   (`opp-9` / `jur-md-pg` / `demo-quote-opp-9`) and was removed. Rebuilding a
   fixture to exercise them would mean re-creating exactly the kind of fabricated
   operational record this bake removed.
2. Independent pre-filing review requires reviewer ≠ preparer by user ID, which a
   single local adapter identity cannot satisfy.

These should be exercised after real auth exists, against a genuinely reviewed and
approved jurisdiction. Treat them as verified-by-inspection, not verified-by-execution.

---

## 14. Still preventing production deployment

1. No authentication provider — staff or claimant.
2. No MFA.
3. JSON-file persistence: no RLS, transactions, backups or recovery.
4. Local filesystem document storage: no encryption, scanning, signed URLs or retention.
5. No claimant document upload path at all.
6. No unified immutable audit log.
7. No identity verification provider.
8. No message transport, so no outreach, no notifications, and `/verify` cannot
   resolve any code.
9. No rate limiting.
10. No CSP or HSTS.
11. Zero approved jurisdictions — the platform cannot lawfully accept a claimant
    anywhere, including Maryland.
12. No qualified-counsel review of any jurisdiction rule, the fee model, or the
    public disclosures.
13. No approved commercial fee policy.
14. Workflow paths verified by inspection, not by authenticated execution (§13).

---

## Verdict

```
APPLICATION BAKE:                 PASS
DEMO SCRUB:                       PASS
READY FOR SUPABASE MIGRATION:     YES
READY FOR PRODUCTION DEPLOYMENT:  NO
```

**APPLICATION BAKE: PASS** — all four quality gates green from a baseline of 7 lint
errors and 91 unformatted files. UI/API/store contracts aligned for claimant
onboarding, the `fee_agreement` internal document lane and the filing package.
Returned packages still require a fresh prepared version. No external submission is
performed or implied anywhere. Provenance chains (jurisdiction package version,
legal-rule version, payment route, launch track, quote ID, snapshot hash, policy
version, fee-cap snapshots, package hash) are intact and still fail closed when
stale.

**DEMO SCRUB: PASS** — zero demo dependencies in production source, zero demo
strings in served HTML, `src/demo/` deleted, demo-backed session replaced with a
double-gated local development adapter that cannot authenticate a production build.
The demo-derived local operational chain and the Prince George's "Test" drafts were
removed; the 23 real Carroll records and the Brian Owens enrichment were preserved.

**READY FOR SUPABASE MIGRATION: YES** — repository boundaries are clean, all 12
local stores are enumerated with their tables, and the migration invariants
(integer cents, calendar dates, append-only audit, byte-identical hashes, literal
version snapshots, no seeding) are specified.

**READY FOR PRODUCTION DEPLOYMENT: NO** — and not because of code quality. Local
JSON persistence, local filesystem document storage, the absence of any
authentication provider, and zero legally approved jurisdictions each independently
block deployment. The application correctly refuses to operate in that state rather
than degrading quietly, which is the intended behaviour, but it does mean a
deployment today would serve a public site and nothing else.
