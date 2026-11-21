/**
 * Reusable array-validation decorator factories.
 *
 * Three public helpers cover the most common cases:
 *
 *   @IsIdArray()          — integer ID arrays (e.g. clipIds, payoutIds)
 *   @IsStringArray()      — string arrays (e.g. tags, labels)
 *   @IsNestedArray(Cls)   — ValidateNested arrays of a DTO class
 *
 * All three delegate to the private `applyArrayDecorators` helper so size
 * limits, duplicate rejection, and Swagger metadata stay consistent.
 *
 * Options shared by every helper:
 *   min        — minimum array length (default 1)
 *   max        — maximum array length (default none)
 *   allowDuplicates — when false (default) a @NoDuplicates() check is added
 */

import {
  IsArray,
  IsInt,
  IsString,
  ArrayMinSize,
  ArrayMaxSize,
  ValidateNested,
  ValidationOptions,
} from 'class-validator';
import { Type, ClassConstructor } from 'class-transformer';
import { applyDecorators } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptions } from '@nestjs/swagger';
import { ValidateBy } from 'class-validator';
import { IsUniqueArrayConstraint } from './is-unique-array.validator';

// ---------------------------------------------------------------------------
// Shared options
// ---------------------------------------------------------------------------

export interface ArrayFieldOptions {
  /** Minimum number of elements (inclusive). Defaults to 1. */
  min?: number;
  /** Maximum number of elements (inclusive). Omit to leave unbounded. */
  max?: number;
  /**
   * Whether duplicate values are allowed.
   * Defaults to `false` — duplicates are rejected.
   */
  allowDuplicates?: boolean;
  /** Override the validation error messages for specific checks. */
  messages?: {
    isArray?: string;
    minSize?: string;
    maxSize?: string;
    eachItem?: string;
    duplicates?: string;
  };
}

// ---------------------------------------------------------------------------
// NoDuplicates decorator (public — usable standalone too)
// ---------------------------------------------------------------------------

/**
 * Rejects arrays that contain duplicate elements.
 *
 * Uses strict equality for primitives and JSON serialisation for objects, so
 * two objects with the same shape but different identity are treated as equal.
 */
export function NoDuplicates(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isUniqueArray',
      constraints: [],
      validator: new IsUniqueArrayConstraint(),
    },
    validationOptions,
  );
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

interface InternalArrayOptions extends ArrayFieldOptions {
  /** Swagger ApiProperty metadata override */
  swagger?: ApiPropertyOptions;
  /** Additional per-element decorators (applied with `each: true`) */
  elementDecorators?: PropertyDecorator[];
  /** class-transformer Type function for nested DTO transformation */
  typeTransformer?: () => ClassConstructor<unknown>;
}

function applyArrayDecorators(opts: InternalArrayOptions): PropertyDecorator {
  const min = opts.min ?? 1;
  const allowDuplicates = opts.allowDuplicates ?? false;

  const decorators: PropertyDecorator[] = [
    IsArray({ message: opts.messages?.isArray }),
    ArrayMinSize(min, {
      message:
        opts.messages?.minSize ??
        (min === 1 ? undefined : `must contain at least ${min} items`),
    }),
  ];

  if (opts.max !== undefined) {
    decorators.push(
      ArrayMaxSize(opts.max, {
        message:
          opts.messages?.maxSize ?? `must not contain more than ${opts.max} items`,
      }),
    );
  }

  for (const dec of opts.elementDecorators ?? []) {
    decorators.push(dec);
  }

  if (!allowDuplicates) {
    decorators.push(
      NoDuplicates(
        opts.messages?.duplicates
          ? { message: opts.messages.duplicates }
          : undefined,
      ),
    );
  }

  if (opts.typeTransformer) {
    decorators.push(Type(opts.typeTransformer));
  }

  if (opts.swagger) {
    decorators.push(ApiProperty(opts.swagger));
  }

  return applyDecorators(...decorators);
}

