import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  BadRequestException,
  NotFoundException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { ClipRoyaltyService } from './clip-royalty.service';
import {
  SetClipRoyaltyDto,
  ClipRoyaltyResponseDto,
  UpdateClipRoyaltyDto,
  RoyaltyCalculationDto,
  RoyaltyCalculationResponseDto,
} from './dto/clip-royalty.dto';
import { Auth } from '../auth/decorators/auth.decorator';

/**
 * Endpoints for managing clip-level royalty configurations
 * Creators can set royalty recipients and basis points for secondary sales
 */
@ApiTags('NFT Royalties')
@Controller('nfts/royalties')
export class ClipRoyaltyController {
  constructor(private clipRoyaltyService: ClipRoyaltyService) {}

  /**
   * GET /nfts/royalties/:clipId
   * Get royalty configuration for a clip
   */
  @Get(':clipId')
  @ApiOperation({
    summary: 'Get royalty configuration for a clip',
    description: 'Returns the royalty recipient address and basis points for a clip',
  })
  @ApiResponse({
    status: 200,
    description: 'Royalty configuration retrieved successfully',
    type: ClipRoyaltyResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Clip not found or no royalty configured',
  })
  async getRoyalty(
    @Param('clipId', ParseIntPipe) clipId: number,
  ): Promise<ClipRoyaltyResponseDto> {
    const royalty = await this.clipRoyaltyService.getRoyalty(clipId);

    if (!royalty) {
      throw new NotFoundException(
        `No royalty configuration found for clip ${clipId}`,
      );
    }

    return royalty;
  }

  /**
   * PATCH /nfts/royalties/:clipId
   * Update or create royalty configuration for a clip
   */
  @Patch(':clipId')
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Set or update royalty configuration for a clip',
    description:
      'Allows creators to configure royalty recipients and basis points (max 1500 BPS = 15%)',
  })
  @ApiResponse({
    status: 200,
    description: 'Royalty configuration updated successfully',
    type: ClipRoyaltyResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid royalty configuration (BPS exceeds 15%, invalid address, etc.)',
  })
  @ApiResponse({
    status: 404,
    description: 'Clip not found',
  })
  async updateRoyalty(
    @Param('clipId', ParseIntPipe) clipId: number,
    @Body() dto: UpdateClipRoyaltyDto,
  ): Promise<ClipRoyaltyResponseDto> {
    // Get existing royalty to use as defaults for partial updates
    const existing = await this.clipRoyaltyService.getRoyalty(clipId);

    const recipientAddress = dto.recipientAddress ?? existing?.recipientAddress;
    const basisPoints = dto.basisPoints ?? existing?.basisPoints ?? 0;
    const platformFeeBps = dto.platformFeeBps ?? existing?.platformFeeBps;

    if (!recipientAddress) {
      throw new BadRequestException(
        'recipientAddress is required for initial royalty configuration',
      );
    }

    return this.clipRoyaltyService.setRoyalty(
      clipId,
      recipientAddress,
      basisPoints,
      platformFeeBps,
    );
  }

  /**
   * POST /nfts/:clipId/royalty
   * Set royalty configuration for a clip
   */
  @Post(':clipId')
  @Auth()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Create new royalty configuration for a clip',
    description:
      'Creates a royalty configuration for a clip (if not already set). Rejected if BPS > 15% (1500 BPS).',
  })
  @ApiResponse({
    status: 201,
    description: 'Royalty configuration created successfully',
    type: ClipRoyaltyResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid royalty configuration',
  })
  @ApiResponse({
    status: 404,
    description: 'Clip not found',
  })
  async setRoyalty(
    @Param('clipId', ParseIntPipe) clipId: number,
    @Body() dto: SetClipRoyaltyDto,
  ): Promise<ClipRoyaltyResponseDto> {
    return this.clipRoyaltyService.setRoyalty(
      clipId,
      dto.recipientAddress,
      dto.basisPoints,
      dto.platformFeeBps,
    );
  }

  /**
   * POST /nfts/royalties/calculate
   * Calculate royalty amount for a sale
   */
  @Post('calculate')
  @ApiOperation({
    summary: 'Calculate royalty amount for a given sale price',
    description:
      'Calculates the royalty payout in stroops based on sale price and basis points',
  })
  @ApiResponse({
    status: 200,
    description: 'Royalty calculation completed successfully',
    type: RoyaltyCalculationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid calculation parameters',
  })
  async calculateRoyalty(
    @Body() dto: RoyaltyCalculationDto,
  ): Promise<RoyaltyCalculationResponseDto> {
    const royaltyAmount = this.clipRoyaltyService.calculateRoyaltyAmount(
      dto.salePrice,
      dto.basisPoints,
    );

    const percentage = ((dto.basisPoints / 10000) * 100).toFixed(2);

    return {
      salePrice: dto.salePrice,
      basisPoints: dto.basisPoints,
      royaltyAmount,
      percentage: `${percentage}%`,
    };
  }

  /**
   * GET /nfts/royalties/recipient/:address
   * Get all clips with royalties for a recipient (admin only)
   */
  @Get('recipient/:address')
  @Auth('admin')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all clip royalties for a recipient address (Admin only)',
    description: 'Retrieves all clips that have configured royalties for a given recipient wallet',
  })
  @ApiResponse({
    status: 200,
    description: 'Royalties retrieved successfully',
    type: [ClipRoyaltyResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - admin access required',
  })
  async getRoyaltiesForRecipient(
    @Param('address') address: string,
  ): Promise<ClipRoyaltyResponseDto[]> {
    return this.clipRoyaltyService.getRoyaltiesForRecipient(address);
  }
}
