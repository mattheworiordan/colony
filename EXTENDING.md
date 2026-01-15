# Extending Claude Task Runner

This guide shows how to extend the task runner for custom task execution.

## Custom Task Executor

The default `TaskExecutor` in `src/core/executor.ts` provides a framework for task orchestration but simulates actual execution. Here's how to create a custom executor:

```typescript
import { TaskExecutor } from 'claude-task-runner';
import { SubTask, TaskResult } from 'claude-task-runner';

class CustomExecutor extends TaskExecutor {
  async executeTask(task: SubTask): Promise<TaskResult> {
    task.status = TaskStatus.IN_PROGRESS;
    task.startTime = new Date();
    
    try {
      // Custom execution logic
      const result = await this.performCustomWork(task);
      
      // Use the built-in verification and git integration
      if (this.config.verificationEnabled) {
        result.verification = await this.verifier.verify(task);
      }
      
      if (this.config.gitIntegration.enabled && this.config.gitIntegration.autoCommit) {
        const commitMessage = this.generateCommitMessage(task);
        const commit = await this.gitManager.commit(commitMessage);
      }
      
      task.status = TaskStatus.COMPLETED;
      task.result = result;
      task.endTime = new Date();
      
      return result;
    } catch (error) {
      task.status = TaskStatus.FAILED;
      task.error = error as Error;
      task.endTime = new Date();
      
      return {
        success: false,
        output: `Failed: ${error}`
      };
    }
  }
  
  private async performCustomWork(task: SubTask): Promise<TaskResult> {
    // Your custom implementation here
    // Examples:
    // - Call Claude API
    // - Run shell commands
    // - Execute scripts
    // - Modify files
    
    return {
      success: true,
      output: 'Task completed'
    };
  }
}
```

## Integration Example with Claude API

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { SubTask, TaskResult } from 'claude-task-runner';

class ClaudeExecutor extends TaskExecutor {
  private anthropic: Anthropic;
  
  constructor(config: TaskRunnerConfig) {
    super(config);
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  
  private async performCustomWork(task: SubTask): Promise<TaskResult> {
    const message = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Please complete this task: ${task.description}`
      }],
    });
    
    // Extract and apply changes from Claude's response
    const output = message.content[0].text;
    
    return {
      success: true,
      output
    };
  }
}
```

## Using Custom Executor

```typescript
import { TaskRunner, TaskRunnerConfig } from 'claude-task-runner';

// Create custom task runner with your executor
class CustomTaskRunner extends TaskRunner {
  constructor(config: TaskRunnerConfig) {
    super(config);
    this.executor = new ClaudeExecutor(config);
  }
}

// Use it
const runner = new CustomTaskRunner(config);
await runner.run('Your task description');
```

## Shell Script Executor Example

```typescript
import { execSync } from 'child_process';

class ShellExecutor extends TaskExecutor {
  private async performCustomWork(task: SubTask): Promise<TaskResult> {
    try {
      // Execute shell commands based on task description
      const output = execSync(task.description, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      return {
        success: true,
        output
      };
    } catch (error) {
      throw new Error(`Shell execution failed: ${error}`);
    }
  }
}
```

## Best Practices

1. **Always use the framework's built-in features**:
   - Verification system
   - Git integration
   - Error handling
   - Status tracking

2. **Implement proper error handling**:
   - Catch and report errors appropriately
   - Set task status correctly
   - Provide meaningful error messages

3. **Leverage existing infrastructure**:
   - Use the Verifier for testing and validation
   - Use GitManager for version control
   - Use Reporter for comprehensive logging

4. **Consider task isolation**:
   - Each task should be independent
   - Avoid shared state between tasks
   - Use dependencies for ordering requirements
