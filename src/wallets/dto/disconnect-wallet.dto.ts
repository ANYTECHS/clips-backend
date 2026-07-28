import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';

export class DisconnectWalletDto {
  @ApiProperty({ description: 'The wallet ID to disconnect', example: 1 })
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  id: number;
}
