import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteClipsDto {
  @ApiProperty({
    description: 'IDs of clips to delete',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  clipIds: number[];
}
