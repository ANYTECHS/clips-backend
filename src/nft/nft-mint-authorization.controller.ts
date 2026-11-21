import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiOperation,
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
} from './dto/mint-authorization.dto';

/**
 * Contract error → HTTP mapping used across these endpoints
 * (see `contract-errors.ts`): Unauthorized→403, TokenNotFound→404,
 * InvalidRoyaltyBps/RoyaltyExceedsCap→400, ContractPaused→409, CooldownActive→429,
 * InvalidSignature/SignatureExpired→401, NonceAlreadyUsed/ClipAlreadyMinted→409.
 */
@ApiTags('nfts')
@ApiBearerAuth('access-token')
@ApiUnauthorizedResponse({ description: 'Missing/invalid JWT, or invalid/expired mint signature' })
@UseGuards(LoginGuard)
@Controller('nfts')
export class NftMintAuthorizationController {
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

}
