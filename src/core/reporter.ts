import { TaskReport, SubTaskReport, Task, SubTask, TaskStatus, ReportingConfig } from '../types';
import * as fs from 'fs';

/**
 * Generates comprehensive reports for task execution
 */
export class Reporter {
  constructor(private config: ReportingConfig) {}

  /**
   * Generate a report from a task
   */
  generateReport(task: Task, startTime: Date, endTime: Date): TaskReport {
    const subTaskReports = task.subTasks.map(st => this.generateSubTaskReport(st));
    
    const report: TaskReport = {
      taskId: task.id,
      description: task.description,
      totalSubTasks: task.subTasks.length,
      completedSubTasks: task.subTasks.filter(st => st.status === TaskStatus.COMPLETED).length,
      failedSubTasks: task.subTasks.filter(st => st.status === TaskStatus.FAILED).length,
      skippedSubTasks: task.subTasks.filter(st => st.status === TaskStatus.SKIPPED).length,
      startTime,
      endTime,
      duration: endTime.getTime() - startTime.getTime(),
      subTaskReports,
      summary: this.generateSummary(task, subTaskReports)
    };
    
    return report;
  }

  /**
   * Generate report for a sub-task
   */
  private generateSubTaskReport(subTask: SubTask): SubTaskReport {
    const report: SubTaskReport = {
      id: subTask.id,
      description: subTask.description,
      status: subTask.status,
      startTime: subTask.startTime,
      endTime: subTask.endTime
    };
    
    if (subTask.startTime && subTask.endTime) {
      report.duration = subTask.endTime.getTime() - subTask.startTime.getTime();
    }
    
    if (subTask.result) {
      report.result = subTask.result;
    }
    
    if (subTask.error) {
      report.error = subTask.error.message;
    }
    
    return report;
  }

  /**
   * Generate summary text
   */
  private generateSummary(task: Task, reports: SubTaskReport[]): string {
    const completed = reports.filter(r => r.status === TaskStatus.COMPLETED).length;
    const failed = reports.filter(r => r.status === TaskStatus.FAILED).length;
    const skipped = reports.filter(r => r.status === TaskStatus.SKIPPED).length;
    const total = reports.length;
    
    let summary = `Task "${task.description}" completed.\n`;
    summary += `Total sub-tasks: ${total}\n`;
    summary += `Completed: ${completed}\n`;
    summary += `Failed: ${failed}\n`;
    summary += `Skipped: ${skipped}\n`;
    
    if (failed > 0) {
      summary += '\nFailed tasks:\n';
      reports.filter(r => r.status === TaskStatus.FAILED).forEach(r => {
        summary += `- ${r.description}: ${r.error || 'Unknown error'}\n`;
      });
    }
    
    return summary;
  }

  /**
   * Format report as text
   */
  formatAsText(report: TaskReport): string {
    let output = '\n';
    output += '='.repeat(80) + '\n';
    output += `TASK EXECUTION REPORT\n`;
    output += '='.repeat(80) + '\n\n';
    
    output += `Task: ${report.description}\n`;
    output += `Task ID: ${report.taskId}\n`;
    output += `Start Time: ${report.startTime.toISOString()}\n`;
    output += `End Time: ${report.endTime?.toISOString() || 'N/A'}\n`;
    output += `Duration: ${this.formatDuration(report.duration || 0)}\n\n`;
    
    output += `Summary:\n`;
    output += `-`.repeat(80) + '\n';
    output += `Total Sub-tasks: ${report.totalSubTasks}\n`;
    output += `Completed: ${report.completedSubTasks}\n`;
    output += `Failed: ${report.failedSubTasks}\n`;
    output += `Skipped: ${report.skippedSubTasks}\n\n`;
    
    output += `Sub-tasks:\n`;
    output += `-`.repeat(80) + '\n';
    
    report.subTaskReports.forEach((subReport, index) => {
      output += `\n${index + 1}. ${subReport.description}\n`;
      output += `   Status: ${subReport.status}\n`;
      
      if (subReport.duration) {
        output += `   Duration: ${this.formatDuration(subReport.duration)}\n`;
      }
      
      if (subReport.result) {
        output += `   Success: ${subReport.result.success}\n`;
        
        if (subReport.result.verification) {
          output += `   Verification: ${subReport.result.verification.passed ? 'PASSED' : 'FAILED'}\n`;
        }
        
        if (subReport.result.gitChanges && subReport.result.gitChanges.filesChanged.length > 0) {
          output += `   Files Changed: ${subReport.result.gitChanges.filesChanged.join(', ')}\n`;
        }
      }
      
      if (subReport.error) {
        output += `   Error: ${subReport.error}\n`;
      }
    });
    
    output += '\n' + '='.repeat(80) + '\n';
    output += report.summary;
    output += '='.repeat(80) + '\n';
    
    return output;
  }