// ---------------------------------------------------------------------------
// IsIdArray — integer identifier arrays
// ---------------------------------------------------------------------------

export interface IdArrayOptions extends ArrayFieldOptions {
  /** Swagger description override */
  description?: string;
  /** Example array shown in Swagger */
  example?: number[];
}

/**
 * Validates an integer ID array.
 *
 * Applies: `@IsArray`, `@ArrayMinSize`, `@ArrayMaxSize`, `@IsInt({ each })`,
 * `@NoDuplicates` (unless `allowDuplicates: true`), and `@ApiProperty`.
 *
 * @example
 * \@IsIdArray({ min: 1, max: 200, description: 'Clip IDs to delete' })
 * clipIds: number[];
 */
export function IsIdArray(opts: IdArrayOptions = {}): PropertyDecorator {
  const min = opts.min ?? 1;
  return applyArrayDecorators({
    ...opts,
    elementDecorators: [
      IsInt({
        each: true,
        message: opts.messages?.eachItem ?? 'each ID must be an integer',
      }),
    ],
    swagger: {
      type: [Number],
      minItems: min,
      maxItems: opts.max,
      description: opts.description,
      example: opts.example ?? [1, 2, 3],
      ...opts, // allow callers to pass raw ApiProperty fields via spread
    },
  });
}

// ---------------------------------------------------------------------------
// IsStringArray — string value arrays
// ---------------------------------------------------------------------------

export interface StringArrayOptions extends ArrayFieldOptions {
  /** Swagger description override */
  description?: string;
  /** Example array shown in Swagger */
  example?: string[];
  /** Pass `true` when the array is optional (adjusts Swagger `required` flag) */
  optional?: boolean;
}

/**
 * Validates a plain string array.
 *
 * Applies: `@IsArray`, `@ArrayMinSize`, `@ArrayMaxSize`, `@IsString({ each })`,
 * `@NoDuplicates` (unless `allowDuplicates: true`), and `@ApiProperty`.
 *
 * @example
 * \@IsStringArray({ min: 1, max: 10, description: 'Tag names' })
 * tags: string[];
 */
export function IsStringArray(opts: StringArrayOptions = {}): PropertyDecorator {
  const min = opts.min ?? 1;
  return applyArrayDecorators({
    ...opts,
    elementDecorators: [
      IsString({
        each: true,
        message: opts.messages?.eachItem ?? 'each element must be a string',
      }),
    ],
    swagger: {
      type: [String],
      minItems: min,
      maxItems: opts.max,
      description: opts.description,
      example: opts.example ?? ['value1', 'value2'],
      required: !opts.optional,
    },
  });
}

// ---------------------------------------------------------------------------
// IsNestedArray — arrays of validated DTO objects
// ---------------------------------------------------------------------------

export interface NestedArrayOptions extends ArrayFieldOptions {
  /** Swagger description override */
  description?: string;
  /** Pass `true` when the array is optional */
  optional?: boolean;
}

/**
 * Validates an array of nested DTO objects.
 *
 * Applies: `@IsArray`, `@ArrayMinSize`, `@ArrayMaxSize`,
 * `@ValidateNested({ each: true })`, `@Type(() => Cls)`,
 * `@NoDuplicates` (unless `allowDuplicates: true`), and `@ApiProperty`.
 *
 * @example
 * \@IsNestedArray(RoyaltyShareDto, { min: 1, max: 10, description: 'Royalty shares' })
 * shares: RoyaltyShareDto[];
 */
export function IsNestedArray<T>(
  Cls: ClassConstructor<T>,
  opts: NestedArrayOptions = {},
): PropertyDecorator {
  const min = opts.min ?? 1;
  return applyArrayDecorators({
    ...opts,
    elementDecorators: [ValidateNested({ each: true })],
    typeTransformer: () => Cls as ClassConstructor<unknown>,
    swagger: {
      type: [Cls],
      minItems: min,
      maxItems: opts.max,
      description: opts.description,
      required: !opts.optional,
    },
  });
}
