# Product Requirements — Exam Simulator (PracticeHub)

> **Status:** Living document — Phase 0 approved. Update per phase.  
> **Version:** 0.1.0 — 2026-08-23  
> **Name:** Tentatively “Exam Simulator” — final branding TBD.

---

## 1. Vision

Build a **generic, configuration-driven Exam Engine** that lets students convert any previous-year examination paper (PDF / scanned images / manual entry) into a **realistic computer-based test (CBT) simulation** — not hard-coded for SSC or IBPS, but extensible to GATE, UPSC, NTA, RRB, university and institutional exams.

Core loop:

```
Upload -> Extract -> Human Review -> Publish -> Simulate -> Submit -> Results
```

---

## 2. User Personas

### 2.1 Aspirant — Registered (Primary)

- Who: SSC CGL / IBPS PO / GATE repeater, 20-30y.
- Goals: Real CBT feel, timer pressure, section-wise analytics, history.
- Pain: Mock sites exam-specific, PYQs are PDFs with no simulation.
- Needs: Start/resume, palette states, negative marking, section analytics, bookmarks.

### 2.2 Casual Guest

- Who: Unregistered visitor.
- Goals: Try one public exam instantly.
- Constraints: No persistence, result shown once, CTA to sign up.
- Permissions: Browse library, attempt public exams ephemeral.

### 2.3 Uploader / Teacher

- Who: Coaching institute, senior aspirant who digitized PYQs.
- Goals: Upload PDF, correct extraction, publish private or public.
- Needs: Upload, job status, side-by-side Review Studio, validation warnings.

### 2.4 Moderator / Admin

- Who: Trust & safety.
- Goals: Review reports, moderate exams, takedowns, failed jobs.

Roles matrix:

| Action                |   Guest   | Student | Uploader | Moderator | Admin |
| --------------------- | :-------: | :-----: | :------: | :-------: | :---: |
| Browse public library |    YES    |   YES   |   YES    |    YES    |  YES  |
| Attempt public exam   | ephemeral |  saved  |   YES    |    YES    |  YES  |
| Upload paper          |     -     |   YES   |   YES    |    YES    |  YES  |
| Review & Publish own  |     -     |   YES   |   YES    |    YES    |  YES  |
| Moderate / takedown   |     -     |    -    |    -     |    YES    |  YES  |
| Manage users          |     -     |    -    |    -     |     -     |  YES  |

---

## 3. Core User Journeys

### Journey A — Guest attempt

Landing -> Library -> Exam detail -> Start (ephemeral) -> Instructions -> Simulator -> Submit confirm -> Result (not saved) -> Sign up CTA

### Journey B — Registered attempt with recovery

Sign up -> Browse -> Start -> Answer 20/100 -> Refresh -> Recovery (localStorage + server snapshot) -> Continue -> Auto-submit on expiry -> Result saved -> Dashboard trend

### Journey C — Upload Publish

Upload PDF -> Validation (magic bytes, 50MB) -> UPLOADED -> Background job -> REVIEW_REQUIRED -> Review Studio (PDF | extracted) -> Fixes warnings -> READY -> Publish (PRIVATE->PUBLIC request) -> Moderator approves

### Journey D — Moderation

Report Wrong answer Q42 -> Queue -> Moderator diff -> Fix + bump ExamVersion -> Existing attempts keep old snapshot

---

## 4. Functional Requirements

### 4.1 Authentication & Profiles

- Email/password + OAuth (Google) via Auth.js.
- Protected routes, RBAC server-side. Guest ephemeral attempts optional claim after signup.

### 4.2 Exam Engine (Configuration-driven)

- Exam = metadata + instructions + sections + questions. Never hard-code exam rules in UI.
- Config per ExamVersion: timing (total + per-section), marking (per-question/section, negative, bonus/cancelled), navigation (free|sequential|section-lock).
- MVP: SCQ single-choice; extensible: multi-select, numeric, passage, image-based, matching.
- Versioning: immutable ExamVersion on publish; attempts pin to version.

