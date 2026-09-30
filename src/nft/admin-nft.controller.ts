import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiConflictResponse,
} from '@nestjs/swagger';
import { NftFreezeAdminGuard } from './guards/nft-freeze-admin.guard';
import { PrepareNftFreezeDto } from './dto/freeze-nft.dto';
import { AdminContractService } from './admin-contract.service';

@ApiTags('nfts')
@Controller('admin/nfts')
export class AdminNftController {
  constructor(private readonly adminContractService: AdminContractService) {}

  @UseGuards(NftFreezeAdminGuard)
  @Post(':tokenId/freeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare an NFT freeze transaction',
    description:
      'Builds an unsigned Soroban freeze(token_id) transaction. Requires the x-admin-secret header; ' +
      'the supplied admin wallet must be the NFT contract admin and must sign and submit the returned XDR.',
  })
  @ApiHeader({ name: 'x-admin-secret', required: true, description: 'Must match ADMIN_SECRET' })
  @ApiParam({ name: 'tokenId', description: 'u32 NFT token ID', example: 42 })
  @ApiResponse({ status: 200, description: 'Unsigned freeze transaction XDR returned' })
  @ApiForbiddenResponse({ description: 'Missing or invalid x-admin-secret header' })
  @ApiNotFoundResponse({ description: 'NFT token does not exist' })
  @ApiConflictResponse({ description: 'NFT is already frozen' })
  async freeze(
    @Param('tokenId', ParseIntPipe) tokenId: number,
    @Body() body: PrepareNftFreezeDto,
  ) {
    return this.adminContractService.prepareTokenFreezeTx(
      tokenId,
      body.adminAddress,
      true,
    );
  }

  @UseGuards(NftFreezeAdminGuard)
  @Post(':tokenId/unfreeze')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Prepare an NFT unfreeze transaction',
    description:
      'Builds an unsigned Soroban unfreeze(token_id) transaction. Requires the x-admin-secret header; ' +
      'the supplied admin wallet must be the NFT contract admin and must sign and submit the returned XDR.',
  })
  @ApiHeader({ name: 'x-admin-secret', required: true, description: 'Must match ADMIN_SECRET' })
  @ApiParam({ name: 'tokenId', description: 'u32 NFT token ID', example: 42 })
  @ApiResponse({ status: 200, description: 'Unsigned unfreeze transaction XDR returned' })
  @ApiForbiddenResponse({ description: 'Missing or invalid x-admin-secret header' })
  @ApiNotFoundResponse({ description: 'NFT token does not exist' })
  @ApiConflictResponse({ description: 'NFT is not frozen' })
  async unfreeze(
    @Param('tokenId', ParseIntPipe) tokenId: number,
    @Body() body: PrepareNftFreezeDto,
  ) {
    return this.adminContractService.prepareTokenFreezeTx(
      tokenId,
      body.adminAddress,
      false,
    );
  }
}