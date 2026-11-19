import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-responses.dto';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@ApiBadRequestResponse({ description: 'Invalid request parameters' })
@ApiUnauthorizedResponse({ description: 'JWT token required' })
@ApiForbiddenResponse({ description: 'Insufficient permissions' })
@ApiNotFoundResponse({ description: 'User not found' })
@ApiConflictResponse({ description: 'Resource already exists' })
@ApiInternalServerErrorResponse({ description: 'Internal server error' })
@Controller('users')
@Auth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({
    summary:
      'Get current user profile including masked stellarPublicKey and walletType',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile with masked stellarPublicKey',
    type: UserResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@Req() req: any) {
    return this.usersService.getMe(req.user.userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update current user profile (partial update)' })
  @ApiBody({ type: UpdateProfileDto })
  @ApiResponse({ status: 200, description: 'Updated user profile' })
  @ApiBadRequestResponse({
    description: 'Invalid profile data or unsupported fields',
  })
  @ApiConflictResponse({ description: 'Username already taken' })
  async updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.userId, dto);
  }

  @Post('wallet/create')
  @ApiOperation({
    summary: 'Generate a custodial Stellar wallet for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet created, returns a masked stellarPublicKey',
    schema: {
      example: {
        stellarPublicKey: 'GABF...KJ93XD',
        walletType: 'custodial',
      },
    },
  })
  @ApiConflictResponse({ description: 'Wallet already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async createWallet(@Req() req: any) {
    return this.usersService.createWallet(req.user.userId);
  }
}
