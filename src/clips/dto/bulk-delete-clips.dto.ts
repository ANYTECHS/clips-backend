import { IsIdArray } from '../../common/validators/array-validators';

export class BulkDeleteClipsDto {
  @IsIdArray({
    min: 1,
    max: 200,
    description: 'IDs of the clips to delete — must all belong to the requesting user',
    example: [1, 2, 3],
  })
  clipIds!: number[];
}
