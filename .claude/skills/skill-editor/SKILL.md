---
name: skill-editor
description: Audit and rewrite Claude skill markdown (SKILL.md) files in this repo for conciseness, progressive disclosure, clear and actionable instructions, and single-responsibility focus. Use when creating a new skill, editing an existing one, or reviewing skills for quality. Runs a clean-context eval and iterates until the skill passes.
---

# Skill Editor

Keep every skill in `.claude/skills/` concise, focused, and actionable. A good
skill reads like a runbook a new agent can follow on the first try.

## When to use

- Creating a new skill, or revising an existing one.
- Reviewing the whole `.claude/skills/` tree for drift.
- A skill is bloated, vague, duplicates the repo's own docs (README / CLAUDE.md
  if present), or buries the action.

Do **not** use this skill to verify the app still works — that is
[`app-health-eval`](../app-health-eval/SKILL.md). This skill only edits skill
markdown.

## The five principles to enforce

1. **Concise** — say it once, in the fewest words that stay unambiguous. Cut
   anything the agent already knows or can read in the repo.
2. **Progressive disclosure** — `SKILL.md` is the short entry point. Push
   rubrics, long command lists, and edge cases into sibling files (e.g.
   `EVAL.md`, `references/*.md`) that are loaded only when needed.
3. **Clear & actionable** — imperative voice, concrete commands, exact file
   paths. Every instruction names what to do, not just what to know.
4. **Focused & specific** — one job per skill. If a skill does two things,
   split it.
5. **Clarity over completeness** — when in doubt, delete. A skill an agent
   actually follows beats an exhaustive one it skims.

## Workflow

1. **Inventory.** Find every skill: `find .claude/skills -name SKILL.md`.
2. **Audit.** Score each skill against the rubric in
   [`EVAL.md`](./EVAL.md). Note the specific failing check and line.
3. **Rewrite.** Fix the issues — tighten prose, move detail to reference files,
   make instructions imperative, sharpen the `description` so the skill
   triggers on the right requests. Practice progressive disclosure on the skill
   you are editing.
4. **Eval (clean context).** Spawn a subagent with the Agent/Task tool and have
   it run [`EVAL.md`](./EVAL.md) against the edited skill in a fresh context
   window. It returns a PASS/FAIL table with specific fixes. See EVAL.md for the
   exact prompt and output contract.
5. **Iterate.** For each FAIL, apply the fix and re-spawn the eval subagent.
   Loop until every check is PASS. Report the final table.

## Quick reference: skill anatomy

```
.claude/skills/<name>/
  SKILL.md          # short entry point: what, when, workflow, pointers
  EVAL.md           # rubric / runbook, loaded on demand
  references/*.md   # deep detail, loaded on demand (optional)
```

`SKILL.md` frontmatter must have `name` (kebab-case, matching the folder) and a
`description` that states **what it does + when to use it** — that line is how
the skill gets selected, so make it specific.
