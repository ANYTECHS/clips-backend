import { Controller, Post, Param, UseGuards, Get, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { ClipsService } from '../clips/clips.service';
import { Auth } from '../auth/decorators/auth.decorator';

@ApiTags('videos')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Auth()
@Controller('videos')
export class VideosController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  @ApiOperation({ summary: 'List user videos' })
  @ApiResponse({
    status: 200,
    description: 'List of videos returned',
    schema: { example: { message: 'Videos endpoint' } },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getVideos() {
    return { message: 'Videos endpoint' };
  }

  @Post(':id/cancel')
  @ApiOperation({
    summary: 'Cancel video processing',
    description: 'Cancels ongoing clip generation for a video',
  })
  @ApiParam({ name: 'id', description: 'Video ID' })
  @ApiResponse({
    status: 200,
    description: 'Video processing cancelled',
    schema: { example: { message: 'Video 42 processing has been cancelled' } },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid video ID, not owned by user, or not cancellable',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async cancel(@Param('id') id: string, @Req() req: any) {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.cancelVideo(id, userId);
  }
}
