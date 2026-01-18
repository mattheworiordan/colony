# Changelog

## v1.2.0 (2026-01-18)

### Summary

Major release focused on **human control**, **auditability**, and **preventing orchestrator rule violations**. Introduces milestones, active checkpoints, and mandatory subtask creation for feedback.

### New Features

#### 1. Milestone-Aware Planning

Projects are now decomposed into milestones - natural review points where work can be paused and approved.

- `/colony-plan` auto-detects milestones from phases in brief
- Each milestone has a checkpoint type: `review`, `commit`, `branch`, or `pr`
- Milestones stored in state.json and shown in reports
- Orchestrator pauses at milestone boundaries for human approval (unless autonomous)

```json
{
  "milestones": [
    {"id": "M1", "name": "Infrastructure", "tasks": ["T001","T002"], "checkpoint": "review"}
  ]
}
```

#### 2. Active Checkpoints

Non-autonomous mode now **actively asks** for approval instead of passively waiting.

- At milestone boundaries: "Milestone M1 complete. Ready to proceed to M2?"
- Uses AskUserQuestion for explicit approval
- Autonomous mode logs and continues automatically
- Checkpoint behavior is project-dependent (based on brief)

#### 3. Feedback = Subtask (Always)

Every feedback item becomes a formal subtask with full worker + inspector verification.

- No exceptions, no shortcuts - even in autonomous mode
- Subtasks: T009.1, T009.2, etc. with full task structure
- All feedback logged in execution_log
- Autonomous mode skips human approval, not inspector verification

#### 4. Decision Capture

All orchestrator decisions are now logged for audit.

- Parallelization decisions
- Feedback → subtask creation
- Milestone checkpoint approvals
- Autonomous mode overrides

REPORT.md includes "Decisions Made" table for post-run review.

### Fixes

#### 5. Orchestrator Can't Implement Inline

**Structural constraint**: Removed Edit from orchestrator's allowed-tools.

- Orchestrator literally cannot edit files
- Forces worker spawns for any code changes
- Combined with psychological guardrails

#### 6. Enhanced Psychological Guardrails

Restored critical warnings lost in v1.1.0 compression:

- "THIS IS THE STEP WHERE YOU ALWAYS VIOLATE THE RULES" banner
- WHY THIS MATTERS section explaining context pollution
- SELF-CHECK questions before responding to feedback
- Expanded feedback classification examples

### CLI Updates

- `state init` now includes empty `milestones` array
- `state summary` shows milestone status
- `state summary` prints context-aware reminders:
  - Milestone checkpoint alerts when all tasks in a milestone are complete
  - Non-autonomous mode reminders (pause at milestones, create subtasks)
  - Feedback subtask rule reminder if no recent feedback events
- Decision events logged via `state log`

### Model Inheritance

Models inherit from user's Claude session by default:
- `planning`: inherit
- `worker`: inherit
- `inspector`: haiku (faster for verification)

Configure via `~/.colony/config.json` if needed.

### Why This Matters

Colony's value is **quality + verifiability**, not speed. These changes ensure:

1. **Human control** - Active checkpoints, not passive waiting
2. **Auditability** - Every decision logged, every feedback tracked
3. **No shortcuts** - All feedback creates verified subtasks, even in autonomous mode
4. **Enforced separation** - Orchestrator coordinates, workers implement

---

## v1.1.0 (2026-01-17)

### Performance Improvements

**2.6x faster execution** compared to v1.0.0, closing the gap with Ralph from 4.3x slower to just 1.7x slower.

| Metric | v1.0.0 | v1.1.0 | Change |
|--------|--------|--------|--------|
| Runtime | ~55 min | ~21 min | 2.6x faster |
| Total tokens | ~76k | ~70k | 8% reduction |
| Tasks generated | 9 | 6 | 33% fewer |
| Prompt size | 2,726 lines | 929 lines | 66% smaller |
| First-attempt success | 100% | 100% | Maintained |

### What Changed

1. **CLI for state management** - New `colony` CLI (`bin/colony`) replaces JSON file reads/writes with simple commands like `colony state list`, `colony state task-complete`. Reduces token usage and simplifies orchestration.

2. **Prompt compression** - Removed redundant warnings, condensed examples, eliminated verbose instructions. Commands are now 66% smaller while maintaining clarity.

3. **Configurable models** - Inspector defaults to Haiku (faster, cheaper for verification). All models configurable via `~/.colony/config.json`.

4. **Better task decomposition** - Improved planner creates fewer, more focused tasks. Quality over quantity.

5. **Plugin-relative paths** - Commands use `${CLAUDE_PLUGIN_ROOT}/bin/colony` for reliable CLI access across any installation.

### Why It's Faster

- **Less token overhead**: Compressed prompts mean faster parsing and less context used
- **Efficient state management**: CLI operations are faster than reading/writing JSON blobs
- **Smarter task sizing**: Fewer tasks = fewer agent spawns = less overhead
- **Haiku for verification**: Inspector tasks are simpler and don't need expensive models

## v1.0.0 (2026-01-16)

Initial release with:
- Task decomposition via `/colony-plan`
- Parallel execution via `/colony-run`
- Worker and Inspector agents
- Project status tracking
