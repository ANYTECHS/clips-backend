import { Controller, Get, Post, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('users')
@Auth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get current user profile including stellarPublicKey and walletType' })
  @ApiResponse({ status: 200, description: 'User profile' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@Req() req: any) {
    return this.usersService.getMe(req.user.userId);
  }

  @Post('wallet/create')
  @ApiOperation({ summary: 'Generate a custodial Stellar wallet for the authenticated user' })
  @ApiResponse({ status: 200, description: 'Wallet created, returns stellarPublicKey' })
  @ApiResponse({ status: 409, description: 'Wallet already exists' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @HttpCode(HttpStatus.OK)
  async createWallet(@Req() req: any) {
    return this.usersService.createWallet(req.user.userId);
  }
}
