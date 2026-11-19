import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Canonical platform list used for validation.
 *
 * Issue #856 — centralise hardcoded configuration.
 *
 * These values mirror `ConfigService.supportedPlatforms`. This file keeps a
 * static copy so that class-validator decorators (which cannot inject services)
 * remain synchronous and dependency-free.  If you need to change the list,
 * update BOTH this constant AND `ConfigService.supportedPlatforms`.
 *
 * Do not read `process.env` here — all env-derived configuration lives in
 * `ConfigService`. Class-validator constraints must be synchronous and cannot
 * receive injected services, so we define the canonical list in one place and
 * re-export it.
 */
export const SUPPORTED_PLATFORMS = [
  'tiktok',
  'instagram',
  'youtube',
  'facebook',
  'snapchat',
  'pinterest',
  'linkedin',
  'youtube-shorts',
] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

function normalizePlatform(platform: string): string {
  return platform.toLowerCase();
}

export function isSupportedPlatform(platform: string): platform is SupportedPlatform {
  return SUPPORTED_PLATFORMS.includes(
    normalizePlatform(platform) as SupportedPlatform,
  );
}

@ValidatorConstraint({ name: 'isValidPlatform', async: false })
export class IsValidPlatformConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || value.length === 0) {
      return false;
    }
    return isSupportedPlatform(value);
  }

  defaultMessage(args: ValidationArguments): string {
    const value = args.value;
    if (typeof value !== 'string') {
      return 'platform must be a string';
    }
    return `Invalid platform: "${value}". Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}`;
  }
}

@ValidatorConstraint({ name: 'isValidPlatforms', async: false })
export class IsValidPlatformsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) {
      return false;
    }
    for (const platform of value) {
      if (typeof platform !== 'string' || !isSupportedPlatform(platform)) {
        return false;
      }
    }
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    const value = args.value;

    if (!Array.isArray(value)) {
      return 'targetPlatforms must be an array';
    }

    const invalidPlatforms: string[] = [];
    for (const platform of value) {
      if (typeof platform !== 'string') {
        return 'All platform values must be strings';
      }
      if (!isSupportedPlatform(platform)) {
        invalidPlatforms.push(platform);
      }
    }

    if (invalidPlatforms.length > 0) {
      return `Invalid platform(s): ${invalidPlatforms.join(', ')}. Supported platforms: ${SUPPORTED_PLATFORMS.join(', ')}`;
    }

    return 'targetPlatforms validation failed';
  }
}
