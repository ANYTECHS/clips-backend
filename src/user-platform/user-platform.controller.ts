import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { UserPlatformService } from './user-platform.service';
import { Auth } from '../auth/decorators/auth.decorator';
import {
  CreateUserPlatformDto,
  UpdateUserPlatformDto,
} from './dto/user-platform-request.dto';
import {
  UserPlatformResponseDto,
  toUserPlatformResponseDto,
} from './dto/user-platform-response.dto';
import { ValidationErrorResponseDto } from '../common/dtos/validation-error-response.dto';

@ApiTags('user-platforms')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller(['user-platforms', 'user-platform'])
@Auth()
export class UserPlatformController {
  constructor(private readonly userPlatformService: UserPlatformService) {}

  @Post()
  @ApiOperation({
    summary: 'Connect a social platform',
    description: 'Connects a social media platform to the authenticated user',
  })
  @ApiBody({
    type: CreateUserPlatformDto,
    examples: {
      youtube: {
        summary: 'Connect a YouTube account',
        value: {
          platform: 'youtube',
          username: 'creator123',
          accessToken: 'oauth-access-token',
          refreshToken: 'oauth-refresh-token',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Platform connected',
    type: UserPlatformResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed: platform must be a non-empty string',
    type: ValidationErrorResponseDto,
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        error: 'Bad Request',
        details: [
          {
            field: 'platform',
            errors: ['platform should not be empty', 'platform must be a string'],
          },
        ],
      },
    },
  })
  async create(@Request() req: any, @Body() data: CreateUserPlatformDto) {
    const created = await this.userPlatformService.create({
      ...data,
      userId: req.user.id,
    });
    return toUserPlatformResponseDto(created);
  }

  @Get()
  @ApiOperation({
    summary: 'List connected platforms',
    description:
      'Returns all connected social platforms for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'List of connected platforms',
    type: [UserPlatformResponseDto],
  })
  async findAll(@Request() req: any) {
    const platforms = await this.userPlatformService.findAll(req.user.id);
    return platforms.map(toUserPlatformResponseDto);
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
  @ApiResponse({
    status: 200,
    description: 'Platform connection',
    type: UserPlatformResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Platform not connected' })
  async findByPlatform(
    @Request() req: any,
    @Param('platform') platform: string,
  ) {
    const found = await this.userPlatformService.findByPlatform(
      req.user.id,
      platform,
    );
    return found ? toUserPlatformResponseDto(found) : null;
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get platform by ID',
    description: 'Returns a specific platform connection by its ID',
  })
  @ApiParam({ name: 'id', description: 'Platform connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Platform connection',
    type: UserPlatformResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Platform connection not found' })
  async findOne(@Request() req: any, @Param('id') id: string) {
    const found = await this.userPlatformService.findOne(
      Number(id),
      req.user.id,
    );
    return toUserPlatformResponseDto(found);
  }

  @Put(':id')
  @ApiOperation({
    summary: 'Update platform connection',
    description: 'Updates an existing social platform connection',
  })
  @ApiBody({
    type: UpdateUserPlatformDto,
    examples: {
      refreshCredentials: {
        summary: 'Replace OAuth credentials',
        value: {
          accessToken: 'new-oauth-access-token',
          refreshToken: 'new-oauth-refresh-token',
        },
      },
    },
  })
  @ApiParam({ name: 'id', description: 'Platform connection ID' })
  @ApiResponse({
    status: 200,
    description: 'Platform connection updated',
    type: UserPlatformResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Validation failed: supplied fields must be non-empty strings',
    type: ValidationErrorResponseDto,
    schema: {
      example: {
        statusCode: 400,
        message: 'Validation failed',
        error: 'Bad Request',
        details: [
          {
            field: 'accessToken',
            errors: ['accessToken should not be empty', 'accessToken must be a string'],
          },
        ],
      },
    },
  })
  @ApiNotFoundResponse({ description: 'Platform connection not found' })
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() data: UpdateUserPlatformDto,
  ) {
    const updated = await this.userPlatformService.update(
      Number(id),
      data,
      req.user.id,
    );
    return toUserPlatformResponseDto(updated);
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
    await this.userPlatformService.remove(Number(id), req.user.id);
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