  /**
   * Format report as JSON
   */
  formatAsJson(report: TaskReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Format report as Markdown
   */
  formatAsMarkdown(report: TaskReport): string {
    let output = '# Task Execution Report\n\n';
    
    output += `## Task: ${report.description}\n\n`;
    output += `- **Task ID**: ${report.taskId}\n`;
    output += `- **Start Time**: ${report.startTime.toISOString()}\n`;
    output += `- **End Time**: ${report.endTime?.toISOString() || 'N/A'}\n`;
    output += `- **Duration**: ${this.formatDuration(report.duration || 0)}\n\n`;
    
    output += `## Summary\n\n`;
    output += `| Metric | Count |\n`;
    output += `|--------|-------|\n`;
    output += `| Total Sub-tasks | ${report.totalSubTasks} |\n`;
    output += `| Completed | ${report.completedSubTasks} |\n`;
    output += `| Failed | ${report.failedSubTasks} |\n`;
    output += `| Skipped | ${report.skippedSubTasks} |\n\n`;
    
    output += `## Sub-tasks\n\n`;
    
    report.subTaskReports.forEach((subReport, index) => {
      output += `### ${index + 1}. ${subReport.description}\n\n`;
      output += `- **Status**: ${this.getStatusEmoji(subReport.status)} ${subReport.status}\n`;
      
      if (subReport.duration) {
        output += `- **Duration**: ${this.formatDuration(subReport.duration)}\n`;
      }
      
      if (subReport.result) {
        output += `- **Success**: ${subReport.result.success ? '✅' : '❌'}\n`;
        
        if (subReport.result.verification) {
          output += `- **Verification**: ${subReport.result.verification.passed ? '✅ PASSED' : '❌ FAILED'}\n`;
        }
        
        if (subReport.result.gitChanges && subReport.result.gitChanges.filesChanged.length > 0) {
          output += `- **Files Changed**: ${subReport.result.gitChanges.filesChanged.length}\n`;
          subReport.result.gitChanges.filesChanged.forEach(file => {
            output += `  - ${file}\n`;
          });
        }
      }
      
      if (subReport.error) {
        output += `- **Error**: ${subReport.error}\n`;
      }
      
      output += '\n';
    });
    
    return output;
  }

  /**
   * Print report to console
   */
  printReport(report: TaskReport): void {
    let formatted: string;
    
    switch (this.config.outputFormat) {
      case 'json':
        formatted = this.formatAsJson(report);
        break;
      case 'markdown':
        formatted = this.formatAsMarkdown(report);
        break;
      default:
        formatted = this.formatAsText(report);
    }
    
    console.log(formatted);
    
    // Save to file if configured
    if (this.config.logFile) {
      this.saveToFile(formatted, this.config.logFile);
    }
  }

  /**
   * Save report to file
   */
  private saveToFile(content: string, filename: string): void {
    try {
      fs.writeFileSync(filename, content, 'utf-8');
      if (this.config.verbose) {
        console.log(`\nReport saved to: ${filename}`);
      }
    } catch (error) {
      console.error(`Failed to save report to file: ${error}`);
    }
  }

  /**
   * Format duration in human-readable format
   */
  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Get emoji for task status
   */
  private getStatusEmoji(status: TaskStatus): string {
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
}
