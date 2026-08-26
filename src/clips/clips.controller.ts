import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  Req,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { ClipsService } from './clips.service';
import { BulkDeleteClipsDto } from './dto/bulk-delete-clips.dto';
import { LoginGuard } from '../auth/guards/login.guard.js';

@ApiTags('clips')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@UseGuards(LoginGuard)
@Controller('clips')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  /**
   * POST /clips/:id/regenerate
   *
   * Re-cuts the clip using its original startTime/endTime, uploads a fresh
   * version to Cloudinary, and updates clipUrl + thumbnail in the DB.
   * viralityScore and title are preserved.
   *
   * Closes #734
   */
  @Post(':id/regenerate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Regenerate a single clip',
    description:
      'Re-runs FFmpeg with the original timestamps, uploads a new version to ' +
      'Cloudinary and updates clipUrl + thumbnail. viralityScore and title are preserved.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', type: Number })
  @ApiResponse({
    status: 200,
    description: 'Updated clip record with new clipUrl and thumbnail',
    schema: {
      example: {
        id: 42,
        clipUrl: 'https://res.cloudinary.com/demo/video/upload/clip-42-regen-1234567890.mp4',
        thumbnail: 'https://res.cloudinary.com/demo/image/upload/clip-42-regen-1234567890-thumb.jpg',
        status: 'ready',
        viralityScore: 0.87,
        title: 'Epic moment #42',
        startTime: 12.5,
        endTime: 42.0,
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  @ApiForbiddenResponse({ description: 'Clip does not belong to the requesting user' })
  async regenerate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.regenerateClip(id, userId);
  }

  /**
   * POST /clips/bulk-delete
   *
   * Deletes a batch of clips owned by the authenticated user and removes
   * their Cloudinary assets. Clips not owned by the caller are skipped.
   *
   * Closes #739
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk delete rejected/unwanted clips',
    description:
      'Permanently deletes the specified clips (and their Cloudinary assets) ' +
      'after verifying ownership. Clips not owned by the caller are skipped.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deletion summary',
    schema: { example: { deleted: 3, skipped: 0, skippedIds: [] } },
  })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiForbiddenResponse({ description: 'None of the clips belong to the user' })
  async bulkDelete(@Body() dto: BulkDeleteClipsDto, @Req() req: any) {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.bulkDeleteClips(dto.clipIds, userId);
  }
}
