import StellarSdk from '@stellar/stellar-sdk';

export interface SorobanTestContext {
  server: StellarSdk.rpc.Server;
  contractId: string;
  sourceAccount: StellarSdk.Account;
  networkPassphrase: string;
  fee?: string;
}

export interface SorobanTestCall {
  transaction: StellarSdk.Transaction;
  simulation: Awaited<ReturnType<StellarSdk.rpc.Server['simulateTransaction']>>;
  functionName: string;
}

export interface TestRoyaltyShare {
  recipient: string;
  bps: number;
}

async function simulateContractCall(
  context: SorobanTestContext,
  functionName: string,
  args: StellarSdk.xdr.ScVal[],
): Promise<SorobanTestCall> {
  const contract = new StellarSdk.Contract(context.contractId);
  const transaction = new StellarSdk.TransactionBuilder(context.sourceAccount, {
    fee: context.fee ?? '10000',
    networkPassphrase: context.networkPassphrase,
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(StellarSdk.TimeoutInfinite)
    .build();

  const simulation = await context.server.simulateTransaction(transaction);
  return { transaction, simulation, functionName };
}

/** Prepare and simulate a mint using configurable token, owner, metadata, and royalty values. */
export function mint_test_clip(
  context: SorobanTestContext,
  options: {
    tokenId?: number;
    owner: string;
    metadata?: string;
    royaltyBps?: number;
  },
): Promise<SorobanTestCall> {
  const tokenId = options.tokenId ?? 1;
  const metadata = options.metadata ?? `https://example.test/nft/${tokenId}.json`;
  const royaltyBps = options.royaltyBps ?? 1000;

  return simulateContractCall(context, 'mint', [
    StellarSdk.Address.fromString(options.owner).toScVal(),
    StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    StellarSdk.nativeToScVal(metadata, { type: 'string' }),
    StellarSdk.nativeToScVal(royaltyBps, { type: 'u32' }),
  ]);
}

/** Prepare and simulate set_royalties with configurable recipient shares. */
export function set_test_royalty(
  context: SorobanTestContext,
  options: {
    tokenId?: number;
    shares: TestRoyaltyShare[];
  },
): Promise<SorobanTestCall> {
  const tokenId = options.tokenId ?? 1;
  const royaltyMap = new Map(
    options.shares.map(({ recipient, bps }) => [
      StellarSdk.Address.fromString(recipient),
      bps,
    ]),
  );

  return simulateContractCall(context, 'set_royalties', [
    StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    StellarSdk.nativeToScVal(royaltyMap, { type: 'map' }),
  ]);
}

/** Prepare and simulate a transfer_with_royalty call with configurable sale values. */
export function simulate_test_sale(
  context: SorobanTestContext,
  options: {
    tokenId?: number;
    seller: string;
    buyer: string;
    salePrice: bigint | number;
    royaltyBps?: number;
  },
): Promise<SorobanTestCall> {
  const tokenId = options.tokenId ?? 1;
  const royaltyBps = options.royaltyBps ?? 1000;

  return simulateContractCall(context, 'transfer_with_royalty', [
    StellarSdk.nativeToScVal(BigInt(tokenId), { type: 'u64' }),
    StellarSdk.Address.fromString(options.seller).toScVal(),
    StellarSdk.Address.fromString(options.buyer).toScVal(),
    StellarSdk.nativeToScVal(BigInt(options.salePrice), { type: 'i128' }),
    StellarSdk.nativeToScVal(royaltyBps, { type: 'u32' }),
  ]);
}