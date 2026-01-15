import simpleGit, { SimpleGit } from 'simple-git';
import { GitChanges, GitIntegrationConfig } from '../types';

/**
 * Manages Git operations for task execution
 */
export class GitManager {
  private git: SimpleGit;

  constructor(private config: GitIntegrationConfig) {
    this.git = simpleGit();
  }

  /**
   * Stage all changes
   */
  async stageChanges(): Promise<GitChanges> {
    if (!this.config.enabled) {
      return { filesChanged: [] };
    }

    try {
      const status = await this.git.status();
      const filesChanged = [
        ...status.modified,
        ...status.created,
        ...status.deleted
      ];

      if (filesChanged.length > 0) {
        await this.git.add('.');
      }

      const diff = await this.git.diff(['--cached']);

      return {
        filesChanged,
        diff
      };
    } catch (error) {
      throw new Error(`Failed to stage changes: ${error}`);
    }
  }

  /**
   * Commit staged changes
   */
  async commit(message: string): Promise<string> {
    if (!this.config.enabled) {
      return '';
    }

    try {
      const result = await this.git.commit(message);
      return result.commit || '';
    } catch (error) {
      throw new Error(`Failed to commit: ${error}`);
    }
  }

  /**
   * Create a new branch
   */
  async createBranch(branchName: string): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      const prefix = this.config.branchPrefix || 'task';
      const fullBranchName = `${prefix}/${branchName}`;
      await this.git.checkoutLocalBranch(fullBranchName);
    } catch (error) {
      throw new Error(`Failed to create branch: ${error}`);
    }
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const status = await this.git.status();
      return status.current || 'unknown';
    } catch (error) {
      throw new Error(`Failed to get current branch: ${error}`);
    }
  }

  /**
   * Get list of changed files
   */
  async getChangedFiles(): Promise<string[]> {
    try {
      const status = await this.git.status();
      return [
        ...status.modified,
        ...status.created,
        ...status.deleted
      ];
    } catch (error) {
      throw new Error(`Failed to get changed files: ${error}`);
    }
  }

  /**
   * Get diff of changes
   */
  async getDiff(): Promise<string> {
    try {
      return await this.git.diff();
    } catch (error) {
      throw new Error(`Failed to get diff: ${error}`);
    }
  }

  /**
   * Check if repository has uncommitted changes
   */
  async hasUncommittedChanges(): Promise<boolean> {
    try {
      const status = await this.git.status();
      return !status.isClean();
    } catch (error) {
      throw new Error(`Failed to check status: ${error}`);
    }
  }
}
