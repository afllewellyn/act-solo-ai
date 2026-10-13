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
   automated checks are all PASS, or a check is a documented known-issue. Do not
   loop on a BLOCKED check: no code change unblocks it (see below).

4. **Hand the manual checklist to the user.** The live mic / voice-quality items
   need a human with a browser and a mic — present them as a checklist; do not
   mark them PASS yourself.

## Environment notes (so the eval matches reality)

- Run all commands from the `act-solo-ai/` repo root with **npm** (`npm ci`;
  `package-lock.json` is canonical). Current gotchas and baselines live in
  `CLAUDE.md` — don't restate them here.
- C1–C3 call the deployed edge functions, which verify a signed-in user token
  in-function. They need outbound network to `<REF>.supabase.co` **and** an
  `ACCESS_TOKEN` from a dedicated test account. If either is missing (token
  unset, or the sandbox egress policy denies the host: `curl: CONNECT tunnel
  failed, response 403` / `HTTP 000`), the check is **BLOCKED** — report the
  cause and denied host; never route around an egress denial or mint a token
  another way. EVAL.md's setup block is the single source of truth for the
  sign-in command, the `Origin` gate, and the per-function baselines.

## Stop criteria

All automated checks PASS (or are tagged KNOWN-ISSUE with a tracking note), none
are BLOCKED, and the manual checklist has been delivered to the user. If any of
C1–C3 is BLOCKED, the verdict is **INCOMPLETE**, not green: deliver the report
and ask the user to run C1–C3 from a machine with network and a test login. If a
check fails to go green after 3 fix-and-rerun rounds, stop and report it with
the evidence rather than forcing it.
