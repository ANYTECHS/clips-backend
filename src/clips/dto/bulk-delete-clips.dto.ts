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
