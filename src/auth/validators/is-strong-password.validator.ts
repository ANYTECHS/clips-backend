import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';
import * as zxcvbn from 'zxcvbn';

export interface PasswordStrengthError {
  score: number;
  feedback: string[];
  suggestions: string;
}

@ValidatorConstraint({ name: 'isStrongPassword', async: false })
export class IsStrongPasswordConstraint implements ValidatorConstraintInterface {
  private feedbackMessages: PasswordStrengthError;

  validate(password: string): boolean {
    if (!password || typeof password !== 'string') {
      this.feedbackMessages = {
        score: 0,
        feedback: ['Password is required'],
        suggestions: 'Password is required',
      };
      return false;
    }

    // Check minimum length
    if (password.length < 10) {
      this.feedbackMessages = {
        score: 0,
        feedback: ['Password must be at least 10 characters long'],
        suggestions: 'Password must be at least 10 characters long',
      };
      return false;
    }

    // Analyze password strength using zxcvbn
    const result = zxcvbn(password);

    // Check if score is at least 3 (0-4 scale)
    if (result.score < 3) {
      const feedback = result.feedback.suggestions || [];
      const warnings = result.feedback.warning ? [result.feedback.warning] : [];
      const allSuggestions = [...warnings, ...feedback];

      // Provide helpful suggestions if none from zxcvbn
      const suggestions = allSuggestions.length
        ? allSuggestions.join('. ')
        : this.generateDefaultSuggestions(password);

      this.feedbackMessages = {
        score: result.score,
        feedback: allSuggestions,
        suggestions,
      };
      return false;
    }

    this.feedbackMessages = {
      score: result.score,
      feedback: [],
      suggestions: 'Password is strong',
    };
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    if (!this.feedbackMessages) {
      return 'Password does not meet strength requirements';
    }
    return JSON.stringify(this.feedbackMessages);
  }

  private generateDefaultSuggestions(password: string): string {
    const suggestions: string[] = [];

    if (!/\d/.test(password)) {
      suggestions.push('Add numbers');
    }
    if (!/[a-z]/.test(password)) {
      suggestions.push('Add lowercase letters');
    }
    if (!/[A-Z]/.test(password)) {
      suggestions.push('Add uppercase letters');
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      suggestions.push('Add special characters');
    }

    return suggestions.length
      ? 'Password is too weak. ' + suggestions.join(', ')
      : 'Password does not meet strength requirements';
  }
}
