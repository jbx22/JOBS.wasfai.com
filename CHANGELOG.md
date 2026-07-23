# Changelog

## jobs1 — 2026-07-11 00:12

- Initial MENA job-search command center PWA prototype: Arabic-first RTL mobile UI, 5-tab bottom nav (البحث/الوظائف/الإعدادات/الحساب/النتيجة), multi-select + bulk-move, sources + فحص تلقائي with Rust background worker, JSON-LD/HTML live connectors (WUZZUF, Bayt, Khamsat, generic), approved-API guard for LinkedIn/Indeed, 52-test green cargo test --lib

## jobs2 — 2026-07-11 01:37

- Add voice-dna.md, DATA_CONTRACT.md, tools/check-contract.mjs (system/user boundary + voice guardrail)

## jobs3 — 2026-07-11 02:14

- Launch Cloudflare Pages production with Functions bootstrap API, deployment handoff, and jobs.wasfai.com custom-domain setup

## jobs4 — 2026-07-11 02:54

- Mobile-first responsive PWA polish with desktop layout fix, install icons, and upgraded offline cache

## jobs5 — 2026-07-11 02:56

- Finalize jobs.wasfai.com active custom-domain handoff after DNS verification

## jobs6 — 2026-07-11 03:32

- Add production ghost writer for bilingual resume, cover letter, and interview preparation kits

## jobs7 — 2026-07-11 05:14

- Set DeepSeek V4 Flash as default ghost writer AI provider

## jobs8 — 2026-07-11 05:15

- Ignore user-owned data paths and finalize DeepSeek ghost writer defaults

## jobs9 — 2026-07-13 04:05

- Add subscriber original resume editor, friendly how-it-works guidance, and deeper ghostwriter resume output

## jobs10 — 2026-07-13 04:42

- Add Cloudflare ingestion worker, AI Writer model selection, approved DOCX/PDF exports, and interactive interview prep

## jobs11 — 2026-07-13 05:42

- Route MiniMax GLM and Kimi AI Writer models through OpenRouter

## jobs12 — 2026-07-13 05:50

- Harden OpenRouter AI Writer JSON parsing

## jobs13 — 2026-07-13 06:17

- Add resume-first AI coach workflow and remove Kimi model

## jobs14 — 2026-07-13 07:44

- Implement resume-approved live job matching and clean crawler filters

## jobs15 — 2026-07-13 07:47

- Tighten live crawler category filters after match smoke

## jobs16 — 2026-07-13 09:29

- Add KV crawler cache and Google OAuth account foundation

## jobs17 — 2026-07-13 09:55

- Add assisted apply package CTA and follow-up tracker

## jobs18 — 2026-07-14 05:00

- Mobile command home, authenticated D1 workspace persistence, source workflow, export validation, production QA

## jobs19 — 2026-07-14 05:13

- Arabic-default landing, English switcher, and day-night theme toggle

## jobs20 — 2026-07-14 05:15

- Scope production QA to live qa folder after Arabic theme tests

## jobs21 — 2026-07-14 05:24

- Add uploaded JOBS logo and PWA install icon assets

## jobs22 — 2026-07-14 06:07

- pre-change rollback before resume-first journey and logo sizing fixes

## jobs23 — 2026-07-14 06:14

- resume-first mobile journey with bigger logo, PDF upload, hidden source preview, and relevance-only jobs

## jobs24 — 2026-07-14 06:45

- pre-fix rollback before making buttons, AI, find-jobs, and resume upload reliable

## jobs25 — 2026-07-14 06:55

- fix resume upload journey, find-jobs proxy and fallback, guest buttons, AI package visibility, and side-menu workflow

## jobs26 — 2026-07-14 06:59

- finalize AI timeout fallback for responsive website journey

## jobs27 — 2026-07-14 07:02

- add browser-side AI fallback so package generation never hangs

## jobs28 — 2026-07-14 09:20

- pre-fix rollback before Arabic resume and AI assumption cleanup

## jobs29 — 2026-07-14 09:33

- Arabic-first resume journey, remove IT/Rust assumptions, safer PDF resume extraction

## jobs30 — 2026-07-14 11:36

- Add Arabic-English browser OCR for scanned resume PDFs and replace stale UI QA wiring

## jobs31 — 2026-07-14 11:47

- Wire authenticated source scans to live ingestion worker results instead of placeholder jobs

## jobs32 — 2026-07-14 11:57

- Add verified Saudi government and regional job portals with direct portal access

## jobs33 — 2026-07-14 11:58

- Stabilize production OAuth redirect QA without following the external Google redirect

## jobs34 — 2026-07-14 12:37

- Add official Saudi enterprise career portals for Aramco SABIC stc PIF NEOM Maaden and SAB

## jobs35 — 2026-07-14 12:46

- Add durable application tracker follow-up queue and safe partial job updates

## jobs36 — 2026-07-14 13:00

- Make subscriber AI workflow editable with approved bilingual master resumes, per-job tailoring briefs, editable application documents, durable state, and mock interview coaching

## jobs37 — 2026-07-14 13:03

- Use the approved editable master resume in the browser AI fallback

## jobs38 — 2026-07-14 13:23

- Fix Arabic resume upload and account localization

## jobs39 — 2026-07-14 13:42

- Enforce English application-kit output

## jobs40 — 2026-07-14 13:43

- Refresh PWA cache for English kit fix

## jobs41 — 2026-07-14 18:02

- Production Typst Arabic PDF container, protected DeepSeek health proof, normalized revisioned D1 state, and verified live Remotive feed

## jobs42 — 2026-07-14 20:18

- Harden live ingestion and KV cache, evidence-based matching, liveness and ATS review gates, offline PWA, incremental domain storage, metrics, and authenticated release QA

## jobs43 — 2026-07-14 20:41

- Production security hardening: same-origin API enforcement, request limits, safer sessions, stronger browser isolation and cache headers, and crawler/security metadata

## jobs44 — 2026-07-23 18:16

- Fix RTL sidebar branding, responsive overflow safeguards, and adaptive PWA orientation

## jobs45 — 2026-07-23 18:51

- Add mobile account menu, dedicated Google signup, durable user records, consent, onboarding, and authenticated production QA

## jobs46 — 2026-07-23 18:57

- Finalize Google onboarding and QA release gate; extend AI provider timeout after production audit

## jobs47 — 2026-07-23 19:16

- Fix inward-opening account menu, restore header language and theme controls, and refresh verified DeepSeek V4 Flash production key

## jobs48 — 2026-07-23 19:17

- Refresh PWA cache for corrected header controls and account menu

## jobs49 — 2026-07-23 19:20

- Make DeepSeek V4 Flash generation resilient when second-pass review is unavailable

## jobs50 — 2026-07-23 19:22

- Finalize verified DeepSeek V4 Flash production QA and factual-review export gate diagnostics

## jobs51 — 2026-07-23 19:38

- Add private encrypted D1 and R2 resume file storage with validated upload, download, replacement, and deletion

