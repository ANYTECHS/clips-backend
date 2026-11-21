import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { Address, Keypair, xdr, nativeToScVal } from '@stellar/stellar-sdk';
import { randomBytes } from 'crypto';
import { AuthorizeMintDto, MintAuthorizationResponseDto } from './dto/mint-authorization.dto';
import { NftContractError } from './contract-errors';

const MAX_TTL = 3600;

/**
 * Signs `MintAuthorization` payloads for the Soroban `mint_with_signature`
 * entrypoint and enforces a per-wallet mint cooldown off-chain (mirrors the
 * on-chain cooldown so clients get a 429 with retry timing early).
 */
@Injectable()
export class MintAuthorizationService {
  private readonly lastMint = new Map<string, number>();

  private get cooldownSeconds(): number {
    return Number(process.env.NFT_MINT_COOLDOWN_SECONDS ?? 0);
  }

  /** Seconds until `wallet` may mint again (0 = allowed). */
  cooldownRemaining(wallet: string, now = Math.floor(Date.now() / 1000)): number {
    const last = this.lastMint.get(wallet);
    if (last === undefined || this.cooldownSeconds <= 0) return 0;
    return Math.max(0, last + this.cooldownSeconds - now);
  }

  authorize(dto: AuthorizeMintDto): MintAuthorizationResponseDto {
    const secret = process.env.NFT_MINT_SIGNER_SECRET;
    const contractId = process.env.SOROBAN_NFT_CONTRACT_ID;
    if (!secret || !contractId) {
      throw new ServiceUnavailableException('Mint signer is not configured');
    }

    const now = Math.floor(Date.now() / 1000);
    const retryAfter = this.cooldownRemaining(dto.recipient, now);
    if (retryAfter > 0) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          error: NftContractError[NftContractError.CooldownActive],
          code: NftContractError.CooldownActive,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const expiration = now + Math.min(dto.ttlSeconds ?? 600, MAX_TTL);
    const nonce = randomBytes(8).readBigUInt64BE();
    const payload = this.buildPayload(contractId, dto, nonce, expiration);
    const keypair = Keypair.fromSecret(secret);
    const signature = keypair.sign(payload).toString('hex');

    // Recorded at authorization time; the contract records the actual mint.
    this.lastMint.set(dto.recipient, now);

    return {
      clipId: dto.clipId,
      tokenId: dto.tokenId,
      recipient: dto.recipient,
      metadataUri: dto.metadataUri,
      nonce: nonce.toString(),
      expiration,
      signature,
      signerPublicKey: keypair.rawPublicKey().toString('hex'),
    };
  }

  /**
   * XDR of the contract's `MintAuthorization` struct: an ScMap with symbol keys
   * in sorted order, matching `#[contracttype]` serialization.
   */
  buildPayload(
    contractId: string,
    dto: AuthorizeMintDto,
    nonce: bigint,
    expiration: number,
  ): Buffer {
    const entry = (k: string, v: xdr.ScVal) =>
      new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol(k), val: v });
    return xdr.ScVal.scvMap([
      entry('clip_id', nativeToScVal(String(dto.clipId), { type: 'string' })),
      entry('contract', new Address(contractId).toScVal()),
      entry('expiration', nativeToScVal(expiration, { type: 'u64' })),
      entry('metadata_uri', nativeToScVal(dto.metadataUri, { type: 'string' })),
      entry('nonce', nativeToScVal(nonce, { type: 'u64' })),
      entry('recipient', new Address(dto.recipient).toScVal()),
      entry('token_id', nativeToScVal(dto.tokenId, { type: 'u64' })),
    ]).toXDR();
  }
}
