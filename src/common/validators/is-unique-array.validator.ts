import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

/**
 * Rejects arrays that contain duplicate values.
 *
 * Comparison is done with `JSON.stringify` for objects/nested DTOs, and
 * strict equality for primitives, so shallow duplicates in nested DTOs are
 * also caught.
 *
 * Usage: `@NoDuplicates()` (see decorators.ts)
 */
@ValidatorConstraint({ name: 'isUniqueArray', async: false })
export class IsUniqueArrayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!Array.isArray(value)) {
      // Let @IsArray() report the type error; we only check uniqueness here.
      return true;
    }

    const seen = new Set<string>();
    for (const item of value) {
      const key =
        item !== null && typeof item === 'object'
          ? JSON.stringify(item)
          : String(item);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
    }
    return true;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must not contain duplicate values`;
  }
}