### 4.3 Simulator (CBT fidelity)

- Header: exam name + timer (server expiresAt authoritative) + 5min warning.
- Sections tabs, Question viewer, Options (radio), Palette with 5 states.
- Controls: Save & Next, Previous, Clear Response, Mark for Review & Next, Palette jump, Instructions, Submit + confirm.
- States: NOT_VISITED, NOT_ANSWERED, ANSWERED, MARKED, ANSWERED_MARKED — palette uses color + icon + pattern.
- Resilience: local persistence + sync every 15s + on change + visibilitychange, recovery, idempotent submit.

### 4.4 Scoring & Results

- Server-authoritative scoring. Per-question earned/lost, correct/incorrect, skipped, bonus, timeSpent.
- Aggregate: score/max, %, attempted, correct/incorrect/negative, time, section breakdown.
- Result: summary cards + question-wise review (your vs correct + explanation + time).

### 4.5 Library & Discovery

- Filters: organization, exam, year, stage, shift, subject, difficulty. Sorting, pagination.

### 4.6 Upload & Processing

- PDF validation (magic bytes %PDF, MIME sniff, 50MB, encrypted check), image sets later.
- Storage: private R2, presigned PUT.
- Job lifecycle: UPLOADED -> PROCESSING -> OCR_PROCESSING -> EXTRACTING -> REVIEW_REQUIRED -> READY -> PUBLISHED | FAILED.

### 4.7 Review Studio

- Split: Source PDF vs Extracted question. Edit text/options/answer/section/marks/reorder/delete/add/image/LaTeX/bonus. Warnings: missing options, duplicate numbers, no answer.

### 4.8 Dashboard & Analytics

- History, avg score/accuracy, strongest/weakest, trends, time analysis.

### 4.9 Reporting & Moderation

- Report types, queue, resolution, version bump, takedown, attribution.

### 4.10 Admin

- Users, uploads, extraction results, exams, questions, reports, failed jobs.

---

## 5. Non-Functional Requirements

- Performance: 500 Q navigate <100ms, no full reload, virtualized palette.
- Resilience: refresh/reconnect does not lose answers.
- Security: AuthZ everywhere, Zod at boundaries, no client-trusted score, R2 private, rate limit.
- A11y: WCAG 2.1 AA, keyboard, focus, semantics, palette not color-only.
- Responsive: CBT desktop-first, library/dashboard mobile friendly.
- Privacy: Minimal PII, no leaks.
- Math: KaTeX for LaTeX.
- Bilingual: Schema allows en+hi day 1, MVP renders en only.

---

## 6. MVP vs Post-MVP

### MVP (Phases 1-6 + 12-13)

- Next.js + Tailwind + shadcn + Prisma/Postgres + Auth.js.
- Manual exam creation via seed — no AI/OCR yet.
- Full simulator (SCQ, palette, timers, nav rules, auto-submit, persistence).
- Server scoring + results.
- Publishing workflow + validation.
- Library + basic dashboard.

### Post-MVP (Phases 7-11, 14-18)

- Upload pipeline + PDF text + OCR + AI extraction + Review Studio + advanced analytics + question bank + leaderboards etc.

Explicitly NOT in MVP: DOCX, scanned OCR, Hindi UI, matrices, passage grouping, multi-select/numeric, topic detection, custom mocks, PWA, adaptive.

---

## 7. Success Criteria MVP

1. 100-question SSC CGL mock realistic CBT with timer/palette/auto-submit.
2. Refresh mid-exam recovers answers+timer (E2E).
3. Server scoring matches manual calc incl negative.
4. Invalid exam cannot be published.
5. Private exams invisible to guests, filters work.

---

## 8. Glossary

Exam = definition. ExamVersion = immutable snapshot. Attempt = user response to a version. Palette = question grid. Bonus/Cancelled = excluded from scoring.
