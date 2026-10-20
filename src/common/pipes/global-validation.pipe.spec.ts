import { IsInt, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { TrimString } from '../decorators/trim-string.decorator';
import { createGlobalValidationPipe } from './global-validation.pipe';

class ValidationTestDto {
  @Type(() => Number)
  @IsInt()
  count: number;

  @TrimString()
  @IsString()
  label: string;
}

describe('global validation pipe', () => {
  const pipe = createGlobalValidationPipe();
  const metadata = { type: 'body' as const, metatype: ValidationTestDto };

  it('transforms typed values and trims string input', async () => {
    const result = await pipe.transform(
      { count: '12', label: '  example  ' },
      metadata,
    );

    expect(result).toEqual({ count: 12, label: 'example' });
    expect(result).toBeInstanceOf(ValidationTestDto);
  });

  it('rejects unexpected properties', async () => {
    await expect(
      pipe.transform(
        { count: 12, label: 'example', unexpected: true },
        metadata,
      ),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: 'Validation failed',
        error: 'Bad Request',
        details: [
          {
            field: 'unexpected',
            errors: ['property unexpected should not exist'],
          },
        ],
      },
    });
  });

  it('returns a field-level 400 for invalid transformed values', async () => {
    await expect(
      pipe.transform({ count: 'not-a-number', label: 'example' }, metadata),
    ).rejects.toMatchObject({
      response: {
        statusCode: 400,
        message: 'Validation failed',
        details: [
          {
            field: 'count',
            errors: ['count must be an integer number'],
          },
        ],
      },
    });
  });
});