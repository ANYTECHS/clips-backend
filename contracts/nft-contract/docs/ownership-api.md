# ClipCash NFT — Ownership API Reference

This document outlines the REST API endpoints used to query NFT ownership and balances. These endpoints act as proxies to the underlying Soroban smart contract, providing standard ERC721-like capabilities required for marketplace compatibility.

---

## Data Source
All data returned by these endpoints is sourced directly from the on-chain Soroban contract using the `STELLAR_NETWORK` environment variable (testnet or public). We do **not** serve cached database records for ownership, ensuring that secondary market transfers are immediately reflected.

---

## 1. Get Token Owner

Retrieves the current owner of a specific NFT.

**Endpoint:** `GET /nfts/:id/owner`

### Parameters
| Name | In | Type | Description |
|---|---|---|---|
| `id` | path | integer | The numeric token ID (assigned at mint time) |

### Responses

#### `200 OK`
Returns the Stellar wallet address of the owner. If the token has not been minted, `owner` will be `null`.

```json
{
  "owner": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3"
}
```

#### `400 Bad Request`
If the token ID is not a positive integer.

```json
{
  "statusCode": 400,
  "message": "Token ID must be a positive integer",
  "error": "Bad Request"
}
```

---

## 2. Get Wallet NFTs

Retrieves the balance and token IDs of all NFTs currently held by a given wallet address.

**Endpoint:** `GET /wallets/:address/nfts`

### Parameters
| Name | In | Type | Description |
|---|---|---|---|
| `address` | path | string | The Stellar wallet address (starts with 'G', 56 chars) |

### Responses

#### `200 OK`
Returns the total balance and an array of numeric token IDs. If the wallet owns no tokens, `tokenIds` will be an empty array and `balance` will be `0`.

```json
{
  "address": "GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3",
  "tokenIds": [42, 51],
  "balance": 2
}
```

#### `400 Bad Request`
If the provided address is not a valid Stellar Ed25519 public key.

```json
{
  "statusCode": 400,
  "message": "Invalid Stellar wallet address",
  "error": "Bad Request"
}
```
