import StellarSdk from '@stellar/stellar-sdk';

export interface OwnershipVerificationResult {
  isOwner: boolean;
  ownerAddress?: string;
  error?: string;
}

export interface PaginatedUserTokensResult {
  tokenIds: number[];
  nextCursor: number | null;
  total: number;
}

export interface NftOwnershipVerificationStrategy {
  verifyOwnership(
    contractId: string,
    tokenId: string,
    walletAddress: string,
  ): Promise<OwnershipVerificationResult>;

  getOwner(
    contractId: string,
    tokenId: string,
  ): Promise<string | null>;

  getWalletTokenIds(
    contractId: string,
    walletAddress: string,
  ): Promise<number[]>;

  /**
   * On-chain paginated query: get_user_tokens(owner, limit, cursor) (Issue #838).
   * Optional — strategies may omit and fall back to getWalletTokenIds + slice.
   */
  getUserTokens?(
    contractId: string,
    walletAddress: string,
    limit: number,
    cursor: number,
  ): Promise<PaginatedUserTokensResult>;

  /**
   * Check whether a token with the given ID has been minted.
   * Returns true when the token exists on-chain, false otherwise (Issue #688).
   */
  tokenExists(
    contractId: string,
    tokenId: string,
  ): Promise<boolean>;
}

/**
 * Verifies ownership by simulating the Soroban NFT contract's owner_of call.
 */
export class SorobanOwnerOfVerificationStrategy implements NftOwnershipVerificationStrategy {
  constructor(
    private readonly rpcUrl: string,
    private readonly networkPassphrase: string,
  ) {}

  async verifyOwnership(
    contractId: string,
    tokenId: string,
    walletAddress: string,
  ): Promise<OwnershipVerificationResult> {
    const server = new StellarSdk.rpc.Server(this.rpcUrl);
    const contract = new StellarSdk.Contract(contractId);

    const op = contract.call(
      'owner_of',
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u128' }),
    );

    const sourceAccount = new StellarSdk.Account(walletAddress, '0');
    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    const simulation = await server.simulateTransaction(tx);

    if ('error' in simulation && simulation.error) {
      return {
        isOwner: false,
        error: `Simulation failed: ${simulation.error}`,
      };
    }

    const results = (simulation as { results?: Array<{ xdr?: string }> })
      .results;
    if (!results || results.length === 0) {
      return { isOwner: false, error: 'No simulation results returned' };
    }

    const result = results[0];
    if (!result.xdr) {
      return { isOwner: false, error: 'Missing result XDR' };
    }

    const returnValue = StellarSdk.xdr.ScVal.fromXDR(result.xdr, 'base64');
    const ownerAddress = StellarSdk.scValToNative(returnValue) as string;
    const isOwner = ownerAddress === walletAddress;

    return {
      isOwner,
      ownerAddress,
      error: isOwner ? undefined : 'Caller does not own the NFT on-chain',
    };
  }

  async getOwner(
    contractId: string,
    tokenId: string,
  ): Promise<string | null> {
    const server = new StellarSdk.rpc.Server(this.rpcUrl);
    const contract = new StellarSdk.Contract(contractId);

    // Using u64 to match the Rust contract definition of token_id
    const op = contract.call(
      'owner_of',
      StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    );

    // Provide a dummy source account for the simulation
    const sourceAccount = new StellarSdk.Account('GAX27MIGK7I74E2V4E4YVYYYFNYNNHNNGZ7V4P3XYF4K62NN7NNNNNNN', '0');
    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    const simulation = await server.simulateTransaction(tx);

    if ('error' in simulation && simulation.error) {
      return null;
    }

    const results = (simulation as { results?: Array<{ xdr?: string }> }).results;
    if (!results || results.length === 0 || !results[0].xdr) {
      return null;
    }

    try {
      const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
      if (returnValue.switch() === StellarSdk.xdr.ScValType.scvVoid()) {
        return null;
      }
      return StellarSdk.scValToNative(returnValue) as string;
    } catch {
      return null;
    }
  }

