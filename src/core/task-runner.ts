import { Task, TaskRunnerConfig, SubTask, TaskStatus } from '../types';
import { TaskDecomposer } from './decomposer';
import { TaskExecutor } from './executor';
import { Reporter } from './reporter';
import { GitManager } from './git-manager';

/**
 * Main orchestrator for task execution
 */
export class TaskRunner {
  private decomposer: TaskDecomposer;
  private executor: TaskExecutor;
  private reporter: Reporter;
  private gitManager: GitManager;

  constructor(private config: TaskRunnerConfig) {
    this.decomposer = new TaskDecomposer();
    this.executor = new TaskExecutor(config);
    this.reporter = new Reporter(config.reporting);
    this.gitManager = new GitManager(config.gitIntegration);
  }

  /**
   * Run a task from description
   */
  async run(taskDescription: string): Promise<void> {
    const startTime = new Date();
    
    console.log('🚀 Starting Claude Task Runner...\n');
    console.log(`Task: ${taskDescription}\n`);
    
    // Step 1: Decompose task into sub-tasks
    console.log('📋 Decomposing task into sub-tasks...');
    const subTasks = this.decomposer.decompose(taskDescription);
    console.log(`Found ${subTasks.length} sub-tasks\n`);
    
    // Create task object
    const task: Task = {
      id: `task-${Date.now()}`,
      description: taskDescription,
      subTasks,
      config: this.config
    };
    
    // Step 2: Analyze dependencies and create execution groups
    console.log('🔗 Analyzing dependencies...');
    const executionGroups = this.decomposer.getParallelizableGroups(subTasks);
    console.log(`Organized into ${executionGroups.length} execution groups\n`);
    
    // Step 3: Execute tasks group by group
    console.log('⚡ Executing tasks...\n');
    
    for (let i = 0; i < executionGroups.length; i++) {
      const group = executionGroups[i];
      console.log(`Group ${i + 1}/${executionGroups.length}: ${group.length} task(s) in parallel`);
      
      // Execute group in parallel
      await this.executor.executeParallel(group);
      
      // Show progress
      group.forEach(task => {
        const status = this.getStatusSymbol(task.status);
        console.log(`  ${status} ${task.description}`);
      });
      
      console.log('');
      
      // Check if any task failed and we should stop
      const hasFailed = group.some(t => t.status === TaskStatus.FAILED);
      if (hasFailed && this.shouldStopOnFailure()) {
        console.log('❌ Task execution stopped due to failure\n');
        break;
      }
    }
    
    const endTime = new Date();
    
    // Step 4: Generate and display report
    console.log('📊 Generating report...\n');
    const report = this.reporter.generateReport(task, startTime, endTime);
    this.reporter.printReport(report);
    
    // Final status
    if (report.failedSubTasks > 0) {
      console.log('\n❌ Task completed with failures');
      process.exit(1);
    } else {
      console.log('\n✅ Task completed successfully');
    }
  }

  /**
   * Get status symbol for display
   */
  private getStatusSymbol(status: TaskStatus): string {
    switch (status) {
      case TaskStatus.COMPLETED:
        return '✅';
      case TaskStatus.FAILED:
        return '❌';
      case TaskStatus.IN_PROGRESS:
        return '⏳';
      case TaskStatus.SKIPPED:
        return '⏭️';
      default:
        return '⏸️';
    }
  }

  /**
   * Check if execution should stop on first failure
   */
  private shouldStopOnFailure(): boolean {
    // For now, continue on failure
    return false;
  }

  /**
   * Get default configuration
   */
  static getDefaultConfig(): TaskRunnerConfig {
    return {
      maxParallelTasks: 3,
      verificationEnabled: false,
      gitIntegration: {
        enabled: true,
        autoCommit: false,
        autoStage: false,
        branchPrefix: 'task',
        commitMessageTemplate: 'Complete task: {description}'
      },
      reporting: {
        verbose: true,
        outputFormat: 'text'
      }
    };
  }
}
