import StellarSdk from '@stellar/stellar-sdk';

export interface OwnershipVerificationResult {
  isOwner: boolean;
  ownerAddress?: string;
  error?: string;
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
          // In Rust u64 is returned as ScValType.scvU64. The SDK parses it to a BigInt or struct.
          // Let's use scValToNative to safely extract it.
          const nativeVal = StellarSdk.scValToNative(v);
          return Number(nativeVal);
        });
      }
      return [];
    } catch (e) {
      return [];
    }
  }
}
