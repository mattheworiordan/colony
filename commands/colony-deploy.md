---
name: colony-deploy
description: Deploy workers with smart parallelization and verification
version: 1.6.0
status: active

# Claude Code command registration
allowed-tools: Read, Write, Bash, Task, Grep, Glob, AskUserQuestion
---

# Deploy Colony

Execute tasks from a colony project using sub-agents with verification.

## Core Principles

1. **COORDINATION ONLY** - You spawn workers, never implement inline
2. **Correctness over speed** - Get it right, parallelization is a bonus
3. **CLI for state** - Use `colony` CLI for state operations (saves tokens)
4. **Isolated execution** - Each task runs in fresh sub-agent context
5. **Independent verification** - Different agent verifies completion

<critical>
YOU ARE AN ORCHESTRATOR, NOT A WORKER.

When users provide feedback requiring implementation:
- NEVER read files to debug
- NEVER edit files directly
- NEVER run builds or tests
- NEVER make "quick fixes"

Your context is precious. Spawn workers for implementation. Always.
</critical>

## Step 0: Verify CLI

```bash
# Verify colony CLI is available (Claude Code's Bash doesn't inherit user PATH)
[[ -x "${CLAUDE_PLUGIN_ROOT}/bin/colony" ]] && echo "colony CLI ready" || echo "ERROR: colony CLI not found"
```

## Step 0.5: Get Model Configuration

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony config init 2>/dev/null || true
worker_model=$(${CLAUDE_PLUGIN_ROOT}/bin/colony get-model worker)
inspector_model=$(${CLAUDE_PLUGIN_ROOT}/bin/colony get-model inspector)

# Get session model from Claude Code settings (for worker inheritance)
session_model=$(jq -r '.model // "sonnet"' "$HOME/.claude/settings.json" 2>/dev/null || echo "sonnet")
```

**Resolve worker model:**
- If `worker_model` is "inherit" → use `session_model` (e.g., "opus")
- Otherwise use the explicit `worker_model`

<critical>
ORCHESTRATOR ALWAYS RUNS IN-SESSION.

Do NOT delegate to a sub-orchestrator via Task(). Sub-agents cannot spawn
their own sub-agents, so a delegated orchestrator cannot spawn workers.

The "orchestrator" config setting is deprecated and ignored.
</critical>

Continue to Step 1.

## Step 1: Initialize

```bash
# Ensure config exists (creates ~/.colony/config.json if missing)
${CLAUDE_PLUGIN_ROOT}/bin/colony config init 2>/dev/null || true

# Find projects
${CLAUDE_PLUGIN_ROOT}/bin/colony state list
```

If `$ARGUMENTS` specifies a project, use that. If one project exists, use it. If multiple, ask. If none: `"No projects. Use /colony-mobilize to create one."`

## Step 2: Load State

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state get {project}
${CLAUDE_PLUGIN_ROOT}/bin/colony state get {project} tasks
```

Read `context.md` directly for project rules:
```
.working/colony/{project}/context.md
```

### 2.1: Resume Check

```bash
# Check for tasks stuck in "running"
${CLAUDE_PLUGIN_ROOT}/bin/colony state get {project} tasks | jq '[to_entries[] | select(.value.status == "running")]'
```

If tasks are "running":
- Running >30 min: `${CLAUDE_PLUGIN_ROOT}/bin/colony state task {project} {id} pending`
- Running <30 min: Spawn worker to continue

## Step 3: Git Pre-Flight (if applicable)

Skip if `state.json.git.strategy == "not_applicable"`.

```bash
git status --porcelain
git branch --show-current
```

If dirty: STOP and ask user to commit/stash. If wrong branch: ask to switch or continue.

## Step 4: Concurrency & Mode

Default concurrency: 5. Get from state: `${CLAUDE_PLUGIN_ROOT}/bin/colony state get {project} concurrency`

**Autonomous mode** - if user says "autonomous" or "auto":
```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} autonomous_mode true
```

