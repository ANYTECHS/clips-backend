/**
 * Integration tests for the array validation decorator factories.
 *
 * Each test class is a minimal DTO that uses one factory decorator.  The
 * global ValidationPipe is used to mirror real request processing.
 */

import 'reflect-metadata';
import { IsString, IsInt, Min, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { createGlobalValidationPipe } from '../pipes/global-validation.pipe';
import {
  IsIdArray,
  IsStringArray,
  IsNestedArray,
  NoDuplicates,
} from './array-validators';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pipe = createGlobalValidationPipe();

async function validate<T>(
  Cls: new () => T,
  body: unknown,
): Promise<T> {
  return pipe.transform(body, { type: 'body', metatype: Cls as never });
}

async function expectError(
  Cls: new () => unknown,
  body: unknown,
  fragment: string,
): Promise<void> {
  await expect(validate(Cls, body)).rejects.toMatchObject({
    response: expect.objectContaining({
      statusCode: 400,
      details: expect.arrayContaining([
        expect.objectContaining({
          errors: expect.arrayContaining([
            expect.stringContaining(fragment),
          ]),
        }),
      ]),
    }),
  });
}

// ---------------------------------------------------------------------------
// IsIdArray
// ---------------------------------------------------------------------------

class IdArrayDto {
  @IsIdArray({ min: 1, max: 5, description: 'Clip IDs', example: [1] })
  clipIds: number[];
}

describe('IsIdArray', () => {
  it('accepts a valid integer array', async () => {
    const result = await validate(IdArrayDto, { clipIds: [1, 2, 3] });
    expect(result.clipIds).toEqual([1, 2, 3]);
  });

  it('rejects a non-array value', async () => {
    await expectError(IdArrayDto, { clipIds: 'not-array' }, 'array');
  });

  it('rejects an empty array (min = 1)', async () => {
    await expectError(IdArrayDto, { clipIds: [] }, '');
  });

  it('rejects an array exceeding max length', async () => {
    await expectError(IdArrayDto, { clipIds: [1, 2, 3, 4, 5, 6] }, '5 items');
  });

  it('rejects non-integer elements', async () => {
    await expectError(IdArrayDto, { clipIds: [1, 'two'] }, 'integer');
  });

  it('rejects duplicate integer values', async () => {
    await expectError(IdArrayDto, { clipIds: [1, 2, 1] }, 'duplicate');
  });

  it('allows an array up to exactly max elements', async () => {
    const result = await validate(IdArrayDto, { clipIds: [1, 2, 3, 4, 5] });
    expect(result.clipIds).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// IsIdArray with allowDuplicates: true
// ---------------------------------------------------------------------------

class IdArrayDuplicatesAllowedDto {
  @IsIdArray({ min: 1, allowDuplicates: true })
  ids: number[];
}

describe('IsIdArray allowDuplicates: true', () => {
  it('accepts duplicate values', async () => {
    const result = await validate(IdArrayDuplicatesAllowedDto, { ids: [1, 1, 2] });
    expect(result.ids).toEqual([1, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// IsStringArray
// ---------------------------------------------------------------------------

class StringArrayDto {
  @IsStringArray({ min: 1, max: 4, description: 'Tag names' })
  tags: string[];
}

describe('IsStringArray', () => {
  it('accepts a valid string array', async () => {
    const result = await validate(StringArrayDto, { tags: ['alpha', 'beta'] });
    expect(result.tags).toEqual(['alpha', 'beta']);
  });

  it('rejects a non-array value', async () => {
    await expectError(StringArrayDto, { tags: 'alpha' }, 'array');
  });

  it('rejects an empty array (min = 1)', async () => {
    await expectError(StringArrayDto, { tags: [] }, '');
  });

  it('rejects arrays exceeding max', async () => {
    await expectError(
      StringArrayDto,
      { tags: ['a', 'b', 'c', 'd', 'e'] },
      '4 items',
    );
  });

  it('rejects non-string elements', async () => {
    await expectError(StringArrayDto, { tags: ['valid', 42] }, 'string');
  });

  it('rejects duplicate strings', async () => {
    await expectError(StringArrayDto, { tags: ['dup', 'dup'] }, 'duplicate');
  });
});

// ---------------------------------------------------------------------------
// IsNestedArray
// ---------------------------------------------------------------------------

class RecipientDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  bps: number;
}

class NestedArrayDto {
  @IsNestedArray(RecipientDto, { min: 1, max: 3, description: 'Recipients' })
  recipients: RecipientDto[];
}

describe('IsNestedArray', () => {
  it('accepts a valid array of nested DTOs', async () => {
    const result = await validate(NestedArrayDto, {
      recipients: [
        { address: 'GABC', bps: 9000 },
        { address: 'GDEF', bps: 1000 },
      ],
    });
    expect(result.recipients).toHaveLength(2);
  });

  it('rejects a non-array value', async () => {
    await expectError(NestedArrayDto, { recipients: 'not-an-array' }, 'array');
  });

  it('rejects an empty array (min = 1)', async () => {
    await expectError(NestedArrayDto, { recipients: [] }, '');
  });

  it('rejects arrays exceeding max', async () => {
    const tooMany = [
      { address: 'G1', bps: 1 },
      { address: 'G2', bps: 2 },
      { address: 'G3', bps: 3 },
      { address: 'G4', bps: 4 },
    ];
    await expectError(NestedArrayDto, { recipients: tooMany }, '3 items');
  });

  it('propagates nested field validation errors', async () => {
    await expectError(
      NestedArrayDto,
      { recipients: [{ address: '', bps: 500 }] },
      'address',
    );
  });

  it('rejects duplicate nested objects (same shape)', async () => {
    await expectError(
      NestedArrayDto,
      {
        recipients: [
          { address: 'GABC', bps: 9000 },
          { address: 'GABC', bps: 9000 },
        ],
      },
      'duplicate',
    );
  });
});

// ---------------------------------------------------------------------------
// NoDuplicates standalone
// ---------------------------------------------------------------------------

class StandaloneNoDupDto {
  @IsIdArray({ min: 1 })
  @NoDuplicates()
  ids: number[];
}

describe('NoDuplicates (standalone usage)', () => {
  it('passes when all values are unique', async () => {
    const result = await validate(StandaloneNoDupDto, { ids: [10, 20, 30] });
    expect(result.ids).toEqual([10, 20, 30]);
  });

  it('rejects when duplicates are present', async () => {
    await expectError(StandaloneNoDupDto, { ids: [10, 10] }, 'duplicate');
  });
});
