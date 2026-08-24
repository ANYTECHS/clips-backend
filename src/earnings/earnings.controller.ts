import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { LeaderboardService, LeaderboardResponse } from './leaderboard.service';

interface RequestWithUser {
  user: { userId: number };
}

@ApiTags('earnings')
@Controller('earnings')
export class EarningsController {
  constructor(private readonly leaderboardService: LeaderboardService) {}

  @Get('leaderboard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get top creators leaderboard',
    description:
      'Returns the top earning creators who have opted in to the leaderboard. ' +
      'Only includes users with showOnLeaderboard=true and at least one earning.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of top creators to return (default: 100, max: 500)',
    type: 'number',
    example: 100,
  })
  @ApiResponse({
    status: 200,
    description: 'Top creators leaderboard',
    schema: {
      type: 'object',
      properties: {
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              rank: { type: 'number', example: 1 },
              userId: { type: 'number', example: 123 },
              username: { type: 'string', example: 'creator123' },
              totalEarnings: { type: 'number', example: 5000 },
            },
          },
        },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getLeaderboard(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<LeaderboardResponse> {
    return this.leaderboardService.getLeaderboard(limit);
  }

  @Get('leaderboard/rank')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @Auth()
  @ApiOperation({
    summary: "Get user's rank on the leaderboard",
    description:
      'Returns the authenticated user\'s rank, total earnings, and leaderboard visibility setting.',
  })
  @ApiResponse({
    status: 200,
    description: 'User rank information',
    schema: {
      type: 'object',
      properties: {
        rank: {
          type: 'number',
          nullable: true,
          example: 5,
          description:
            'User rank if showOnLeaderboard=true and has earnings, otherwise null',
        },
        totalEarnings: { type: 'number', example: 2500 },
        showOnLeaderboard: { type: 'boolean', example: true },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async getUserRank(@Req() req: RequestWithUser) {
    return this.leaderboardService.getUserRank(req.user.userId);
  }

  @Post('leaderboard/visibility')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @Auth()
  @ApiOperation({
    summary: 'Update leaderboard visibility',
    description:
      'Enable or disable leaderboard visibility for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Leaderboard visibility updated',
    schema: {
      type: 'object',
      properties: {
        showOnLeaderboard: { type: 'boolean', example: true },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  @ApiInternalServerErrorResponse({ description: 'Internal server error' })
  async updateLeaderboardVisibility(
    @Req() req: RequestWithUser,
    @Body() body: { showOnLeaderboard: boolean },
  ) {
    return this.leaderboardService.setLeaderboardVisibility(
      req.user.userId,
      body.showOnLeaderboard,
    );
  }
}
