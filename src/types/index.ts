/**
 * Represents a sub-task within a larger coding task
 */
export interface SubTask {
  id: string;
  description: string;
  dependencies: string[]; // IDs of tasks that must complete before this one
  status: TaskStatus;
  result?: TaskResult;
  startTime?: Date;
  endTime?: Date;
  error?: Error;
}

/**
 * Status of a task
 */
export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}

/**
 * Result of a task execution
 */
export interface TaskResult {
  success: boolean;
  output?: string;
  verification?: VerificationResult;
  gitChanges?: GitChanges;
}

/**
 * Verification result for a task
 */
export interface VerificationResult {
  passed: boolean;
  tests?: TestResult[];
  linting?: LintingResult;
  build?: BuildResult;
  message?: string;
}

/**
 * Test execution result
 */
export interface TestResult {
  name: string;
  passed: boolean;
  duration?: number;
  error?: string;
}

/**
 * Linting result
 */
export interface LintingResult {
  passed: boolean;
  errors: number;
  warnings: number;
  details?: string;
}

/**
 * Build result
 */
export interface BuildResult {
  passed: boolean;
  duration?: number;
  error?: string;
}

/**
 * Git changes made by a task
 */
export interface GitChanges {
  branch?: string;
  filesChanged: string[];
  commit?: string;
  diff?: string;
}

/**
 * Configuration for task runner
 */
export interface TaskRunnerConfig {
  maxParallelTasks: number;
  verificationEnabled: boolean;
  gitIntegration: GitIntegrationConfig;
  reporting: ReportingConfig;
}

/**
 * Git integration configuration
 */
export interface GitIntegrationConfig {
  enabled: boolean;
  autoCommit: boolean;
  autoStage: boolean;
  branchPrefix?: string;
  commitMessageTemplate?: string;
}

/**
 * Reporting configuration
 */
export interface ReportingConfig {
  verbose: boolean;
  outputFormat: 'text' | 'json' | 'markdown';
  logFile?: string;
}

/**
 * Main task that contains sub-tasks
 */
export interface Task {
  id: string;
  description: string;
  subTasks: SubTask[];
  config: TaskRunnerConfig;
}

/**
 * Report of task execution
 */
export interface TaskReport {
  taskId: string;
  description: string;
  totalSubTasks: number;
  completedSubTasks: number;
  failedSubTasks: number;
  skippedSubTasks: number;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  subTaskReports: SubTaskReport[];
  summary: string;
}

/**
 * Report for individual sub-task
 */
export interface SubTaskReport {
  id: string;
  description: string;
  status: TaskStatus;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  result?: TaskResult;
  error?: string;
}
