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
}

/**
 * Verifies ownership by simulating the Soroban NFT contract's owner_of call.
 */
export class SorobanOwnerOfVerificationStrategy
  implements NftOwnershipVerificationStrategy
{
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

    const results = (simulation as { results?: Array<{ xdr?: string }> }).results;
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
}
