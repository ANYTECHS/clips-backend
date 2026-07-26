import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { UserPlatformService } from './user-platform.service';
import { AuthGuard } from '@nestjs/passport';
import type {
  UserPlatformCreateInput,
  UserPlatformUpdateInput,
} from './user-platform.service';

@ApiTags('user-platforms')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller(['user-platforms', 'user-platform'])
@UseGuards(AuthGuard('jwt'))
export class UserPlatformController {
  constructor(private readonly userPlatformService: UserPlatformService) {}

  @Post()
  @ApiOperation({
    summary: 'Connect a social platform',
    description: 'Connects a social media platform to the authenticated user',
  })
  @ApiResponse({ status: 201, description: 'Platform connected successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  async create(@Request() req: any, @Body() data: UserPlatformCreateInput) {
    return this.userPlatformService.create({
      ...data,
      userId: req.user.id,
    });
  }

  @Get()
  @ApiOperation({
    summary: 'List connected platforms',
    description:
      'Returns all connected social platforms for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'List of connected platforms' })
  async findAll(@Request() req: any) {
    return this.userPlatformService.findAll(req.user.id);
  }

  @Get('platform/:platform')
  @ApiOperation({
    summary: 'Find platform by name',
    description: 'Returns platform connection details for a specific platform',
  })
  @ApiParam({
    name: 'platform',
    description: 'Platform name (e.g., tiktok, youtube)',
  })
  @ApiResponse({ status: 200, description: 'Platform connection found' })
  @ApiNotFoundResponse({ description: 'Platform not connected' })
  async findByPlatform(
    @Request() req: any,
    @Param('platform') platform: string,
  ) {
    return this.userPlatformService.findByPlatform(req.user.id, platform);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get platform by ID',
    description: 'Returns a specific platform connection by its ID',
  })
  @ApiParam({ name: 'id', description: 'Platform connection ID' })
  @ApiResponse({ status: 200, description: 'Platform connection found' })
  @ApiNotFoundResponse({ description: 'Platform connection not found' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    return this.userPlatformService.findOne(Number(id), req.user.id);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update platform connection',
    description: 'Updates an existing social platform connection',
  })
  @ApiParam({ name: 'id', description: 'Platform connection ID' })
  @ApiResponse({ status: 200, description: 'Platform connection updated' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  @ApiNotFoundResponse({ description: 'Platform connection not found' })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() data: UserPlatformUpdateInput,
  ) {
    return this.userPlatformService.update(Number(id), data, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disconnect platform',
    description: 'Removes a social platform connection',
  })
  @ApiParam({ name: 'id', description: 'Platform connection ID' })
  @ApiResponse({ status: 204, description: 'Platform disconnected' })
  @ApiNotFoundResponse({ description: 'Platform connection not found' })
  async remove(@Request() req: any, @Param('id') id: string) {
    return this.userPlatformService.remove(Number(id), req.user.id);
  }

  @Post('migrate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Migrate platform records',
    description: 'Migrates existing platform records (admin/internal)',
  })
  @ApiResponse({ status: 200, description: 'Migration completed' })
  async migrate() {
    return this.userPlatformService.migrateExistingRecords();
  }
}
