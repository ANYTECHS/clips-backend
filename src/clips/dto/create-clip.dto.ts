import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
  Max,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';

function IsValidClipEndTime(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: 'isValidClipEndTime',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: number, args: ValidationArguments) {
          const dto = args.object as CreateClipDto;
          if (value <= dto.startTime) {
            return false;
          }
          const duration = value - dto.startTime;
          return duration >= 5 && duration <= 300;
        },
        defaultMessage() {
          return 'endTime must be greater than startTime and clip duration must be between 5 and 300 seconds';
        },
      },
    });
  };
}

export class CreateClipDto {
  @IsString()
  @IsNotEmpty()
  videoId: string;

  @IsString()
  @IsNotEmpty()
  inputPath: string;

  @IsString()
  @IsNotEmpty()
  outputPath: string;

  /** Start time in seconds — must be >= 0 */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  startTime: number;

  /**
   * End time in seconds — must be > startTime.
   * Clip duration (endTime - startTime) must be between 5 and 300 seconds.
   */
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  @IsValidClipEndTime()
  endTime: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  @Type(() => Number)
  positionRatio: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  videoDuration?: number;

  @IsOptional()
  @IsString()
  transcript?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  clipId?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  existingViralityScore?: number;
}
