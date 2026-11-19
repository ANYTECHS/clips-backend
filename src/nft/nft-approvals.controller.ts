import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { LoginGuard } from '../auth/guards/login.guard';
import { NftMintGuard } from './guards/nft-mint.guard';
import { MintAuthorizationService } from './mint-authorization.service';
import {
  AuthorizeMintDto,
  CooldownErrorDto,
  MintAuthorizationResponseDto,
  RevokeApprovalResponseDto,
} from './dto/mint-authorization.dto';

const contractId = () =>
  process.env.SOROBAN_NFT_CONTRACT_ID ??
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4';

/**
 * Contract error → HTTP mapping used across these endpoints
 * (see `contract-errors.ts`): Unauthorized→403, TokenNotFound→404,
 * InvalidRoyaltyBps→400, ContractPaused→409, CooldownActive→429,
 * InvalidSignature/SignatureExpired→401, NonceAlreadyUsed/ClipAlreadyMinted→409.
 */
@ApiTags('nfts')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing/invalid JWT, or invalid/expired mint signature' })
@UseGuards(LoginGuard)
@Controller('nfts')
export class NftApprovalsController {
  constructor(private readonly mintAuthorization: MintAuthorizationService) {}

  @Post('mint/authorize')
  @UseGuards(NftMintGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Issue a backend-signed mint authorization',
    description:
      'Returns an Ed25519 signature over the XDR `MintAuthorization` payload ' +
      '(contract, recipient, tokenId, clipId, metadataUri, nonce, expiration). ' +
      'The recipient submits it to `mint_with_signature`. Nonces are single-use and ' +
      'the signature expires at `expiration`. The signing private key is never exposed. ' +
      'Rate limit: one mint per wallet per `NFT_MINT_COOLDOWN_SECONDS`.',
  })
  @ApiBody({ type: AuthorizeMintDto })
  @ApiResponse({ status: 201, type: MintAuthorizationResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload (clip ID, wallet, metadata URI)' })
  @ApiForbiddenResponse({ description: 'User does not own the clip (Unauthorized)' })
  @ApiConflictResponse({ description: 'ClipAlreadyMinted, NonceAlreadyUsed or ContractPaused' })
  @ApiResponse({
    status: 429,
    type: CooldownErrorDto,
    description: 'CooldownActive — wallet is in mint cooldown; `retryAfter` gives seconds to wait',
  })
  authorize(@Body() dto: AuthorizeMintDto): MintAuthorizationResponseDto {
    return this.mintAuthorization.authorize(dto);
  }

  @Delete(':tokenId/approval')
  @ApiOperation({
    summary: 'Revoke the approval on a single NFT',
    description: 'Builds a `revoke_approval(owner, token_id)` call for the owner to sign.',
  })
  @ApiParam({ name: 'tokenId', type: Number })
  @ApiQuery({ name: 'owner', description: 'Owner Stellar wallet (G...)' })
  @ApiOkResponse({ type: RevokeApprovalResponseDto })
  @ApiForbiddenResponse({ description: 'Caller is not the token owner (Unauthorized)' })
  @ApiNotFoundResponse({ description: 'TokenNotFound or ApprovalNotFound' })
  @ApiConflictResponse({ description: 'ContractPaused or TokenFrozen' })
  revokeApproval(
    @Param('tokenId', ParseIntPipe) tokenId: number,
    @Query('owner') owner: string,
  ): RevokeApprovalResponseDto {
    return { contractId: contractId(), method: 'revoke_approval', args: [owner, tokenId] };
  }

  @Delete('approvals')
  @ApiOperation({
    summary: 'Revoke all approvals granted by the owner',
    description:
      'Builds a `revoke_all_approvals(owner)` call that clears every per-token ' +
      'approval and every operator (approval-for-all) of the owner.',
  })
  @ApiQuery({ name: 'owner', description: 'Owner Stellar wallet (G...)' })
  @ApiOkResponse({ type: RevokeApprovalResponseDto })
  @ApiForbiddenResponse({ description: 'Caller is not the owner (Unauthorized)' })
  @ApiNotFoundResponse({ description: 'Owner wallet not found' })
  @ApiConflictResponse({ description: 'ContractPaused' })
  revokeAll(@Query('owner') owner: string): RevokeApprovalResponseDto {
    return { contractId: contractId(), method: 'revoke_all_approvals', args: [owner] };
  }
}
