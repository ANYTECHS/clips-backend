import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import StellarSdk from '@stellar/stellar-sdk';
import { StellarService } from '../stellar/stellar.service';
import {
  CircuitBreakerService,
  CircuitBreakerConfig,
} from '../common/circuit-breaker/circuit-breaker.service';
import {
  ApproveNftResponseDto,
  GetApprovedResponseDto,
  IsApprovedForAllResponseDto,
  SetApprovalForAllResponseDto,
} from './dto/nft-approval.dto';

/**
 * NFT marketplace approval helpers (Issue #842).
 *
 * Implements approve / set_approval_for_all / get_approved / is_approved_for_all
 * against the ClipCash Soroban NFT contract. Mutations return unsigned XDR for
 * the owner to sign; queries simulate view calls.
 */
@Injectable()
export class NftApprovalService {
  private readonly logger = new Logger(NftApprovalService.name);

  private readonly sorobanCircuitBreakerConfig: CircuitBreakerConfig = {
    name: 'soroban-nft-approval',
    failureThreshold: 5,
    recoveryTimeout: 30000,
    samplingDuration: 60000,
  };

  constructor(
    private readonly stellarService: StellarService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  private get CONTRACT_ID(): string {
    return (
      process.env.SOROBAN_NFT_CONTRACT_ID ||
      'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEU4'
    );
  }

  private assertAddress(address: string, field: string): void {
    const check = this.stellarService.validateAddress(address);
    if (!check.valid) {
      throw new BadRequestException(
        `Invalid ${field}: ${check.message ?? 'invalid Stellar address'}`,
      );
    }
  }

  /**
   * Prepare `approve(owner, spender, token_id)`. Empty spender revokes approval.
   */
  async prepareApprove(
    tokenId: number,
    ownerAddress: string,
    spenderAddress?: string | null,
  ): Promise<ApproveNftResponseDto> {
    if (!Number.isInteger(tokenId) || tokenId < 0) {
      throw new BadRequestException('tokenId must be a non-negative integer');
    }
    this.assertAddress(ownerAddress, 'ownerAddress');

    const spender = (spenderAddress ?? '').trim();
    if (spender) {
      this.assertAddress(spender, 'spenderAddress');
    }

    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const sourceAccount = await this.circuitBreakerService.execute(
      this.sorobanCircuitBreakerConfig,
      async () => server.getAccount(ownerAddress),
    );

    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const spenderScVal = spender
      ? StellarSdk.Address.fromString(spender).toScVal()
      : StellarSdk.nativeToScVal(null);

    const op = contract.call(
      'approve',
      StellarSdk.Address.fromString(ownerAddress).toScVal(),
      spenderScVal,
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return {
      xdr: tx.toXDR(),
      tokenId,
      owner: ownerAddress,
      spender,
      contractId: this.CONTRACT_ID,
      network: this.stellarService.network,
      emits: 'Approval',
    };
  }

  /**
   * Prepare `set_approval_for_all(owner, operator, approved)`.
   */
  async prepareSetApprovalForAll(
    ownerAddress: string,
    operatorAddress: string,
    approved: boolean,
  ): Promise<SetApprovalForAllResponseDto> {
    this.assertAddress(ownerAddress, 'ownerAddress');
    this.assertAddress(operatorAddress, 'operatorAddress');

    if (typeof approved !== 'boolean') {
      throw new BadRequestException('approved must be a boolean');
    }

    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const sourceAccount = await this.circuitBreakerService.execute(
      this.sorobanCircuitBreakerConfig,
      async () => server.getAccount(ownerAddress),
    );

    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call(
      'set_approval_for_all',
      StellarSdk.Address.fromString(ownerAddress).toScVal(),
      StellarSdk.Address.fromString(operatorAddress).toScVal(),
      StellarSdk.nativeToScVal(approved, { type: 'bool' }),
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return {
      xdr: tx.toXDR(),
      owner: ownerAddress,
      operator: operatorAddress,
      approved,
      contractId: this.CONTRACT_ID,
      network: this.stellarService.network,
      emits: 'ApprovalForAll',
    };
  }

  /**
   * Query `get_approved(token_id)`.
   */
  async getApproved(tokenId: number): Promise<GetApprovedResponseDto> {
    if (!Number.isInteger(tokenId) || tokenId < 0) {
      throw new BadRequestException('tokenId must be a non-negative integer');
    }

    const native = await this.simulateCall(
      'get_approved',
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    );

    const approved =
      native == null || native === ''
        ? null
        : typeof native === 'string'
          ? native
          : String(native);

    return {
      tokenId,
      approved,
      contractId: this.CONTRACT_ID,
    };
  }

  /**
   * Query `is_approved_for_all(owner, operator)`.
   */
  async isApprovedForAll(
    ownerAddress: string,
    operatorAddress: string,
  ): Promise<IsApprovedForAllResponseDto> {
    this.assertAddress(ownerAddress, 'ownerAddress');
    this.assertAddress(operatorAddress, 'operatorAddress');

    const native = await this.simulateCall(
      'is_approved_for_all',
      StellarSdk.Address.fromString(ownerAddress).toScVal(),
      StellarSdk.Address.fromString(operatorAddress).toScVal(),
    );

    return {
      owner: ownerAddress,
      operator: operatorAddress,
      approved: Boolean(native),
    };
  }

  private async simulateCall(fnName: string, ...args: any[]): Promise<unknown> {
    const server = new StellarSdk.rpc.Server(this.stellarService.rpcUrl);
    const contract = new StellarSdk.Contract(this.CONTRACT_ID);
    const op = contract.call(fnName, ...args);

    const dummyAccount = new StellarSdk.Account(
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
      '0',
    );

    const tx = new StellarSdk.TransactionBuilder(dummyAccount, {
      fee: '100',
      networkPassphrase: this.stellarService.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    let simulation: Awaited<ReturnType<typeof server.simulateTransaction>>;
    try {
      simulation = await this.circuitBreakerService.execute(
        this.sorobanCircuitBreakerConfig,
        async () => server.simulateTransaction(tx),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to call ${fnName}(): ${msg}`);
      throw new InternalServerErrorException(
        `Failed to query contract ${fnName}(): ${msg}`,
      );
    }

    const results = (simulation as { results?: Array<{ xdr: string }> }).results;
    if (!results?.[0]?.xdr) {
      return null;
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
    return StellarSdk.scValToNative(returnValue);
  }
}
