import { ApiProperty } from '@nestjs/swagger';

/** Successful on-chain royalty query response. */
export class RoyaltyQueryResponseDto {
  @ApiProperty({
    description: 'Royalty fee in basis points (1000 = 10%)',
    example: 1000,
    minimum: 0,
    maximum: 1500,
  })
  royaltyBps: number;

  @ApiProperty({
    description: 'Masked Stellar account that receives royalty payments',
    example: 'GABC********NOQRS',
  })
  recipient: string;
}

/** 404 body when royalty data cannot be resolved for the mint address. */
export class RoyaltyNotFoundDto {
  @ApiProperty({ example: 404 })
  statusCode: number;

  @ApiProperty({
    example: 'Royalty data not found for mint address 42',
  })
  message: string;

  @ApiProperty({ example: 'Not Found' })
  error: string;
}

/** 401 body when the request is missing a valid session / bearer token. */
export class RoyaltyUnauthorizedDto {
  @ApiProperty({ example: 401 })
  statusCode: number;

  @ApiProperty({ example: 'Unauthorized' })
  message: string;
}
