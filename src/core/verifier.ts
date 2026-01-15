import { SubTask, VerificationResult, TestResult, LintingResult, BuildResult } from '../types';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Verifies task completion through various checks
 */
export class Verifier {
  /**
   * Verify a task by running tests, linting, and build checks
   */
  async verify(task: SubTask): Promise<VerificationResult> {
    const result: VerificationResult = {
      passed: true
    };
    
    try {
      // Run tests if available
      result.tests = await this.runTests();
      
      // Run linting if available
      result.linting = await this.runLinting();
      
      // Run build if available
      result.build = await this.runBuild();
      
      // Overall verification passes if all checks pass
      result.passed = this.allChecksPassed(result);
      
      if (!result.passed) {
        result.message = this.generateFailureMessage(result);
      }
    } catch (error) {
      result.passed = false;
      result.message = `Verification error: ${error}`;
    }
    
    return result;
  }

  /**
   * Run tests
   */
  private async runTests(): Promise<TestResult[] | undefined> {
    try {
      // Check if test script exists in package.json
      if (!this.hasNpmScript('test')) {
        return undefined;
      }
      
      const output = execSync('npm test', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      return [{
        name: 'npm test',
        passed: true,
        duration: 0
      }];
    } catch (error) {
      return [{
        name: 'npm test',
        passed: false,
        error: `Tests failed: ${error}`
      }];
    }
  }

  /**
   * Run linting
   */
  private async runLinting(): Promise<LintingResult | undefined> {
    try {
      // Check if lint script exists
      if (!this.hasNpmScript('lint')) {
        return undefined;
      }
      
      const output = execSync('npm run lint', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      
      return {
        passed: true,
        errors: 0,
        warnings: 0
      };
    } catch (error) {
      return {
        passed: false,
        errors: 1,
        warnings: 0,
        details: `Linting failed: ${error}`
      };
    }
  }

  /**
   * Run build
   */
  private async runBuild(): Promise<BuildResult | undefined> {
    try {
      // Check if build script exists
      if (!this.hasNpmScript('build')) {
        return undefined;
      }
      
      const startTime = Date.now();
      execSync('npm run build', { 
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      const duration = Date.now() - startTime;
      
      return {
        passed: true,
        duration
      };
    } catch (error) {
      return {
        passed: false,
        error: `Build failed: ${error}`
      };
    }
  }

  /**
   * Check if all verification checks passed
   */
  private allChecksPassed(result: VerificationResult): boolean {
    const testsPassed = !result.tests || result.tests.every(t => t.passed);
    const lintingPassed = !result.linting || result.linting.passed;
    const buildPassed = !result.build || result.build.passed;
    
    return testsPassed && lintingPassed && buildPassed;
  }

  /**
   * Generate failure message
   */
  private generateFailureMessage(result: VerificationResult): string {
    const messages: string[] = [];
    
    if (result.tests && result.tests.some(t => !t.passed)) {
      messages.push('Tests failed');
    }
    
    if (result.linting && !result.linting.passed) {
      messages.push('Linting failed');
    }
    
    if (result.build && !result.build.passed) {
      messages.push('Build failed');
    }
    
    return messages.join(', ');
  }

  /**
   * Check if npm script exists in package.json
   */
  private hasNpmScript(scriptName: string): boolean {
    try {
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        return false;
      }
      
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return packageJson.scripts && packageJson.scripts[scriptName] !== undefined;
    } catch {
      return false;
    }
  }
}
