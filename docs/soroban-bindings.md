# Soroban TypeScript Contract Bindings

This document describes how frontend applications and client services integrate with the Clips NFT Soroban smart contract using generated TypeScript contract bindings.

## Overview

The contract bindings are located at:
`contracts/nft-contract/bindings/clips-nft-contract.ts`

These bindings provide strongly typed interfaces and methods for interacting with the on-chain contract, reducing integration errors and simplifying developer onboarding.

---

## Contract Import Example

```typescript
import {
  createClipsNftContractClient,
  ClipsNftContractClient,
  BatchMintParams,
} from '../contracts/nft-contract/bindings/clips-nft-contract';

// Initialize contract client
const client: ClipsNftContractClient = createClipsNftContractClient({
  contractId: process.env.NEXT_PUBLIC_SOROBAN_NFT_CONTRACT_ID!,
  rpcUrl: 'https://soroban-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
});
```

---

## Usage Examples

### 1. Batch Minting Clips (#671)

Mint multiple clip NFTs in a single transaction:

```typescript
const params: BatchMintParams = {
  to: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  tokenIds: [101n, 102n, 103n],
  clipIds: ['clip_101', 'clip_102', 'clip_103'],
  contentUris: [
    'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG',
    'ipfs://QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco',
    'ipfs://QmPZ9gcCEpqKToHD61vka2FZeZ7uhDP65le6HGWZX28w57',
  ],
  isSoulbound: [false, false, true],
};

await client.batchMint(params);
```

### 2. Updating Custom Token URI (#670)

Update metadata URI for an NFT (restricted to the NFT owner):

```typescript
const tokenId = 42n;
const newUri = 'ipfs://QmNewMetadataUriHash12345';

await client.setTokenUri(tokenId, newUri);
const updatedUri = await client.tokenUri(tokenId);
console.log('Updated Token URI:', updatedUri);
```

### 3. Fractional Royalty Calculations (#685)

Calculate sub-unit royalties for 7-decimal assets (XLM / stablecoins):

```typescript
// 10 XLM = 100,000,000 stroops (7 decimals)
const salePriceStroops = 100_000_000n;
const royaltyBps = 500; // 5.0%

const royaltyAmount = client.calculateFractionalRoyalty(
  salePriceStroops,
  royaltyBps,
  7 // decimals
);

console.log('Royalty stroops:', royaltyAmount); // 5_000_000n (0.5 XLM)
```

---

## API & Swagger Integration

The backend NestJS API exposes REST endpoints corresponding to contract operations:
- `POST /nfts/batch-mint`
- `PATCH /nfts/:id/token-uri`
- `GET /nfts/:mintAddress/royalty`
- `GET /nfts/contract/info`

Swagger API documentation is available at `/api/docs` when running the backend server.
