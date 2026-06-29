import { Controller, Post, Param, UseGuards, Get, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { ClipsService } from '../clips/clips.service';
import { LoginGuard } from '../auth/guards/login.guard.js';

@ApiTags('videos')
@ApiBearerAuth('access-token')
@UseGuards(LoginGuard)
@Controller('videos')
export class VideosController {
  constructor(private readonly clipsService: ClipsService) {}

  @Get()
  @ApiOperation({ summary: 'List user videos' })
  @ApiResponse({ status: 200, description: 'List of videos returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  getVideos() {
    return { message: 'Videos endpoint' };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel video processing', description: 'Cancels ongoing clip generation for a video' })
  @ApiParam({ name: 'id', description: 'Video ID' })
  @ApiResponse({ status: 200, description: 'Video processing cancelled' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Video not found' })
  async cancel(@Param('id') id: string, @Req() req: any) {
    const userId = Number(req.user?.id ?? 0);
    return this.clipsService.cancelVideo(id, userId);
  }
}
