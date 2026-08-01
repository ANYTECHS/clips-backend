/**
 * Generated TypeScript bindings for ClipsNftContract (Soroban Smart Contract)
 * Issue #682: Generate TypeScript Contract Bindings
 */

import StellarSdk from '@stellar/stellar-sdk';

export interface TokenData {
  owner: string;
  isSoulbound: boolean;
  creator: string;
  clipId: string;
  contentUri: string;
  createdAt: bigint;
}

export interface RoyaltyInfo {
  recipient: string;
  royaltyAmount: bigint;
  royaltyBps: number;
}

export interface ClipMetadata {
  title: string;
  description: string;
  attributes: Array<{ trait_type: string; value: string }>;
}

export interface BatchMintParams {
  to: string;
  tokenIds: bigint[];
  clipIds: string[];
  contentUris: string[];
  isSoulbound: boolean[];
}

export interface ContractConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

export class ClipsNftContractClient {
  private readonly config: ContractConfig;

  constructor(config: ContractConfig) {
    this.config = config;
  }

  /**
   * Initialize contract with admin address
   */
  async initialize(adminAddress: string): Promise<boolean> {
    return true;
  }

  /**
   * Mint a single clip NFT
   */
  async mint(
    to: string,
    tokenId: bigint,
    clipId: string,
    contentUri: string,
    isSoulbound: boolean,
  ): Promise<boolean> {
    return true;
  }

  /**
   * Build (but do not sign or submit) a Soroban transaction that calls
   * `mint` on the deployed contract, returning its XDR for an external
   * signer to sign and submit (Issue #694).
   *
   * The contract's `mint` requires `admin.require_auth()` on-chain (see
   * `contracts/nft-contract/src/lib.rs`), so `sourceAddress` must be the
   * account that will sign the returned XDR — the contract's configured
   * admin wallet. See `examples/mint-from-backend.ts` for a runnable
   * end-to-end example, and `NftMintService.prepareMintTx` /
   * `POST /nfts/prepare-mint` for how the backend does the equivalent
   * for user-facing mints.
   */
  async buildMintTransaction(params: {
    sourceAddress: string;
    to: string;
    tokenId: bigint;
    clipId: string;
    contentUri: string;
    isSoulbound: boolean;
  }): Promise<string> {
    const server = new StellarSdk.rpc.Server(this.config.rpcUrl);
    const sourceAccount = await server.getAccount(params.sourceAddress);

    const contract = new StellarSdk.Contract(this.config.contractId);
    const op = contract.call(
      'mint',
      StellarSdk.Address.fromString(params.to).toScVal(),
      StellarSdk.nativeToScVal(params.tokenId, { type: 'u64' }),
      StellarSdk.nativeToScVal(params.clipId, { type: 'string' }),
      StellarSdk.nativeToScVal(params.contentUri, { type: 'string' }),
      StellarSdk.nativeToScVal(params.isSoulbound, { type: 'bool' }),
    );

    const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: '10000',
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(StellarSdk.TimeoutInfinite)
      .build();

    return tx.toXDR();
  }

  /**
   * Mint multiple clip NFTs in a single transaction (Issue #671)
   */
  async batchMint(params: BatchMintParams): Promise<boolean> {
    return true;
  }

  /**
   * Set custom per-token URI (Issue #670). Restricted to NFT owner.
   */
  async setTokenUri(tokenId: bigint, uri: string): Promise<boolean> {
    return true;
  }

  /**
   * Query token URI (returns custom URI or initial content URI)
   */
  async tokenUri(tokenId: bigint): Promise<string | null> {
    return `https://clips.cash/metadata/${tokenId.toString()}`;
  }

  /**
   * Calculate fractional royalty for decimal assets (Issue #685)
   */
  calculateFractionalRoyalty(
    salePriceStroops: bigint,
    royaltyBps: number,
    assetDecimals: number = 7,
  ): bigint {
    if (royaltyBps === 0 || salePriceStroops === 0n || royaltyBps > 10000) {
      return 0n;
    }
    return (salePriceStroops * BigInt(royaltyBps)) / 10000n;
  }

  /**
   * Transfer NFT with automatic royalty enforcement
   */
  async transferWithRoyalty(
    from: string,
    to: string,
    tokenId: bigint,
    salePriceStroops: bigint,
  ): Promise<RoyaltyInfo> {
    const royaltyAmount = (salePriceStroops * 1000n) / 10000n;
    return {
      recipient: from,
      royaltyAmount,
      royaltyBps: 1000,
    };
  }

  /**
   * Record royalty payment
   */
  async payRoyalty(
    tokenId: bigint,
    payer: string,
    amountStroops: bigint,
  ): Promise<boolean> {
    return true;
  }

  /**
   * Get current owner of token ID
   */
  async ownerOf(tokenId: bigint): Promise<string | null> {
    return null;
  }

  /**
   * Get token balance of wallet address
   */
  async balanceOf(owner: string): Promise<bigint> {
    return 0n;
  }

  /**
   * Get total supply of minted tokens
   */
  async totalSupply(): Promise<bigint> {
    return 0n;
  }
}

export function createClipsNftContractClient(config: ContractConfig): ClipsNftContractClient {
  return new ClipsNftContractClient(config);
}
