import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class PrepareCollectionBrandingDto {
  @ApiProperty({
    description: 'Stellar wallet address that will sign the admin transaction',
    example: 'GADMIN6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  adminAddress: string;

  @ApiProperty({
    description: 'New collection name or symbol (max 64 characters)',
    example: 'ClipCash Viral',
    maxLength: 64,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  value: string;
}
