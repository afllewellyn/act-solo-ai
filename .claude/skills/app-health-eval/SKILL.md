---
name: app-health-eval
description: Regression eval for ActSolo.AI's core — the conversation engine, ElevenLabs voice connections, Supabase edge functions, and latency. Use after changing the conversation engine, edge functions, voice/TTS code, or before a release, to verify nothing broke. Spawns a clean-context subagent to run pass/fail checks and report results; the primary agent fixes failures and re-runs until green.
---

# App Health Eval

Verify the things that make ActSolo.AI work for an actor mid-rehearsal: the
voice connection holds, ElevenLabs audio is real and fast, and the build is
green. The detailed checks, commands, and pass bars live in
[`EVAL.md`](./EVAL.md) — this file is the entry point and the loop.

## When to use

- After editing `src/services/conversation/*`, `src/hooks/useConversationEngine.ts`,
  `supabase/functions/*`, or any TTS/voice path.
- Before a release or after a dependency bump.
- When the user reports lag, dropped audio, or a dead scene partner.

## How it runs

1. **Spawn a clean-context subagent** (Agent/Task tool) and hand it
   [`EVAL.md`](./EVAL.md). Use a fresh context so the result reflects reality,
   not this conversation's assumptions.

   > Prompt: "Run the ActSolo.AI health eval. Read and execute every check in
   > `.claude/skills/app-health-eval/EVAL.md` from the `act-solo-ai/` repo root.
   > Run the commands, capture real output (exit codes, HTTP status, latency,
   > error bodies). Do NOT edit code. Return ONLY the report defined in EVAL.md:
   > the PASS/FAIL table plus the manual checklist verbatim."

2. **Read the report.** It is a PASS/FAIL table with evidence per check.

3. **Iterate on failures.** For each FAIL, the primary agent (you) diagnoses and
   fixes the underlying code, then re-spawns the eval subagent. Loop until the
   automated checks are all PASS, or a check is a documented known-issue.

4. **Hand the manual checklist to the user.** The live mic / voice-quality items
   need a human with a browser and a mic — present them as a checklist; do not
   mark them PASS yourself.

## Environment notes (so the eval matches reality)

- Run all commands from `act-solo-ai/` (the git repo root) with **npm** — see
  `CLAUDE.md` "Known issues" for why (lockfile drift, hanging `vitest`, red
  `eslint`). EVAL.md guards or downgrades each so they don't mask a regression.
- Supabase CLI is authenticated and the project is linked; edge functions are
  public (`verify_jwt = false`). EVAL.md's setup block is the single source of
  truth for the exact commands, the `Origin` gate, and the current measured
  per-function baseline (sections C1–C4) — don't restate those numbers here.
- One heads-up before you start: `health-realtime` is **confirmed legacy** (an
  OpenAI realtime check, not used by the ElevenLabs engine) and slated for
  removal — expect its C4 check to be a KNOWN-ISSUE, not a bug to fix or loop on.

## Stop criteria

All automated checks PASS (or are tagged KNOWN-ISSUE with a tracking note), and
the manual checklist has been delivered to the user. If a check fails to go
green after 3 fix-and-rerun rounds, stop and report it with the evidence rather
than forcing it.
