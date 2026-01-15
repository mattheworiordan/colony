import { Task, SubTask, TaskStatus } from '../types';

/**
 * Decomposes a complex task into smaller sub-tasks
 */
export class TaskDecomposer {
  /**
   * Decompose a task description into sub-tasks
   * @param taskDescription The main task description
   * @returns Array of sub-tasks
   */
  decompose(taskDescription: string): SubTask[] {
    const subTasks: SubTask[] = [];
    
    // Analyze the task and break it down into logical sub-tasks
    const taskLines = taskDescription.split('\n').filter(line => line.trim());
    
    // Look for bullet points, numbered lists, or logical steps
    const steps = this.extractSteps(taskLines);
    
    steps.forEach((step, index) => {
      const subTask: SubTask = {
        id: `task-${index + 1}`,
        description: step.description,
        dependencies: step.dependencies,
        status: TaskStatus.PENDING
      };
      subTasks.push(subTask);
    });
    
    return subTasks;
  }

  /**
   * Extract steps from task description
   */
  private extractSteps(lines: string[]): Array<{ description: string; dependencies: string[] }> {
    const steps: Array<{ description: string; dependencies: string[] }> = [];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Match bullet points, numbered lists, or other list formats
      const bulletMatch = trimmed.match(/^[-*•]\s+(.+)$/);
      const numberedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
      
      if (bulletMatch || numberedMatch) {
        const description = bulletMatch ? bulletMatch[1] : numberedMatch![1];
        
        // Determine dependencies based on keywords
        const dependencies: string[] = [];
        const lowerDesc = description.toLowerCase();
        
        // If this step mentions "after" or "once", it might have dependencies
        if (lowerDesc.includes('after') || lowerDesc.includes('once') || 
            lowerDesc.includes('then') || lowerDesc.includes('following')) {
          // For simplicity, make it depend on the previous task
          if (steps.length > 0) {
            dependencies.push(`task-${steps.length}`);
          }
        }
        
        steps.push({ description, dependencies });
      } else if (trimmed.length > 0) {
        // Treat as a single step
        steps.push({ 
          description: trimmed, 
          dependencies: steps.length > 0 ? [`task-${steps.length}`] : [] 
        });
      }
    });
    
    // If no structured steps found, create a single task
    if (steps.length === 0) {
      steps.push({ 
        description: lines.join(' '), 
        dependencies: [] 
      });
    }
    
    return steps;
  }

  /**
   * Analyze dependencies and determine which tasks can run in parallel
   */
  getParallelizableGroups(subTasks: SubTask[]): SubTask[][] {
    const groups: SubTask[][] = [];
    const processed = new Set<string>();
    
    while (processed.size < subTasks.length) {
      const currentGroup: SubTask[] = [];
      
      for (const task of subTasks) {
        if (processed.has(task.id)) continue;
        
        // Check if all dependencies are satisfied
        const dependenciesSatisfied = task.dependencies.every(dep => processed.has(dep));
        
        if (dependenciesSatisfied) {
          currentGroup.push(task);
        }
      }
      
      if (currentGroup.length === 0) {
        // Circular dependency or issue - break
        break;
      }
      
      currentGroup.forEach(task => processed.add(task.id));
      groups.push(currentGroup);
    }
    
    return groups;
  }
}
