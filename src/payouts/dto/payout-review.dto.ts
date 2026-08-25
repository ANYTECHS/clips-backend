import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class ApprovePayoutDto {
  @ApiPropertyOptional({
    description: 'Optional note from the admin',
    example: 'Verified earnings, approved for processing',
  })
  @IsOptional()
  @IsString()
  note?: string;
}

export class RejectPayoutDto {
  @ApiPropertyOptional({
    description: 'Reason for rejecting the payout',
    example: 'Insufficient documentation',
  })
  @IsString()
  @MinLength(1, { message: 'Rejection reason is required' })
  reason: string;
}
