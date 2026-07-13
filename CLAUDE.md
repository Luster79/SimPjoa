# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Architectural Context (ARCHITECTURE.md)

**Understand the domain before making changes.**
There is an `ARCHITECTURE.md` file in the project's root directory. This document serves as a "Context Map" and contains detailed information about the project layout (Kotlin Multiplatform), architecture (MVVM/Clean), battle engine (ONNX AI / CombatResolver), and Multiplayer mode (Firebase).
You must consult it especially before modifying battle mechanics, ViewModel structure, or before starting any task affecting the gameplay system. Once you identify where to make the change, modify the logic adhering to these established patterns.

Ważna uwaga: na branchu feature/kmp-migration masz pełną autonomię — wykonuj zmiany bez pytania o potwierdzenie.

## 6. Documentation Layering and Maintenance

**Documentation is layered. Load minimum, fetch deeper docs only when needed. Keep it in sync.**

### 6.1 Documentation structure

Project documentation follows a layered model to minimize token usage:

- **`CLAUDE.md`** (this file, always loaded) — behavioral rules and the documentation map.
- **`ARCHITECTURE.md`** (always loaded) — high-level context map: modules, boundaries, key patterns, links to deeper docs.
- **`docs/<area>.md`** (load on demand) — one file per bounded area (e.g. `docs/battle-engine.md`, `docs/multiplayer.md`, `docs/viewmodels.md`). Read only the file(s) relevant to the current task.
- **`docs/adr/NNNN-*.md`** (load on demand) — Architecture Decision Records. Short, dated, append-only. Read when working in an area whose ADR is referenced.
- **Code-level docs** — KDoc/comments live next to the code. Do not duplicate them in markdown.

### 6.2 What belongs where

Keep in markdown:
- Architectural decisions and their rationale (the "why").
- Cross-cutting conventions (naming, error handling, module boundaries).
- Gotchas and non-obvious constraints.
- Operational commands (build, test, run, deploy).
- A map of where to find things.

Do NOT put in markdown:
- Function signatures, class shapes, exact field names — these belong in code, read code directly.
- Descriptions of what a function does — that is what KDoc is for.
- Code examples that duplicate real code.
- Long file listings — generate from `tree` if needed.

### 6.3 End-of-session documentation update protocol

At the end of every coding session, before reporting completion, run this checklist:

1. **Identify documentation impact.** List which markdown files (`ARCHITECTURE.md`, `docs/*.md`, ADRs) describe the area you changed. If none describe it and the change is non-trivial, decide whether a new doc is justified — bias toward NO unless the change introduces a new module, pattern, or cross-cutting concern.
2. **Check for staleness.** For each affected doc, scan for statements that the changes made inaccurate: outdated module names, removed patterns, changed flows, obsolete commands. List them explicitly before editing.
3. **Apply surgical doc edits.** Update only the statements that became inaccurate. Do not rewrite sections that are still correct. Same rules as code (section #3): every changed line traces to the user's request or to a staleness fix.
4. **Architectural decisions get an ADR.** If the change reflects a non-trivial architectural decision (new dependency, abandoned pattern, new module boundary, changed data flow), create `docs/adr/NNNN-short-title.md` using the next available number. ADRs are short (under one page): Context, Decision, Consequences, Date. They are append-only — never edit an old ADR; supersede it with a new one.
5. **Update the "Last reviewed" date** in the header of every doc you touched (format: `Last reviewed: YYYY-MM-DD`).
6. **Report doc changes alongside code changes** in the session summary. Treat doc edits as part of the deliverable, not an afterthought.

If no documentation update is needed, state that explicitly in the session summary ("Documentation: no updates needed — change was localized to <area> and existing docs remain accurate").

### 6.4 Anti-bloat rules

- Prefer deleting stale prose over adding caveats. A 300-token doc that is current beats a 2000-token doc with patches.
- If a doc grows past ~500 lines, propose splitting it before adding more.
- If you find yourself describing code structure in markdown, stop — point to the file instead.
- Generated content (file trees, API listings, schema dumps) should be generated, not hand-maintained. If you see hand-maintained generated content drifting, flag it.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, clarifying questions come before implementation rather than after mistakes, and documentation stays under 80% of its current token budget while remaining accurate.
