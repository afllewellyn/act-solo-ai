# .claude/skills

Project skills for ActSolo.AI. Committed to the repo so every agent and
collaborator sees the same set. Each skill is a folder with a `SKILL.md` entry
point; detail lives in sibling files loaded on demand (progressive disclosure).

| Skill | Use it to… |
|-------|------------|
| [`skill-editor`](./skill-editor/SKILL.md) | Audit and rewrite skill markdown for conciseness, progressive disclosure, and clear, actionable instructions. Self-checks via [`skill-editor/EVAL.md`](./skill-editor/EVAL.md). |
| [`app-health-eval`](./app-health-eval/SKILL.md) | Regression-check the core app — conversation engine, ElevenLabs voice connections, edge functions, latency — via a clean-context subagent. Runbook in [`app-health-eval/EVAL.md`](./app-health-eval/EVAL.md). |

**Discovery note:** Claude Code finds project skills relative to where it's
launched. This folder lives in the `act-solo-ai/` git repo, so launch Claude
Code from `act-solo-ai/` (not the parent `ActSolo.AI/` folder) for these to be
auto-discovered.