Autonomous behavior:
- Continue past failures (mark failed, move on)
- No pause for human checkpoints
- Max 3 retries per task, stop if >50% fail

## Step 5: Execution Loop (STATELESS)

<critical>
THIS LOOP IS STATELESS. Every iteration:
1. Read fresh state from CLI (don't trust memory)
2. Decide action based ONLY on state
3. Execute action
4. Loop

DO NOT rely on memory from previous iterations.
The CLI is your source of truth - re-read it every time.
</critical>

```
REPEAT until all tasks complete/failed/blocked:
```

### 5.0: Loop Start (EVERY ITERATION)

**Always re-read state at the start of each iteration:**

```bash
# FRESH STATE - don't rely on what you remember
${CLAUDE_PLUGIN_ROOT}/bin/colony state summary {project}

# Get counts for decisions
task_stats=$(${CLAUDE_PLUGIN_ROOT}/bin/colony state get {project} tasks | jq '{
  complete: [to_entries[] | select(.value.status == "complete")] | length,
  failed: [to_entries[] | select(.value.status == "failed")] | length,
  blocked: [to_entries[] | select(.value.status == "blocked")] | length,
  pending: [to_entries[] | select(.value.status == "pending")] | length,
  running: [to_entries[] | select(.value.status == "running")] | length
}')
completed_count=$(echo "$task_stats" | jq '.complete')
```

**State validation:** If `running` > 0 and they've been running >30 min, reset them:
```bash
# Check for stuck tasks (running >30 min) - handled by Resume Check in Step 2.1
```

### 5.0a: Rule Echo (Every 3 Tasks)

**If `completed_count` is a multiple of 3 (3, 6, 9, ...), echo the core rule:**

```
════════════════════════════════════════════════════════════════
RULE REFRESH (${completed_count} tasks complete)

YOU ARE AN ORCHESTRATOR, NOT A WORKER.
• Read state → Pick task → Spawn worker → Process result → Loop
• NEVER implement inline, NEVER debug, NEVER "quick fix"
• If you're about to read code or run tests: STOP → spawn worker

Your context should stay clean for coordination.
Workers have fresh context for implementation.
════════════════════════════════════════════════════════════════
```

### 5.1: Get Ready Tasks (CLI decides)

```bash
ready_tasks=$(${CLAUDE_PLUGIN_ROOT}/bin/colony next-batch {project} {concurrency})
```

This returns space-separated task IDs that are ready. **CLI handles parallelization logic** - it considers:
- Dependencies (only returns tasks with deps met)
- Serial groups (won't return conflicting tasks)
- File conflicts (encodes in task definitions)

**You just execute what it gives you.** Don't second-guess the CLI.

### 5.2: Check Completion

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony is-complete {project}
```

Returns `true` or `false`.

- **If `true` or `ready_tasks` is empty:** Check why
  - All complete → Step 6
  - Some failed/blocked → Step 6 with summary
  - Pending but deps not met → Wait or Step 6

- **If `false` and tasks ready:** Continue to 5.3

### 5.3: Execute Task Batch

For each task in `ready_tasks`:

a) **Mark running and get model:**
```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state task-start {project} {task-id}
worker_model=$(${CLAUDE_PLUGIN_ROOT}/bin/colony get-model worker)
${CLAUDE_PLUGIN_ROOT}/bin/colony state log {project} "task_started" '{"task": "{task-id}", "model": "'"$worker_model"'"}'
```

b) **Get git context for worker:**
```bash
# Recent commits for context (helps worker understand recent changes)
git_history=$(git log --oneline -10 2>/dev/null || echo "No git history")

# Check if LEARNINGS.md exists
learnings_file=".working/colony/{project}/LEARNINGS.md"
if [[ -f "$learnings_file" ]]; then
  learnings=$(cat "$learnings_file")
else
  learnings="No learnings yet."
fi
```

c) **Spawn worker sub-agent** with `subagent_type="colony:worker"` and model from config:

```
Execute this task following the project context.

═══════════════════════════════════════════════════════════
TASK BUNDLE
═══════════════════════════════════════════════════════════

## Logging
- Attempt: {attempt} of 3
- Log Path: .working/colony/{project}/logs/{task-id}_LOG.md

## Task
{Content of tasks/{task-id}.md}

## Project Context (condensed if >100 lines)
{Content of context.md}

## Recent Git History (for context)
{git_history}

## Project Learnings (patterns discovered by previous tasks)
{learnings}

═══════════════════════════════════════════════════════════

IMPORTANT: Write your work log to the Log Path above using the Write tool.
Include: what you did, files changed, any patterns or conventions you discovered.

Read source files using Read tool. Complete and respond:

{"status": "DONE", "summary": "...", "files_changed": [...], "learnings": ["pattern or convention discovered"]}
or
{"status": "STUCK", "reason": "...", "attempted": [...], "need": "..."}
```

d) If parallel batch: spawn all workers together, wait for all.

### 5.4: Process Results

**Parallel inspection:** If multiple workers completed in a parallel batch, spawn their inspectors in parallel too. This is safe because:
- Inspectors are read-only (verify, don't modify code)
- Each inspector has its own log file
- Tests should be isolated
- Respects same parallelization rules as workers (same-file tasks stay serial)

**If DONE:**

═══════════════════════════════════════════════════════════════════════════════
⚠️  CRITICAL: YOU MUST SPAWN AN INSPECTOR. DO NOT SKIP THIS STEP.
═══════════════════════════════════════════════════════════════════════════════

The CLI will REJECT task-complete if no inspection_started event exists.
You CANNOT mark a task complete without spawning an inspector first.

**Step A: Log inspection event (REQUIRED - CLI enforces this)**

```bash
inspector_model=$(${CLAUDE_PLUGIN_ROOT}/bin/colony get-model inspector)
${CLAUDE_PLUGIN_ROOT}/bin/colony state log {project} "inspection_started" '{"task": "{task-id}", "model": "'"$inspector_model"'"}'
```

**Step B: Get diff for inspector**

Before spawning inspector, get the diff for changed files:

```bash
# Get diff for files changed by this task
git diff HEAD -- {files_changed} > /tmp/task_diff.txt
task_diff=$(cat /tmp/task_diff.txt)
```

**Step C: Spawn inspector (REQUIRED)**

Spawn inspector with `subagent_type="colony:inspector"` and model from config:

```
Verify this task was completed correctly.

═══════════════════════════════════════════════════════════
VERIFICATION REQUEST
═══════════════════════════════════════════════════════════

Task: {task-id}
Log: .working/colony/{project}/logs/{task-id}_LOG.md
Task file: .working/colony/{project}/tasks/{task-id}.md

Worker summary: {one-line from worker}
Files changed: {list}

═══════════════════════════════════════════════════════════
DIFF OF CHANGES (use this first - avoid re-reading files)
═══════════════════════════════════════════════════════════

{task_diff}

═══════════════════════════════════════════════════════════
VERIFICATION PROCESS
═══════════════════════════════════════════════════════════

**Start with the diff above. Only read full files if you need more context.**

1. **RUN the verification command from task file**
   - This is the PRIMARY verification
   - If it's a complex command (starts servers, runs Playwright, etc.), RUN IT
   - Do NOT substitute a simpler check
   - If the command fails, the task FAILS

2. **Run linter on changed files**
   - e.g., `npx xo {files}` or project lint command
   - Lint errors = FAIL

3. **Check each acceptance criterion using the diff**
   - Review the diff to confirm the implementation matches requirements
   - "Tab navigation works" → Actually test tab navigation (click, verify)
   - "0 pixel diff" → Actually check the diff output
   - "Returns 200" → Actually curl the endpoint

4. **If uncertain, expand context**
   - If the diff doesn't provide enough context to verify correctness
   - If you suspect the code may be in the wrong place in the file
   - If you see something suspicious that needs more investigation
   - THEN use the Read tool to get the full file

═══════════════════════════════════════════════════════════
CRITICAL: VERIFICATION MEANS ACTUALLY TESTING
═══════════════════════════════════════════════════════════

If the acceptance criteria says "visual tests pass with 0 diff",
you must:
- Run the visual test script
- Check the output shows 0 diff
- If diff > 0, FAIL with the actual diff count

Do NOT:
- Just check if the test script file exists
- Assume "TypeScript compiles" means visual tests pass
- Substitute simpler verification
- Re-read files unnecessarily when the diff is sufficient

The task file's verification command is the source of truth.
RUN IT and check the result.

═══════════════════════════════════════════════════════════

IMPORTANT: Only verify files listed above. Ignore other files that may have been
created by parallel tasks - they will be verified separately.

AFTER VERIFICATION: Append your findings to the task log file:
.working/colony/{project}/logs/{task-id}_LOG.md

Include verification results and any learnings (patterns, conventions, gotchas).

Respond:
{"result": "PASS", "summary": "...", "learnings": ["any patterns or conventions discovered"]}
or
{"result": "FAIL", "issues": [...], "suggestion": "...", "learnings": ["what was learned from the failure"]}
```

**If PASS:** Validate artifacts exist, append learnings, then mark complete:

```bash
# Append learnings to LEARNINGS.md (compound engineering)
learnings_file=".working/colony/{project}/LEARNINGS.md"
if [[ ! -f "$learnings_file" ]]; then
  echo "# Project Learnings" > "$learnings_file"
  echo "" >> "$learnings_file"
  echo "Patterns, conventions, and gotchas discovered during execution." >> "$learnings_file"
  echo "" >> "$learnings_file"
fi

# Append learnings from worker and inspector (if any)
# Format: - {learning} (T001)
for learning in {worker_learnings} {inspector_learnings}; do
  echo "- $learning ({task-id})" >> "$learnings_file"
done

${CLAUDE_PLUGIN_ROOT}/bin/colony state task-complete {project} {task-id}
${CLAUDE_PLUGIN_ROOT}/bin/colony state log {project} "task_complete" '{"task": "{task-id}", "summary": "{summary}", "files_changed": {files_list}, "learnings": {learnings_list}, "worker_model": "'"$worker_model"'", "inspector_model": "'"$inspector_model"'"}'
```

**If FAIL:**
```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state task-fail {project} {task-id} "{error}"
${CLAUDE_PLUGIN_ROOT}/bin/colony state log {project} "task_failed" '{"task": "{task-id}", "issues": {issues_list}, "suggestion": "{suggestion}"}'
```

### Retry and Give-Up Logic

<critical>
The worker+inspector loop has hard limits to prevent infinite retries.
After exhausting retries, STOP and report - do not continue silently.
</critical>

**Per-task retry limits:**

| Situation | Attempts < 3 | Attempts = 3 | Attempts > 3 |
|-----------|--------------|--------------|--------------|
| Worker STUCK | Reset to pending, retry | Mark blocked, report to user | N/A (blocked) |
| Inspector FAIL | Reset to pending, retry with feedback | Mark failed, report to user | N/A (failed) |

**When retrying, include failure context:**

The worker on retry attempt N should receive:
```
Previous attempts: {N-1}
Last failure reason: {inspector feedback or STUCK reason}
What was tried: {summary of previous attempt}

FIX THE UNDERLYING ISSUE. Do not just retry the same approach.
```

**Milestone-level failure threshold:**

If **>50% of tasks in a milestone fail** after all retries:
1. STOP execution
2. Report: "Milestone {M} has critical failure rate ({X}% failed)"
3. List all failed tasks with reasons
4. Ask user: "Continue anyway?" or "Abort?"

**Session-level circuit breaker:**

If **5 consecutive tasks fail** across any milestones:
1. STOP execution immediately
2. Report: "Circuit breaker triggered - 5 consecutive failures"
3. This likely indicates a systemic issue (wrong environment, missing dependency)
4. Ask user to investigate before continuing

**Stuck vs Failed distinction:**
- **STUCK**: Worker couldn't complete (missing info, blocked by external factor)
- **FAILED**: Worker completed but inspector rejected (quality issue)

Both consume retry attempts, but STUCK may indicate the task definition needs revision.

**If STUCK:**
- attempts < 3 → pending, retry with more context
- attempts >= 3 → blocked, ask user "Is the task definition correct?"

### 5.4a: Artifact Validation

**Before marking complete, verify artifacts exist:**

```bash
ls -la .working/colony/{project}/logs/{task-id}_LOG.md
```

For VISUAL tasks:
```bash
ls .working/colony/{project}/screenshots/{prefix}_*.png | wc -l
```

If missing: DO NOT mark complete, retry task.

### 5.5: Update Blocked Dependencies

For tasks depending on failed/blocked task:
```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state task {project} {dependent-id} blocked
```

### 5.6: Progress Report

After each batch, show progress with a proportional bar:

```
Progress: {project}
████████████░░░░░░░░ 60% (12/20)

This round:
✅ T003: Add auth - PASSED
❌ T005: Add OAuth - FAILED

Next: T006, T007 (ready)
```

**Progress bar calculation:** 20 characters total. Filled = (complete/total) × 20.
- 44% (11/25) → `█████████░░░░░░░░░░░` (9 filled, 11 empty)
- 60% (12/20) → `████████████░░░░░░░░` (12 filled, 8 empty)
- 100% → `████████████████████`

### 5.6a: Milestone Checkpoint

**Check if milestone complete:**

```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state get {project} milestones
```

If all tasks in current milestone are complete:

1. **Log the decision:**
```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state log {project} "milestone_complete" '{"milestone": "M1", "tasks_completed": 3}'
```

2. **Mark milestone complete:**
```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} 'milestones[0].status' '"complete"'
```

3. **Execute checkpoint based on type:**

**Principle:** Autonomous mode skips human approval, not verification. Inspector verification always happens. The difference is whether we pause for user confirmation.

| Checkpoint | Autonomous Mode | Non-Autonomous Mode |
|------------|-----------------|---------------------|
| `review` | Log and continue | **PAUSE** - Ask user to approve |
| `commit` | Auto-commit, continue | Auto-commit, continue |
| `branch` | Create branch, continue | Create branch, ask to continue |
| `pr` | Log for later, continue | Create PR, pause |

**Non-autonomous mode (default):**

First, gather context for the user to review:

```bash
# Get files changed
git status --porcelain

# Get diff summary
git diff --stat HEAD
```

Then present a complete checkpoint summary:

```
═══════════════════════════════════════════════════════════════
MILESTONE COMPLETE: M1 - Infrastructure Setup
═══════════════════════════════════════════════════════════════

Tasks completed:
  ✅ T001: {name} - {one-line summary from log}
  ✅ T002: {name} - {one-line summary from log}
  ✅ T003: {name} - {one-line summary from log}

Files changed:
  {git diff --stat output, e.g.:}
  src/kitty-protocol.ts   | 120 ++++++++++++
  src/parse-keypress.ts   |  45 +++--
  3 files changed, 165 insertions(+), 12 deletions(-)

How to verify (pick relevant ones):
  • Web app: Visit http://localhost:3000/{path} - you should see {expected}
  • API: Run `curl localhost:3000/api/{endpoint}` - expect {response}
  • CLI: Run `{command}` - should output {expected}
  • Tests: `npm test` shows {N} passing
  • Visual: Look for {specific UI element} in {location}

Out of scope (don't worry about):
  • {Thing that looks broken but isn't part of this milestone}
  • {Known issue being addressed in later milestone}

Proposed commit (if commit_strategy is phase):
  feat({scope}): {milestone description}

  - T001: {summary}
  - T002: {summary}
  - T003: {summary}

Next milestone: M2 - Core Implementation
  Ready tasks: T004, T005 (can run in parallel)

═══════════════════════════════════════════════════════════════
```

Use AskUserQuestion with options:
- "Continue" - Proceed to next milestone (same context, faster)
- "Continue with fresh context" - Spawn fresh orchestrator for next milestone (slower but prevents drift)
- "Review files first" - Let user inspect before deciding
- "Pause" - Stop here

**If user selects "Continue with fresh context":**
```bash
${CLAUDE_PLUGIN_ROOT}/bin/colony state log {project} "milestone_handoff" '{"from": "M{N}", "to": "M{N+1}", "reason": "user_requested_fresh_context"}'
```

Then spawn fresh orchestrator:
```
Task(
  subagent_type: "general-purpose",
  model: "{orchestrator_model}",
  prompt: "Continue Colony orchestration for project: {project}

  Read and follow: {CLAUDE_PLUGIN_ROOT}/commands/colony-deploy.md
  Start from Step 1. Previous milestone M{N} complete, continue with M{N+1}.

  Config: worker={worker_model}, inspector={inspector_model}, autonomous={true/false}"
)
```
Then exit (return control to spawned agent).

**Autonomous mode:** Log completion, proceed to next milestone automatically.

### 5.7: Git Commit (if applicable)

Skip if `git.strategy == "not_applicable"`.

Based on `commit_strategy`:
- **task**: Commit after each verified task
- **phase**: Commit at milestone boundaries (after 5.8a milestone checkpoint)
- **end**: No commits during execution
- **manual**: Prompt user after each phase

**For phase/task commits, execute:**
```bash
git add -A
git commit -m "feat({scope}): {description}

Tasks: {list of completed tasks}

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### 5.8: User Checkpoint

**Classify user response:**

| Category | Examples | Action |
|----------|----------|--------|
| A: Info question | "What does X do?", "Show status" | Answer briefly, continue |
| B: Command | "pause", "set concurrency 3", "skip T005" | Execute command, continue |
| C: Implementation | "I get 404", "Fix X", "This shouldn't be committed", "Add Y to gitignore" | **STOP → Go to 5.9** |

<critical>
SELF-CHECK before responding:

Are you about to:
- Read a file to understand an issue?
- Run a command to debug something?
- Make a "quick" edit?
- Investigate an error?

If YES to any: YOU ARE IN CATEGORY C.
Stop immediately. Go to Step 5.9. Spawn a worker.
</critical>

### 5.9: Handle User Feedback

```
═══════════════════════════════════════════════════════════════
!! THIS IS THE STEP WHERE YOU ALWAYS VIOLATE THE RULES
!! READ EVERY WORD BEFORE RESPONDING
═══════════════════════════════════════════════════════════════
```

**WHY THIS MATTERS:**

Your context is precious. Right now it contains:
  + Project state and task dependencies
  + Execution history and parallelization decisions
  + Git strategy and commit tracking

If you implement inline, your context fills with:
  - File contents (hundreds of lines)
  - Error messages and stack traces
  - Multiple edit attempts

After 3-4 feedback cycles, you'll lose track of the project.
Workers have FRESH context. They're designed for implementation.
You're designed for coordination. Stay in your lane.

```
═══════════════════════════════════════════════════════════════
```

**The procedure:**

1. **Parse feedback into items:**
   ```
   Feedback items:
   • 404 on dev server
   • .next in git
   ```

2. **Ask if more:** "Any other feedback?"

3. **Create subtasks for EVERY item:**

   Each feedback item becomes a formal subtask with full verification:
   - ID: `T{last}.{sequence}` (e.g., T009.1, T009.2)
   - Full task structure (context, criteria, verification)
   - Worker + Inspector flow
   - Logged in state.json

   ```bash
   # Create subtask file
   # Write to .working/colony/{project}/tasks/T009.1.md

   # Add to state
   ${CLAUDE_PLUGIN_ROOT}/bin/colony state set {project} 'tasks.T009.1' '{"status":"pending","attempts":0,"is_subtask":true,"parent":"T009","created_from":"user_feedback"}'

   # Log the decision
   ${CLAUDE_PLUGIN_ROOT}/bin/colony state log {project} "feedback_subtask_created" '{"feedback": "add .next to gitignore", "subtask": "T009.1"}'
   ```

4. **Execute subtasks:** Run through normal worker + inspector flow.

5. **After completion:** Pause for user review.

**No exceptions. No shortcuts.**

Even in autonomous mode, feedback creates subtasks with full worker + inspector verification. Autonomous mode skips human approval pauses, not bot verification.

### 5.10: Context Health Check

After 5+ feedback cycles, or when you notice:
- Your responses slowing down or getting confused
- Losing track of task dependencies
- Forgetting which tasks are complete
- Confusion about project state

Tell the user:

```
Context is getting heavy. I recommend restarting with:
  /colony-deploy {project}

All state is preserved in CLI - execution will resume from current position.
```

**Why this works:**
- CLI state management preserves everything (tasks, status, logs)
- Fresh /colony-deploy reads state.json and continues
- You get fresh context with all the rules intact
- No work is lost, just context is refreshed

**Signs you need this:**
- You've processed more than 5 feedback items in one session
- Multiple milestones have passed without restart
- User has given complex multi-part feedback

```
END REPEAT
```

## Step 6: Final Summary

```
════════════════════════════════════════════════════════════
Execution Complete: {project}

Total: {n} | ✅ {complete} | ❌ {failed} | 🚫 {blocked}

{If git active:}
Branch: {branch}
Commits: {count}

{List completed/failed tasks}
════════════════════════════════════════════════════════════
```

## Step 7: Generate Report (MANDATORY)

Write to `.working/colony/{project}/REPORT.md`:

```markdown
# Colony Report: {project}

Generated: {timestamp}
Outcome: {COMPLETE|PARTIAL|FAILED}
Tasks: {passed} passed, {failed} failed, {blocked} blocked
Milestones: {completed}/{total}

## Milestones
| Milestone | Status | Tasks |
|-----------|--------|-------|
| M1: {name} | complete | T001-T003 |
| M2: {name} | partial | T004-T007 |

## Results by Task
| Task | Status | Attempts |
|------|--------|----------|
...

## Decisions Made
{From execution_log, filtered for decision events}

| Time | Type | Decision | Details |
|------|------|----------|---------|
| 14:30 | parallelization | T001+T002 parallel | No file conflicts |
| 15:00 | feedback | Created T009.1 | User: "add .next to gitignore" |
| 15:30 | milestone | M1 approved | User confirmed |

## Feedback Addressed
| Feedback | Subtask | Status |
|----------|---------|--------|
| "add .next to gitignore" | T009.1 | complete |
| "404 on dev server" | T009.2 | complete |

## Findings
### Critical Issues
### Recurring Patterns

## Recommended Actions
...
```

**Always generate the report, even for partial/failed runs.**

## Recovery

If interrupted, re-run `/colony-deploy`. Tasks "running" >30 min reset to pending.

## User Commands

| Command | Effect |
|---------|--------|
| "pause" | Stop after current batch |
| "autonomous" | Switch to autonomous mode |
| "set concurrency to N" | Adjust parallel agents |
| "skip T005" | Mark skipped, continue |
| "retry T005" | Reset to pending |
| "commit now" | Force commit |
| {feedback} | Triggers 5.9 |

## Rules Summary

**STATELESS LOOP (Most Important):**
1. **Re-read state EVERY iteration** - Don't trust memory, CLI is truth
2. **Rule echo every 3 tasks** - Refresh core rules periodically
3. **CLI decides parallelization** - Use `next-batch`, don't second-guess

**Core Rules:**
4. NEVER verify without inspector PASS
5. NEVER mark complete without artifacts
6. **NEVER implement inline** - spawn workers for ALL implementation
7. **Feedback = subtask** - Every feedback item becomes a formal subtask
8. **Milestone checkpoints** - Pause at boundaries (unless autonomous)
9. **Log decisions** - All decisions logged to execution_log
