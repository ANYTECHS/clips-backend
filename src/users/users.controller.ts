import {
  Controller,
  Get,
  Post,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiConflictResponse,
  ApiInternalServerErrorResponse,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-responses.dto';

@ApiTags('users')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
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

  @Post('wallet/create')
  @ApiOperation({
    summary: 'Generate a custodial Stellar wallet for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Wallet created, returns a masked stellarPublicKey',
    schema: {
      example: {
        stellarPublicKey: 'GC6X********UTZF3',
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
