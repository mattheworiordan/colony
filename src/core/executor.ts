import { SubTask, TaskStatus, TaskResult, TaskRunnerConfig } from '../types';
import { Verifier } from './verifier';
import { GitManager } from './git-manager';

/**
 * Executes tasks with support for parallel execution
 */
export class TaskExecutor {
  private verifier: Verifier;
  private gitManager: GitManager;

  constructor(private config: TaskRunnerConfig) {
    this.verifier = new Verifier();
    this.gitManager = new GitManager(config.gitIntegration);
  }

  /**
   * Execute a group of tasks in parallel
   */
  async executeParallel(tasks: SubTask[]): Promise<void> {
    const maxParallel = Math.min(tasks.length, this.config.maxParallelTasks);
    const chunks: SubTask[][] = [];
    
    // Split tasks into chunks for parallel execution
    for (let i = 0; i < tasks.length; i += maxParallel) {
      chunks.push(tasks.slice(i, i + maxParallel));
    }
    
    // Execute each chunk in parallel
    for (const chunk of chunks) {
      await Promise.all(chunk.map(task => this.executeTask(task)));
    }
  }

  /**
   * Execute a single task
   * 
   * NOTE: This is a framework implementation that provides task orchestration,
   * dependency management, verification, and reporting. The actual task execution
   * (line 48-51) is intentionally simplified as a simulation. In a production
   * environment, this would be replaced with actual task execution logic such as:
   * - Invoking Claude AI API to perform the task
   * - Running custom scripts or commands
   * - Calling external task execution systems
   * 
   * The framework handles everything around task execution: parallelization,
   * verification, Git integration, and comprehensive reporting.
   */
  async executeTask(task: SubTask): Promise<TaskResult> {
    task.status = TaskStatus.IN_PROGRESS;
    task.startTime = new Date();
    
    try {
      // Simulate task execution - this is where actual task work would be performed
      // In a real implementation, this would invoke Claude API, run scripts, etc.
      const result: TaskResult = {
        success: true,
        output: `Executed: ${task.description}`
      };
      
      // Stage changes if git integration is enabled
      if (this.config.gitIntegration.enabled && this.config.gitIntegration.autoStage) {
        const changes = await this.gitManager.stageChanges();
        result.gitChanges = changes;
      }
      
      // Verify the task if verification is enabled
      if (this.config.verificationEnabled) {
        result.verification = await this.verifier.verify(task);
        
        if (!result.verification.passed) {
          result.success = false;
          task.status = TaskStatus.FAILED;
        }
      }
      
      // Commit changes if configured
      if (this.config.gitIntegration.enabled && 
          this.config.gitIntegration.autoCommit && 
          result.success) {
        const commitMessage = this.generateCommitMessage(task);
        const commit = await this.gitManager.commit(commitMessage);
        if (result.gitChanges) {
          result.gitChanges.commit = commit;
        }
      }
      
      if (result.success) {
        task.status = TaskStatus.COMPLETED;
      }
      
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

  /**
   * Generate commit message for a task
   */
  private generateCommitMessage(task: SubTask): string {
    const template = this.config.gitIntegration.commitMessageTemplate || 
                     'Complete task: {description}';
    return template.replace('{description}', task.description);
  }

  /**
   * Execute tasks sequentially
   */
  async executeSequential(tasks: SubTask[]): Promise<void> {
    for (const task of tasks) {
      await this.executeTask(task);
      
      // Stop if a task fails
      if (task.status === TaskStatus.FAILED) {
        // Mark remaining tasks as skipped
        const remainingIndex = tasks.indexOf(task) + 1;
        tasks.slice(remainingIndex).forEach(t => {
          t.status = TaskStatus.SKIPPED;
        });
        break;
      }
    }
  }
}