  async getWalletTokenIds(
    contractId: string,
    walletAddress: string,
  ): Promise<number[]> {
    const server = new StellarSdk.rpc.Server(this.rpcUrl);
    const ownerScVal = new StellarSdk.Address(walletAddress).toScVal();

    const ledgerKey = StellarSdk.xdr.LedgerKey.contractData(
      new StellarSdk.xdr.LedgerKeyContractData({
        contract: new StellarSdk.Address(contractId).toScAddress(),
        key: ownerScVal,
        durability: StellarSdk.xdr.ContractDataDurability.persistent(),
      })
    );

    try {
      const response = await server.getLedgerEntries(ledgerKey);
      if (!response || !response.entries || response.entries.length === 0) {
        return [];
      }

      const entry = response.entries[0];
      const ledgerEntryData = StellarSdk.xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
      const contractData = ledgerEntryData.contractData();
      const val = contractData.val();

      if (val.switch() === StellarSdk.xdr.ScValType.scvVec()) {
        const vec = val.vec();
        if (!vec) return [];
        return vec.map(v => {
          const nativeVal = StellarSdk.scValToNative(v);
          return Number(nativeVal);
        });
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Call on-chain `get_user_tokens(owner, limit, cursor)` to avoid loading
   * entire large collections into memory (Issue #838).
   *
   * Expected return shapes (any accepted):
   * - { tokens: u64[], next_cursor: Option<u64>, total: u64 }
   * - [tokenIds[], nextCursor, total]
   * Falls back to ledger iteration + local slice when the call fails.
   */
  async getUserTokens(
    contractId: string,
    walletAddress: string,
    limit: number,
    cursor: number,
  ): Promise<PaginatedUserTokensResult> {
    const effectiveLimit = Math.min(Math.max(limit, 1), 100);
    const effectiveCursor = Math.max(cursor, 0);

    try {
      const server = new StellarSdk.rpc.Server(this.rpcUrl);
      const contract = new StellarSdk.Contract(contractId);
      const op = contract.call(
        'get_user_tokens',
        StellarSdk.Address.fromString(walletAddress).toScVal(),
        StellarSdk.nativeToScVal(effectiveLimit, { type: 'u32' }),
        StellarSdk.nativeToScVal(effectiveCursor, { type: 'u32' }),
      );

      const sourceAccount = new StellarSdk.Account(
        'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
        '0',
      );
      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: '100',
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(op)
        .setTimeout(StellarSdk.TimeoutInfinite)
        .build();

      const simulation = await server.simulateTransaction(tx);
      if ('error' in simulation && simulation.error) {
        throw new Error(String(simulation.error));
      }

      const results = (simulation as { results?: Array<{ xdr?: string }> }).results;
      if (!results?.[0]?.xdr) {
        throw new Error('No simulation result from get_user_tokens');
      }

      const returnValue = StellarSdk.xdr.ScVal.fromXDR(results[0].xdr, 'base64');
      const native = StellarSdk.scValToNative(returnValue);
      return this.decodePaginatedTokens(native, effectiveLimit, effectiveCursor);
    } catch {
      // Optimized fallback: still paginate locally without returning the full list to callers
      const allTokens = await this.getWalletTokenIds(contractId, walletAddress);
      const total = allTokens.length;
      const start = Math.min(effectiveCursor, total);
      const end = Math.min(start + effectiveLimit, total);
      return {
        tokenIds: allTokens.slice(start, end),
        nextCursor: end < total ? end : null,
        total,
      };
    }
  }

  private decodePaginatedTokens(
    native: unknown,
    limit: number,
    cursor: number,
  ): PaginatedUserTokensResult {
    if (Array.isArray(native)) {
      // [tokenIds, nextCursor, total] or just tokenIds
      if (
        native.length >= 2 &&
        Array.isArray(native[0])
      ) {
        const tokenIds = (native[0] as unknown[]).map((t) => Number(t));
        const nextRaw = native[1];
        const total = native.length >= 3 ? Number(native[2]) : tokenIds.length;
        const nextCursor =
          nextRaw == null ? null : Number(nextRaw);
        return {
          tokenIds,
          nextCursor:
            nextCursor != null && Number.isFinite(nextCursor)
              ? nextCursor
              : null,
          total: Number.isFinite(total) ? total : tokenIds.length,
        };
      }
      const tokenIds = native.map((t) => Number(t));
      return {
        tokenIds,
        nextCursor: tokenIds.length >= limit ? cursor + tokenIds.length : null,
        total: tokenIds.length,
      };
    }

    if (native && typeof native === 'object') {
      const obj = native as Record<string, unknown>;
      const rawTokens =
        (obj.tokens as unknown[]) ||
        (obj.token_ids as unknown[]) ||
        (obj.tokenIds as unknown[]) ||
        [];
      const tokenIds = rawTokens.map((t) => Number(t));
      const nextRaw = obj.next_cursor ?? obj.nextCursor ?? null;
      const total = Number(obj.total ?? tokenIds.length);
      return {
        tokenIds,
        nextCursor: nextRaw == null ? null : Number(nextRaw),
        total: Number.isFinite(total) ? total : tokenIds.length,
      };
    }

    return { tokenIds: [], nextCursor: null, total: 0 };
  }

  /**
   * Lightweight token existence check (Issue #688).
   * Calls `owner_of` on the contract — if we get a non-null owner back,
   * the token exists. If the simulation errors or returns void, it doesn't.
   */
  async tokenExists(
    contractId: string,
    tokenId: string,
  ): Promise<boolean> {
    const owner = await this.getOwner(contractId, tokenId);
    return owner !== null;
  }
}
