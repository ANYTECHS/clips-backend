import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class BulkDeleteClipsDto {
  @ApiProperty({
    description: 'Array of clip IDs to delete',
    example: [1, 2, 3],
    type: [Number],
    minItems: 1,
    maxItems: 200,
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  clipIds!: number[];
}
