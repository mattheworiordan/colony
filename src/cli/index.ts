#!/usr/bin/env node

import { Command } from 'commander';
import { TaskRunner } from '../core/task-runner';
import { TaskRunnerConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

const program = new Command();

program
  .name('claude-task-runner')
  .description('Decompose complex coding tasks into parallel sub-tasks with independent verification, smart Git integration, and comprehensive reporting')
  .version('1.0.0');

program
  .command('run')
  .description('Run a task from description')
  .argument('<task>', 'Task description or path to task file')
  .option('-p, --parallel <number>', 'Maximum number of parallel tasks', '3')
  .option('--no-verify', 'Disable verification')
  .option('--no-git', 'Disable Git integration')
  .option('--auto-commit', 'Auto-commit changes')
  .option('--auto-stage', 'Auto-stage changes')
  .option('--format <format>', 'Output format (text|json|markdown)', 'text')
  .option('--log-file <file>', 'Save report to file')
  .option('--config <file>', 'Load configuration from file')
  .action(async (taskDescription: string, options) => {
    try {
      // Load config from file if provided
      let config: TaskRunnerConfig;
      
      if (options.config) {
        const configPath = path.resolve(options.config);
        const configContent = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(configContent);
      } else {
        // Build config from options
        config = {
          maxParallelTasks: parseInt(options.parallel),
          verificationEnabled: options.verify !== false,
          gitIntegration: {
            enabled: options.git !== false,
            autoCommit: options.autoCommit || false,
            autoStage: options.autoStage || false,
            branchPrefix: 'task',
            commitMessageTemplate: 'Complete task: {description}'
          },
          reporting: {
            verbose: true,
            outputFormat: options.format,
            logFile: options.logFile
          }
        };
      }
      
      // Check if task is a file path
      let task = taskDescription;
      if (fs.existsSync(taskDescription)) {
        task = fs.readFileSync(taskDescription, 'utf-8');
      }
      
      // Create and run task runner
      const runner = new TaskRunner(config);
      await runner.run(task);
      
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('init')
  .description('Initialize a configuration file')
  .option('-o, --output <file>', 'Output file path', 'task-runner.config.json')
  .action((options) => {
    const config = TaskRunner.getDefaultConfig();
    const configPath = path.resolve(options.output);
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    console.log(`✅ Configuration file created: ${configPath}`);
  });

program.parse(process.argv);

// Show help if no command provided
if (process.argv.length === 2) {
  program.help();
}
