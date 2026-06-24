import {
  Controller,
  Post,
  Body,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PayoutsService } from './payouts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

class RequestPayoutDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsNotEmpty()
  @IsString()
  method: string;

  @IsOptional()
  @IsNumber()
  walletId?: number;
}

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  async requestPayout(@Req() req: any, @Body() dto: RequestPayoutDto) {
    return this.payoutsService.requestPayout(req.user.userId, dto);
  }
}
