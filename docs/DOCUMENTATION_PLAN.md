# Documentation Plan

A roadmap for bringing ActSolo.AI's documentation up to a maintainable, on-ramping
standard. Created alongside the June 2026 repo health check.

## Why

The project already has a lot of written knowledge, but it is scattered and uneven:

- `README.md` — solid overview, but advertises a test suite and a Bun workflow that
  don't currently work as described.
- `CLAUDE.md` — new; commands, architecture, conventions, and known gotchas for
  contributors and AI assistants.
- `Project plans/` — 9+ documents mixing **durable reference** (Supabase workflow,
  browser compatibility), **historical planning** (PRDs, sprint plans), and
  **debugging lore** (manuals, lessons learned). Hard to tell what is current.

There is no contributor guide, no architecture diagram, no API/edge-function
reference, and no changelog. New contributors (human or AI) have to reverse-engineer
context from planning docs.

## Audit of current docs

| Doc | Type | Status | Action |
|-----|------|--------|--------|
| `README.md` | Overview | Out of date (tests/Bun claims) | Correct claims; link to CLAUDE.md + docs/ |
| `CLAUDE.md` | Contributor/AI guide | New, current | Keep current as code changes |
| `Project plans/SUPABASE_WORKFLOW.md` | Reference | Current, valuable | Move to `docs/reference/` |
| `Project plans/ConversationEngine_Browser_Compatibility.md` | Reference | Current | Move to `docs/reference/` |
| `Project plans/Comprehensive Debugging Manual.md` | Reference | Likely current | Move to `docs/guides/` |
| `Project plans/ConversationEngine Refactor PRD_Dec.md` | Planning/history | Historical | Move to `docs/history/` |
| `Project plans/November 2025 Sprint - Production Hardening.md` | Planning/history | Historical | Move to `docs/history/` |
| `Project plans/Phase2_Testing_Results.md` | History | Historical | Move to `docs/history/` |
| `Project plans/Debugging_Lesson_Avoid_Mental_Shortcuts.md` | Lore | Evergreen | Fold into a debugging guide |
| `Project plans/Updated plan_Adding OpenAI API_Aug.md` | Planning/history | Historical | Move to `docs/history/` |

## Target structure

```
docs/
  README.md                 # index: what lives where
  architecture.md           # system overview + conversation-engine deep dive (+ diagram)
  getting-started.md        # clone → env → run → first rehearsal
  contributing.md           # branching, PRs, CI gates, lint/test expectations
  edge-functions.md         # reference for each supabase/functions/* (inputs, secrets, deploy)
  reference/
    supabase-workflow.md
    browser-compatibility.md
  guides/
    debugging.md            # consolidated debugging manual + lessons
  history/                  # frozen PRDs, sprint plans, phase results (point-in-time)
DOCUMENTATION_PLAN.md       # this file
```

`Project plans/` is retired into `docs/history/` and `docs/reference/` so the root
stops being a dumping ground, and "current" vs "historical" is obvious from the path.

## Roadmap

**Phase 1 — Accuracy (do first, cheap, high value)**
- [ ] Fix `README.md`: testing section (suite hangs), package-manager guidance, add `.env.example` setup, link to `CLAUDE.md`.
- [x] Add `CLAUDE.md` (done).
- [x] Add `.env.example` + document env setup (done).

**Phase 2 — Structure**
- [ ] Create `docs/` with the structure above and a `docs/README.md` index.
- [ ] Move `Project plans/` docs into `docs/reference|guides|history` and update links.
- [ ] Add `docs/getting-started.md` and `docs/contributing.md`.

**Phase 3 — Depth**
- [ ] `docs/architecture.md` with a diagram of UI → `useConversationEngine` → `engineFactory` → `ElevenAgentsEngine`/stub, plus the Supabase token flow.
- [ ] `docs/edge-functions.md` documenting each function's contract, required secrets, and deploy steps.
- [ ] Consolidate debugging docs into `docs/guides/debugging.md`.

**Phase 4 — Upkeep**
- [ ] Add a `CHANGELOG.md` and keep it updated per release.
- [ ] Add PR/issue templates under `.github/`.
- [ ] Add a docs-lint or link-check step to CI so docs don't rot.

## Conventions for new docs

- One topic per file; link rather than duplicate.
- Mark planning/PRD docs with a date and a "Status: historical" banner when superseded.
- Keep `CLAUDE.md` and `README.md` in sync with reality — update them in the same PR as the code change that invalidates them.
