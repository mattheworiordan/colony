---
name: colony-mobilize
description: Prepare a brief for parallel execution - task decomposition and worker mobilization
version: 1.7.0
status: active

# Claude Code command registration
allowed-tools: Read, Write, Bash, Grep, Glob, AskUserQuestion
---

# Mobilize Colony

Prepare a colony project by decomposing a brief into executable tasks.

**Note:** This command prepares tasks for execution - it does NOT do strategic planning. For strategic planning (requirements, approach, architecture), use Claude's native plan mode first (`claude --permission-mode plan`), then pass the resulting plan here.

## Step 0: Verify CLI

```bash
# Verify colony CLI is available (Claude Code's Bash doesn't inherit user PATH)
[[ -x "${CLAUDE_PLUGIN_ROOT}/bin/colony" ]] && echo "colony CLI ready" || echo "ERROR: colony CLI not found"
```

## Step 1: Find Brief or Plan

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony config init 2>/dev/null || true

# Check Claude plans folder (recent, last 48 hours)
echo "=== Recent Claude Plans ==="
find ~/.claude/plans ~/.claude-personal/plans -name "*.md" -mtime -2 2>/dev/null | head -5 || true

# Check conventional locations
echo "=== .working/ (primary) ===" && ls -1 .working/*.md 2>/dev/null || true
echo "=== docs/ ===" && ls -1 docs/*.md 2>/dev/null || true
echo "=== root ===" && ls -1 ./*.md 2>/dev/null | grep -v -E '^\./(README|CHANGELOG|LICENSE)' || true
```

**Priority order:**
1. `$ARGUMENTS` - if user specified a path, use it
2. `~/.claude/plans/*.md` - recent Claude plans (last 48 hours)
3. `.working/*.md` - conventional location for briefs
4. `docs/*.md` - documentation folder
5. Root `.md` files (excluding README, CHANGELOG, LICENSE)

**For Claude plans, assess relevance:**
- Read the plan content
- Check if it mentions files/paths that exist in current project
- Check if it mentions current directory name
- More recent = higher relevance

**Present to user:**
```
Found potential plans:

Claude Plans (recent):
  1. ~/.claude/plans/gleaming-sniffing-bird.md (2 hours ago)
     ⭐ Likely relevant - mentions src/auth/, package.json

  2. ~/.claude/plans/proud-dazzling-papert.md (1 day ago)
     Different project paths

Project Briefs:
  3. .working/FEATURE_BRIEF.md
  4. docs/OAUTH_SPEC.md

Which would you like to use? [1-4, or enter path]
```

If none found: ask for path or suggest using Claude plan mode first.

## Step 1.5: Assess Brief Quality

**Skip this step if brief comes from `~/.claude/plans/`** (Claude plans are pre-validated).

For other briefs, check for weak brief indicators:
- Very short (< 100 words)
- No acceptance criteria (no `- [ ]` checkboxes)
- No file paths mentioned
- Vague language only ("improve", "better", "fix", "enhance")
- No technical specifics

**If 3+ indicators present, warn:**

```
⚠️ This appears to be a high-level goal rather than a detailed plan.

Colony is an execution engine - it works best with well-defined requirements.
For strategic planning, consider using Claude's plan mode first:

  claude --permission-mode plan
  > [describe your goal, let Claude interview you]

Then pass the resulting plan to Colony:
  /colony-mobilize ~/.claude/plans/[plan-name].md

Learn more: https://github.com/mattheworiordan/colony#colony--claude-plan-mode

Continue anyway? [y/N]
```

Use AskUserQuestion. If user declines, exit. If user continues, note in context.md that brief was flagged as potentially underspecified.

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

## Step 5: Extract Hard Requirements

<critical>
This step is MANDATORY. The brief is a CONTRACT, not a suggestion.

Every verification requirement in the brief MUST map to:
- A task that implements it, OR
- An acceptance criterion that checks it, OR
- A verification command that runs it

VERIFICATION MUST EXECUTE, NOT JUST EXIST:
- If the brief says "run X", verification must ACTUALLY RUN X
- If the brief says "test Y passes", verification must EXECUTE the test
- Checking that code exists is NOT the same as running that code
- Checking that a file was created is NOT the same as verifying it works

NO SUBSTITUTING complex verification with simpler checks.
NO DELEGATING verification to humans when automation is possible.
</critical>

**Scan the brief and extract:**

1. **Explicit verification requirements:**
   - "must pass visual tests" → Task that runs visual tests
   - "0 pixel difference" → Verification command with pixelmatch
   - "must pass integration tests" → Task that runs integration tests
   - "API must return X" → Verification command that curls and checks response

2. **Gate conditions (blockers):**
   - "DO NOT proceed until X" → X becomes a blocking verification
   - "MANDATORY" anything → Must be in acceptance criteria
   - "must/shall/required" statements → Hard requirements

3. **Infrastructure requirements:**
   - "start servers" → Task includes server lifecycle
   - "run against production" → Task includes environment setup
   - "compare with baseline" → Task includes baseline capture

**Output a requirements checklist:**

```markdown
## Extracted Requirements

| # | Requirement | Type | Source |
|---|-------------|------|--------|
| R1 | Visual tests pass with 0 diff | verification | "DO NOT proceed until visual tests pass" |
| R2 | Playwright test scripts created | deliverable | "Create scripts/visual-test-phase4.ts" |
| R3 | Both servers running for comparison | infrastructure | "Run Gatsby (8000) and Next.js (3001)" |
| R4 | TypeScript compiles | verification | Implicit for TS project |
```

Write this to `.working/colony/{project}/resources/requirements-checklist.md`

**If a requirement cannot be automated:** Flag it explicitly and ask user how to handle. Do NOT silently drop it.

## Step 6: Assess Complexity

After analyzing the brief, estimate task count before decomposition.

<critical>
This step is MANDATORY. You must estimate task count and follow the decision tree below.
Skipping this step leads to either over-decomposition (too many small tasks) or under-decomposition (tasks too large to parallelize).
</critical>

**If estimated tasks ≤ 6:** Proceed with quality-first approach (atomic tasks).

**If estimated tasks > 6:** You MUST ask user about atomicity vs speed using AskUserQuestion:

```
This brief is substantial. I estimate ~{N} tasks across {M} milestones.

How should I balance atomicity vs execution speed?

1. **Quality-first** (recommended for production)
   - Atomic tasks, each independently verified
   - Easier debugging, better recovery from failures
   - ~{N} tasks, ~{rounds} execution rounds

2. **Balanced**
   - Consolidate tightly-coupled tasks
   - Good middle ground
   - ~{N*0.7} tasks

3. **Speed-first** (for prototyping/experiments)
   - Maximize consolidation
   - Faster but larger blast radius on failure
   - ~{N*0.5} tasks
```

Use AskUserQuestion. Default to Quality-first if user doesn't respond.

## Step 6.5: Identify Shared Patterns (DRY)

Before decomposing into tasks, scan the brief for patterns likely to be reused across multiple tasks.

**Why this matters:** Workers execute in isolation. If multiple tasks need the same icon, utility, or component, each worker will create its own version - causing duplication.

**Common shared patterns to detect:**
- UI components (icons, buttons, modals, form elements)
- Utility functions (formatters, validators, parsers)
- Types/interfaces used across features
- API client methods
- Constants/configuration

**Detection heuristics:**
- Same noun appears in multiple requirements (e.g., "user avatar" mentioned 3 times)
- Common UI elements mentioned (icons, spinners, tooltips)
- Data structures referenced by multiple features

**If shared patterns detected:**

Create infrastructure task(s) in Milestone 1:
```
T001: "Create shared {pattern} components/utilities"
```

Then ensure subsequent tasks depend on the shared infrastructure completing first.

**Example:**
```
Brief mentions "user avatar" in:
- Message display feature
- Presence list feature
- Profile popup feature

→ Create T001: "Create shared UserAvatar component"
→ T002, T003, T004 (features) all depend on T001
```

This prevents duplicate implementations across parallel workers.

## Step 7: Design Parallel Execution

**Goal:** Minimize sequential chains, maximize concurrent execution.

**Process:**
1. Identify tasks with NO dependencies (Round 1 candidates)
2. For each subsequent task, depend on minimum required predecessors
3. Avoid unnecessary chains (T001 → T002 → T003 when T002/T003 are independent)
4. Group tasks touching different files - they can parallelize

**Output execution rounds estimate:**

```
Execution Rounds (concurrency=5):
Round 1: T001, T003 (no deps, different modules)
Round 2: T002, T004 (deps satisfied, different files)
Round 3: T005, T006 (parallel integration)
Round 4: T007
Round 5: T008, T009 (tests + docs, independent)

Total: 5 rounds for 9 tasks
Sequential would be: 9 rounds
Parallelization benefit: 44% faster
```

**Anti-pattern to avoid:**
```
# BAD: Unnecessary chain
T001 → T002 → T003 → T004  (serial)

# GOOD: Parallel where possible
T001 ─┬→ T002
      └→ T003 → T004
```

## Step 8: Identify Milestones

Milestones are natural review points where work can be paused, reviewed, and approved before continuing. They help break large projects into reviewable chunks.

**Auto-detect milestones from:**
- Phases explicitly mentioned in brief ("Phase 1", "Stage 1", "Step 1")
- Logical boundaries (infrastructure → implementation → testing)
- Git strategy hints (if brief mentions multiple PRs or branches)
- Task dependencies that create natural groupings

**Milestone structure:**
```json
{
  "id": "M1",
  "name": "Infrastructure Setup",
  "tasks": ["T001", "T002", "T003"],
  "checkpoint": "review"
}
```

**Checkpoint types:**
- `review` (default) - Pause for human approval before continuing
- `commit` - Auto-commit at milestone boundary, then continue
- `branch` - Create new branch for next milestone
- `pr` - Create PR for completed milestone

**Behavior:**
- If milestones are obvious from brief: state them and proceed (user can challenge)
- If milestones are unclear: suggest milestones and confirm
- If brief is small (<10 tasks): single milestone is fine
- Don't over-ask - let user challenge after if they disagree

**Default checkpoint:** `review` (pause and ask for approval in non-autonomous mode)

## Step 9: Create Project Directories

Create the directory structure (but NOT state.json yet - that comes in Step 12 with bulk import):

```bash
working_dir="${CLAUDE_PLUGIN_ROOT}/../../../.working"  # Or use colony working-dir
mkdir -p .working/colony/{project-name}/{tasks,logs,resources,screenshots}
```

This creates:
```
.working/colony/{project}/
├── tasks/
├── logs/
├── resources/
└── screenshots/
```

**Note:** state.json is created in Step 12 via `--from plan.json` with all tasks and milestones.

## Step 9.5: Detect Project Standards

Scan for quality/standards files that workers must follow:

```bash
echo "=== Standards Detection ==="
[[ -f "CLAUDE.md" ]] && echo "CLAUDE.md found" || true
[[ -f ".claude/CLAUDE.md" ]] && echo ".claude/CLAUDE.md found" || true
[[ -f "CONTRIBUTING.md" ]] && echo "CONTRIBUTING.md found" || true
[[ -f ".eslintrc*" || -f "eslint.config.*" ]] && echo "ESLint config found" || true
[[ -f ".prettierrc*" || -f "prettier.config.*" ]] && echo "Prettier config found" || true
[[ -f "tsconfig.json" ]] && echo "TypeScript config found" || true
[[ -f "pyproject.toml" || -f "setup.cfg" ]] && echo "Python config found" || true
[[ -f "go.mod" ]] && echo "Go module found" || true
```

**Include detected standards in context.md** (see Step 10).

**Philosophy:** Detect what EXISTS, don't impose new standards. Workers should follow the project's established patterns, not Colony's opinions.

## Step 10: Write Context File

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

## Milestones
| ID | Name | Tasks | Checkpoint |
|----|------|-------|------------|
| M1 | {name} | T001-T003 | review |
| M2 | {name} | T004-T007 | review |

## Project Standards

**Guidelines files detected:**
{List CLAUDE.md, CONTRIBUTING.md if found}

**Quality tools detected:**
{List ESLint, Prettier, TypeScript, etc. if found}

**Workers MUST:**
- Follow patterns in existing codebase
- Run lint/format if project has them configured
- Adhere to CLAUDE.md guidelines if present
- Match existing code style

## Project Rules
{From CLAUDE.md if exists, summarized}

## Parallelization
- Can parallelize: {list with reasoning}
- Must serialize: {list with reasoning}

## Tech Stack
{From package.json, etc.}

## Decisions Log
{Orchestrator will append decisions here during execution}

## Feedback History
{Orchestrator will append user feedback and resulting subtasks here}
```

### Context Split Rule

Keep context.md unified UNLESS both conditions are met:
1. **Optional for ≥50% of tasks** - Extended content isn't needed by at least half the tasks
2. **≥30 lines** - Big enough to matter for token efficiency

If both met: Create `context-extended.md` and reference it from context.md.

## Step 11: Decompose into Tasks

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

**Goal: Minimize task count while maintaining parallelization opportunities.**

**Why this matters:**
- Each task has fixed overhead: worker spawn (~30s), inspector verification (~30s), state management
- 9 tasks vs 6 tasks = 50% more overhead before any real work happens
- Granular tasks also increase failure surface area (more chances for lint errors, retry loops)
- The benefit of splitting is parallelization—if tasks can't run in parallel, combining them is pure gain

**Decomposition principles:**
1. **One module = one task** - Don't split types/constants/utils into separate tasks
2. **Split only for parallelization** - If two things can't run in parallel, combine them
3. **Split for different expertise** - Tests vs implementation vs docs can be separate

**Right-sizing test:** For each task, ask "could this be combined with an adjacent task without losing parallelization?" If yes, combine.

**Examples:**
- ✅ "Create protocol module" (includes types, constants, parser, utils)
- ❌ "Create types" + "Create constants" + "Create parser" + "Create utils" (4 tasks for one module)

- ✅ "Migrate auth module to new framework" (one coherent unit)
- ❌ "Update imports" + "Change function signatures" + "Update tests" (if all in same files)

### Task File Format

Write `.working/colony/{project}/tasks/T{NNN}.md`:

```markdown
# Task T{NNN}: {Short Name}

## Status
pending

## Why This Task
{Specific reason this task exists - not project background}

## What To Do
{Concrete deliverable - be specific}

## What To Avoid
{Task-specific pitfalls, anti-patterns}

## Files
- {path/to/file1}

## Acceptance Criteria
- [ ] {Specific, verifiable}

## Verification Command
```bash
{command - see guidelines below}
```

## Dependencies
{T001 or "None"}
```

**OMIT from task files** (already in context.md which workers receive):
- Tech stack details
- Git strategy
- Coding standards
- General project background

### Verification Command Guidelines

Verification must be achievable when the task completes. Don't reference artifacts that don't exist yet.

**Simple verification (code-only tasks):**

| Task Type | Verification | Example |
|-----------|--------------|---------|
| New module | TypeScript compiles | `npx tsc --noEmit` |
| New function | Module exports it | `node -e "require('./src/mod').fn"` |
| Integration | Build succeeds | `npm run build` |
| Integration | Existing tests pass | `npm test` |
| Test creation | New tests pass | `npm test -- --grep "pattern"` |
| Documentation | File has content | `test -s README.md` |

**Complex verification (when brief requires it):**

| Task Type | Verification | Example |
|-----------|--------------|---------|
| Visual comparison | Playwright + pixelmatch | See template below |
| API endpoint | curl + jq | `curl -s localhost:3000/api/x \| jq -e '.status == "ok"'` |
| Browser behavior | Playwright script | `npx playwright test {script}` |
| E2E flow | Full test suite | `npm run e2e` |
| CLI output | Command + grep | `./cli --version \| grep -q "1.0"` |

**Visual/Browser verification template:**

```bash
#!/bin/bash
# Start servers
npm run dev & PID1=$!
npm run dev:next -- --port 3001 & PID2=$!

# Wait for servers (with timeout)
timeout 60 bash -c 'until curl -s http://localhost:8000 > /dev/null; do sleep 1; done'
timeout 60 bash -c 'until curl -s http://localhost:3001 > /dev/null; do sleep 1; done'

# Run visual tests
npx playwright test scripts/visual-test.ts
RESULT=$?

# Cleanup
kill $PID1 $PID2 2>/dev/null

exit $RESULT
```

<critical>
VERIFICATION MUST MATCH REQUIREMENT SEMANTICS:

The verification command must EXECUTE what the requirement describes.
Simpler proxies are NOT acceptable substitutes:

| Requirement | Wrong Verification | Right Verification |
|-------------|-------------------|-------------------|
| "Tests pass" | Check test file exists | Run the tests |
| "API returns 200" | Check route exists | curl and check response |
| "Visual diff is 0" | Check screenshot exists | Run comparison, check diff count |
| "Build succeeds" | Check config exists | Run the build |

If the brief says "run X", verification must run X - not check that X could theoretically run.
</critical>

**Anti-pattern:** Don't reference tests that don't exist yet. If T001 creates a parser and T008 creates tests, T001's verification should be `npx tsc --noEmit`, not `npm test -- --grep parser`.

## Step 12: Write Plan File and Initialize State

Write `.working/colony/{project}/plan.json` with all tasks, milestones, and config:

```json
{
  "total_tasks": 9,
  "tasks": {
    "T001": {"status": "pending", "attempts": 0, "milestone": "M1"},
    "T002": {"status": "pending", "attempts": 0, "milestone": "M1", "depends_on": ["T001"]},
    "T003": {"status": "pending", "attempts": 0, "milestone": "M2"}
  },
  "milestones": [
    {"id": "M1", "name": "Infrastructure", "tasks": ["T001", "T002"], "checkpoint": "review", "status": "pending"},
    {"id": "M2", "name": "Implementation", "tasks": ["T003"], "checkpoint": "review", "status": "pending"}
  ],
  "git": {
    "strategy": "active",
    "branch": "feature/my-feature",
    "commit_strategy": "phase"
  }
}
```

Then initialize with bulk import (one command instead of many):

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state init {project} --from .working/colony/{project}/plan.json
```

This is atomic - either all state is created or none. Reduces agent overhead and errors.

## Step 13: Copy Brief

```bash
cp {brief-path} .working/colony/{project}/resources/original-brief.md
```

## Step 13.5: Validate Requirement Coverage (MANDATORY)

<critical>
This validation step catches requirement drift BEFORE execution begins.
If validation fails, DO NOT proceed to Step 14. Fix the tasks first.

CORE PRINCIPLE: Human review is ADDITION, not REPLACEMENT.
Milestone checkpoints may include human review, but this does NOT excuse
automated testing. Every testable requirement must have automated verification.
</critical>

**Spawn a validation agent:**

```
Task(
  subagent_type: "general-purpose",
  model: "sonnet",  // Validation requires judgment about semantic equivalence
  prompt: "You are a requirements validator. Your job is to ensure every requirement
from the brief has been translated into executable, automated tasks.

## Inputs

1. Original brief: .working/colony/{project}/resources/original-brief.md
2. Requirements checklist: .working/colony/{project}/resources/requirements-checklist.md
3. Task files: .working/colony/{project}/tasks/*.md

## Core Principle

HUMAN REVIEW IS ADDITION, NOT REPLACEMENT.

Milestone checkpoints may pause for human approval - that's fine.
But human review does NOT excuse automated testing.
Every testable requirement must have automated verification.

## Validation Process

1. Read the original brief
2. Read the requirements checklist
3. Read ALL task files
4. For EACH requirement in the checklist:
   - Find the task(s) that address it
   - Verify the verification command ACTUALLY EXECUTES the requirement
   - Check for semantic equivalence, not just structural presence

## Automatic Failures

Flag as WEAK COVERAGE if verification:
- Checks file existence instead of running tests
- Checks code presence instead of executing code
- Says 'manual verification required' for automatable checks
- Substitutes simpler proxy checks for actual requirement

## Output

Create `.working/colony/{project}/resources/validation-report.md`:

```markdown
# Requirement Coverage Report

## Coverage Summary
- Total requirements: {N}
- Covered (automated): {X}
- Missing: {Y}
- Weak coverage: {Z}

## Detailed Analysis

### ✅ Covered Requirements
| Req | Task | How Verified |
|-----|------|--------------|
| R1: Tests pass | T019 | Verification runs `npm test` |

### ❌ Missing Requirements
| Req | Issue | Suggested Fix |
|-----|-------|---------------|
| R2: API returns 200 | No task calls the endpoint | Add curl check to T015 |

### ⚠️ Weak Coverage (MUST FIX)
| Req | Task | Issue |
|-----|------|-------|
| R3: Build succeeds | T016 | Verification checks config exists, doesn't run build |
```

IMPORTANT: Weak coverage is NOT acceptable. If verification doesn't
EXECUTE the requirement, it's the same as missing coverage.

Respond with:
- 'PASS' if all requirements have AUTOMATED coverage
- 'FAIL: {list of gaps}' if any missing or weak"
)
```

**Process the validation result:**

**If PASS:** Proceed to Step 14.

**If FAIL:**

1. Review the gaps identified
2. Either:
   a. Update task files to add missing verification, OR
   b. Create additional tasks for missing requirements
3. Re-run validation until PASS

**Do NOT skip this step.** The brief is a contract. If requirements aren't covered, execution will produce incomplete results.

## Step 14: Summary

```markdown
## Project Created: {project-name}

Location: .working/colony/{project}/
Tasks: {count}
Milestones: {milestone_count}
Type: {implementation | research}

### Milestones
| Milestone | Tasks | Checkpoint |
|-----------|-------|------------|
| M1: {name} | T001-T003 | review |
| M2: {name} | T004-T007 | review |

### Execution Plan

```
Estimated rounds (concurrency=5):
Round 1: T001, T003 (parallel, no deps)
Round 2: T002, T004 (parallel, deps satisfied)
...
Total: {X} rounds for {Y} tasks ({Z}% parallelization benefit)
```

**M1 - {name}:**
- T001: {name}
- T002, T003 (parallel)

**M2 - {name}:**
- T004: {name}
- T005, T006, T007 (parallel)

### Next Steps
1. Review tasks: `ls .working/colony/{project}/tasks/`
2. Deploy: `/colony-deploy` (pauses at each milestone for review)
3. Autonomous: `/colony-deploy autonomous` (no pauses)
```
