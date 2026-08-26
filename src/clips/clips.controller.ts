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
   * POST /clips/bulk-delete
   * Deletes a batch of clips owned by the authenticated user.
   * Also removes the associated Cloudinary assets.
   *
   * Closes #739
   */
  @Post('bulk-delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk delete rejected/unwanted clips',
    description:
      'Permanently deletes the specified clips (and their Cloudinary assets) ' +
      'after verifying ownership. Clips not owned by the caller are silently skipped.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deletion summary',
    schema: {
      example: { deleted: 3, skipped: 0, skippedIds: [] },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid request body' })
  @ApiForbiddenResponse({ description: 'None of the clips belong to the user' })
  async bulkDelete(
    @Body() dto: BulkDeleteClipsDto,
    @Req() req: any,
  ): Promise<{ deleted: number; skipped: number; skippedIds: number[] }> {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.bulkDeleteClips(dto.clipIds, userId);
  }

  /**
   * POST /clips/:id/regenerate
   * Re-cuts a single clip using its original start/end timestamps and
   * uploads a fresh version to Cloudinary. Preserves viralityScore and title.
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
    description: 'Updated clip record',
  })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  @ApiForbiddenResponse({ description: 'Clip does not belong to the user' })
  async regenerate(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.regenerateClip(id, userId);
  }
}
