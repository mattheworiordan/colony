---
name: colony-plan
description: Plan tasks from a brief - interactive task decomposition
version: 1.1.0
status: active

# Claude Code command registration
allowed-tools: Read, Write, Bash, Grep, Glob, AskUserQuestion
---

# Plan Tasks

Create a colony project by decomposing a brief into executable tasks.

## Step 0: Verify CLI

```bash
# Verify colony CLI is available (Claude Code's Bash doesn't inherit user PATH)
[[ -x "${CLAUDE_PLUGIN_ROOT}/bin/colony" ]] && echo "colony CLI ready" || echo "ERROR: colony CLI not found"
```

## Step 1: Find Brief

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony config init 2>/dev/null || true

# Look for briefs
find . -maxdepth 3 -type f \( -name "*.md" -o -name "*.txt" \) 2>/dev/null | head -20
```

Check: `.working/*.md`, `docs/*.md`, `$ARGUMENTS`

If multiple candidates: ask user. If none: ask for path or inline description.

## Step 2: Generate Project Name

Derive from brief filename or H1 heading, slugified. Example: `INTEGRATION_BRIEF.md` → `integration-brief`

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state list
```

If project exists: ask to continue, create new version, or overwrite.

## Step 3: Task Type Assessment

Determine if project needs Git tracking.

**Needs Git when:**
- Brief mentions: implement, build, create feature, fix bug, refactor
- Tasks modify tracked source files
- Brief mentions: PR, pull request, merge

**No Git when:**
- Research, analyze, investigate, document
- All outputs go to `.working/`
- Brief says "no code changes"

If uncertain, ask user.

## Step 4: Git Strategy (if applicable)

Skip if task type is research/documentation.

```bash
git status --porcelain
git branch --show-current
```

If dirty: STOP, ask user to commit/stash.

**Configure:**
- Branch: feature branch or current
- Commits: phase/task/end/manual
- Style: conventional commits

## Step 5: Visual/Browser Detection

Scan brief for visual verification indicators:
- "visual verification", "screenshot", "browser testing"
- "UI testing", "form verification", "end-to-end"

If found: set `verification_type: visual`, prefix criteria with `VISUAL:`.

## Step 6: Analyze Parallelization

```bash
grep -r "parallel" package.json .github/workflows/ 2>/dev/null | head -5
```

Identify:
- Tasks that can run concurrently (different files, independent)
- Tasks that must serialize (shared resources, dependencies)
- Uncertain cases (ask user)

## Step 7: Create Project

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state init {project-name}
```

This creates:
```
.working/colony/{project}/
├── state.json
├── tasks/
├── logs/
├── resources/
└── screenshots/
```

## Step 8: Write Context File

Write `.working/colony/{project}/context.md`:

```markdown
# Project Context: {project-name}

Captured: {timestamp}

## Task Type
{implementation | research | documentation}

## Git Strategy
{Branch, commit frequency, or "not applicable"}

## Verification Type
{code-only | visual | mixed}

## Project Rules
{From CLAUDE.md if exists}

## Parallelization
- Can parallelize: {list with reasoning}
- Must serialize: {list with reasoning}

## Tech Stack
{From package.json, etc.}
```

## Step 9: Decompose into Tasks

<critical>
Each task file must be SELF-CONTAINED. Workers have NO memory of:
- The original brief
- Other tasks
- Your conversation history

PRESERVE in each task:
- User quotes showing preferences
- Design philosophy and intent
- What to AVOID
- How task relates to broader goal

CONDENSE (don't remove):
- Lengthy background

OMIT:
- Information about other tasks
</critical>

### Task Sizing
- 15-45 minutes each
- One clear deliverable
- Too large → split
- Too small → combine

### Task File Format

Write `.working/colony/{project}/tasks/T{NNN}.md`:

```markdown
# Task T{NNN}: {Short Name}

## Status
pending

## Context & Why
{Why this task exists}
{How it fits the broader goal}

## Design Intent
{Philosophy for implementation}
{User preferences - direct quotes}
{What to AVOID}

## Description
{What needs to be done}

## Files
- {path/to/file1}
- {path/to/file2}

## Acceptance Criteria
- [ ] {Specific, verifiable}
- [ ] VISUAL: {If needs browser check}

## Verification Command
```bash
{command to verify}
```

## Dependencies
{T001, T002 or "None"}

## Parallel Group
{setup | independent | tests-browser | etc.}
```

## Step 10: Update State

```bash
# Add each task to state
${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} 'tasks.T001' '{"status":"pending","attempts":0}'
${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} 'tasks.T002' '{"status":"pending","attempts":0}'
# ...

# Update total
${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} total_tasks {count}

# Set git config if applicable
${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} 'git.strategy' '"active"'
${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} 'git.branch' '"{branch-name}"'
${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} 'git.commit_strategy' '"phase"'
```

## Step 11: Copy Brief

```bash
cp {brief-path} .working/colony/{project}/resources/original-brief.md
```

## Step 12: Summary

```markdown
## Project Created: {project-name}

Location: .working/colony/{project}/
Tasks: {count}
Type: {implementation | research}

### Execution Plan

**Phase 1 - Setup (serial):**
- T001: {name}

**Phase 2 - Main Work (parallel):**
- T002, T003, T004

### Next Steps
1. Review: `ls .working/colony/{project}/tasks/`
2. Run: `/colony-run`
3. Autonomous: `/colony-run autonomous`
```
