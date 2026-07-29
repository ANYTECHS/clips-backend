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
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserPlatformService } from './user-platform.service';
import { LoginGuard } from '../auth/guards/login.guard';
import type { UserPlatformCreateInput, UserPlatformUpdateInput } from './user-platform.service';
import { UserPlatformResponseDto, toUserPlatformResponseDto } from './dto/user-platform-response.dto';

@ApiTags('user-platforms')
@ApiBearerAuth('access-token')
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
@UseGuards(LoginGuard)
export class UserPlatformController {
  constructor(private readonly userPlatformService: UserPlatformService) {}

  @Post()
  @ApiOperation({ summary: 'Connect a platform account' })
  @ApiResponse({ status: 201, description: 'Platform connected', type: UserPlatformResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiOperation({
    summary: 'Connect a social platform',
    description: 'Connects a social media platform to the authenticated user',
  })
  @ApiResponse({ status: 201, description: 'Platform connected successfully' })
  @ApiBadRequestResponse({ description: 'Invalid input' })
  async create(@Request() req: any, @Body() data: UserPlatformCreateInput) {
    const created = await this.userPlatformService.create({
      ...data,
      userId: req.user.id,
    });
    return toUserPlatformResponseDto(created);
  }

  @Get()
  @ApiOperation({ summary: 'List connected platforms for the current user' })
  @ApiResponse({ status: 200, description: 'List of connected platforms', type: [UserPlatformResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiOperation({
    summary: 'List connected platforms',
    description:
      'Returns all connected social platforms for the authenticated user',
  })
  @ApiResponse({ status: 200, description: 'List of connected platforms' })
  async findAll(@Request() req: any) {
    const platforms = await this.userPlatformService.findAll(req.user.id);
    return platforms.map(toUserPlatformResponseDto);
  }

  @Get('platform/:platform')
  @ApiOperation({ summary: 'Get connection for a specific platform' })
  @ApiResponse({ status: 200, description: 'Platform connection', type: UserPlatformResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
    const found = await this.userPlatformService.findByPlatform(req.user.id, platform);
    return found ? toUserPlatformResponseDto(found) : null;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a platform connection by ID' })
  @ApiResponse({ status: 200, description: 'Platform connection', type: UserPlatformResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @ApiOperation({
    summary: 'Get platform by ID',
    description: 'Returns a specific platform connection by its ID',
  })
  @ApiParam({ name: 'id', description: 'Platform connection ID' })
  @ApiResponse({ status: 200, description: 'Platform connection found' })
  @ApiNotFoundResponse({ description: 'Platform connection not found' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    const found = await this.userPlatformService.findOne(Number(id), req.user.id);
    return toUserPlatformResponseDto(found);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a platform connection' })
  @ApiResponse({ status: 200, description: 'Platform connection updated', type: UserPlatformResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
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
    const updated = await this.userPlatformService.update(Number(id), data, req.user.id);
    return toUserPlatformResponseDto(updated);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Disconnect a platform' })
  @ApiResponse({ status: 204, description: 'Platform disconnected' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Access denied' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disconnect platform',
    description: 'Removes a social platform connection',
  })
  @ApiParam({ name: 'id', description: 'Platform connection ID' })
  @ApiResponse({ status: 204, description: 'Platform disconnected' })
  @ApiNotFoundResponse({ description: 'Platform connection not found' })
  async remove(@Request() req: any, @Param('id') id: string) {
    await this.userPlatformService.remove(Number(id), req.user.id);
  }

  @Post('migrate')
  @ApiOperation({ summary: 'Migrate legacy unencrypted platform tokens to encrypted storage' })
  @ApiResponse({ status: 200, description: 'Migration result' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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
