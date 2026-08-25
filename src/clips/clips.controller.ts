/**
 * ClipsController — HTTP endpoints for clip management.
 *
 * Issue #747: PATCH /clips/:id/royalty-bps
 *   Lets creators set a custom royalty percentage (0–15%) on a clip
 *   before minting it as an NFT on the Stellar Soroban network.
 */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { ClipsService } from './clips.service';
import { SetRoyaltyBpsDto, SetRoyaltyBpsResponseDto } from './dto/set-royalty-bps.dto';
import { LoginGuard } from '../auth/guards/login.guard';

@ApiTags('clips')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Unauthorized' })
@UseGuards(LoginGuard)
@Controller('clips')
export class ClipsController {
  constructor(private readonly clipsService: ClipsService) {}

  /**
   * PATCH /clips/:id/royalty-bps
   *
   * Issue #747: Set (or reset) the royalty basis points for a clip.
   *
   * - Range: 0–1500 (0–15%)
   * - Default: 1000 (10%) when body is empty or royaltyBps is omitted
   * - Caller must own the clip
   * - The stored value is passed to the Soroban mint instruction
   */
  @Patch(':id/royalty-bps')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set royalty BPS for a clip (Issue #747)',
    description:
      'Stores a custom royalty percentage for the clip in basis points (BPS). ' +
      '100 BPS = 1%. Allowed range: 0–1500 (0–15%). ' +
      'Defaults to 1000 (10%) when royaltyBps is omitted. ' +
      'The value is included in the Soroban mint transaction when the clip is minted as an NFT.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', example: 42 })
  @ApiOkResponse({
    description: 'Royalty BPS stored successfully',
    type: SetRoyaltyBpsResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'royaltyBps is out of range (must be 0–1500)',
  })
  @ApiForbiddenResponse({ description: 'Caller does not own the clip' })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async setRoyaltyBps(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetRoyaltyBpsDto,
    @Req() req: Request,
  ): Promise<SetRoyaltyBpsResponseDto> {
    const userId = Number((req as any).user?.id ?? 0);
    return this.clipsService.setRoyaltyBps(id, userId, dto.royaltyBps);
  }

  /**
   * GET /clips/:id/royalty-bps
   *
   * Returns the current royalty BPS for the clip.
   */
  @Get(':id/royalty-bps')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get royalty BPS for a clip (Issue #747)',
    description: 'Returns the currently configured royalty basis points for the clip.',
  })
  @ApiParam({ name: 'id', description: 'Clip ID', example: 42 })
  @ApiOkResponse({
    description: 'Current royalty BPS returned',
    type: SetRoyaltyBpsResponseDto,
  })
  @ApiNotFoundResponse({ description: 'Clip not found' })
  async getRoyaltyBps(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<SetRoyaltyBpsResponseDto> {
    return this.clipsService.getRoyaltyBps(id);
  }
}
