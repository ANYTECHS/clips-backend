import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareNftFreezeDto {
  @ApiProperty({
    description: 'Stellar wallet address that will sign the admin transaction',
    example: 'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  adminAddress: string;
}