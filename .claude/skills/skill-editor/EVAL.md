# Skill Quality Eval

Rubric and runbook for scoring a `SKILL.md` (and its sibling files). Run this in
a **clean-context subagent** so the score reflects what a fresh agent sees, not
what the author already has in context.

Each check is **PASS / FAIL** with an objective bar. A skill ships only when
every Structural check passes and no more than the allowed Quality exceptions
remain.

---

## How to run (clean context)

From the `skill-editor` workflow, spawn one subagent per skill under review:

> Prompt: "You are evaluating a Claude skill in a clean context. Read
> `<path>/SKILL.md` and any files it links. Score it against every check in
> `.claude/skills/skill-editor/EVAL.md`. Return ONLY the output table defined in
> that file: one row per check with PASS/FAIL, evidence (file:line or quote),
> and a one-line fix for each FAIL. Do not edit any files."

The subagent must not have seen the editing conversation — that is the point of
the clean context. The primary agent applies fixes and re-spawns until green.

---

## A. Structural requirements (all must PASS)

| ID | Check | PASS bar |
|----|-------|----------|
| S1 | Frontmatter present | `SKILL.md` opens with `---` block containing `name` and `description`. |
| S2 | Name matches folder | `name:` is kebab-case and equals the parent directory name. |
| S3 | Description is a trigger | `description` states **what it does AND when to use it**; ≤ ~3 sentences; specific enough to select on the right request (not "helps with skills"). |
| S4 | Length budget | `SKILL.md` ≤ 200 lines. Longer detail lives in sibling files, not the entry point. |
| S5 | Links resolve | Every relative link (`./EVAL.md`, `../x/SKILL.md`, `references/*`) points to a file that exists. |
| S6 | Has a workflow | Contains an ordered, imperative step list the agent can execute. |

## B. Quality checks (target: all PASS; justify any FAIL)

| ID | Check | PASS bar | FAIL signal |
|----|-------|----------|-------------|
| Q1 | Concise | No sentence repeats another; no filler. | Same idea stated twice; throat-clearing intros. |
| Q2 | Progressive disclosure | Entry point stays short; rubrics/long command sets are in `EVAL.md` / `references/`. | A 300-line `SKILL.md` with everything inline. |
| Q3 | Actionable | Instructions are imperative with concrete commands/paths. | "Be aware of…", "Consider…" with no action. |
| Q4 | Focused | One responsibility. | Skill audits skills *and* deploys functions. |
| Q5 | No repo duplication | Does not restate `CLAUDE.md`, code, or git history; references them instead. | Pastes architecture already in `CLAUDE.md`. |
| Q6 | Clear over complete | A new agent could follow it without guessing. | Key step assumed; ambiguous ordering. |

## C. Practical value (must PASS)

| ID | Check | PASS bar |
|----|-------|----------|
| P1 | Real-input test | Pick one representative task the skill claims to handle and dry-run it mentally end to end. The steps produce a usable result with no dead ends or missing prerequisites. |
| P2 | Triggerable | Given a realistic user request, the `description` would cause this skill to be selected (and would NOT fire on unrelated requests). |

---

## Output contract

The subagent returns exactly this, nothing else:

```
Skill: <path/to/SKILL.md>
Verdict: PASS | FAIL

| ID | PASS/FAIL | Evidence (file:line or quote) | Fix if FAIL |
|----|-----------|-------------------------------|-------------|
| S1 | PASS | line 1–4 frontmatter | — |
| ... |
```

`Verdict: PASS` only when all of A and C pass and B has no unjustified FAIL.

## Iteration loop (primary agent)

1. Read the table. For each FAIL, apply the one-line fix to the skill.
2. Re-spawn the eval subagent (clean context) on the edited skill.
3. Repeat until `Verdict: PASS`. If a check cannot pass after 3 rounds, stop and
   surface it to the user with the reason rather than forcing a green.
