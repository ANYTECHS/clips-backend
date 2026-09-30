# Soroban NFT events

## Event conventions

Use the same event names and capitalization at the contract boundary and in the indexed API. Soroban `topics[0]` is the event name. Put identifiers and addresses needed for filtering in subsequent topics; put amounts, metadata, configuration values, and other details in the event value. Soroban permits at most four topics, including the event name.

| Event                  | Indexed topics after the name                             | Event value fields                                             |
| ---------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `Mint`                 | `token_id`, `to_address`                                  | `metadata_uri`                                                 |
| `Transfer`             | `token_id`, `from_address`, `to_address`                  | Optional transfer details                                      |
| `RoyaltyUpdated`       | `token_id` when token-scoped; `recipient` when applicable | `royalty_bps`, previous and new recipient/configuration values |
| `ConfigurationUpdated` | `config_key`, `actor`                                     | `old_value`, `new_value`                                       |
| `MetadataRefreshed`    | `token_id`, `actor` when available                        | `metadata_uri`                                                 |
| `Paused` / `Unpaused`  | `actor`                                                   | Optional reason                                                |
| `Frozen` / `Unfrozen`  | `token_id`, `actor` when available                        | Optional reason                                                |
| `Burn`                 | `token_id`, `from_address`                                | Optional burn details                                          |
| `RoyaltyPaid`          | `token_id`, `from_address`, `to_address`                  | `amount`, `asset`                                              |
| `RoyaltyClaimed`       | `token_id`, `to_address`                                  | `amount`, `asset`                                              |

Use `Paused`/`Unpaused` for contract-wide pause state and `Frozen`/`Unfrozen` for token-level freeze state. Use `RoyaltyUpdated` for royalty recipient/rate changes and `ConfigurationUpdated` for other contract configuration changes. Emit events only after the corresponding state transition succeeds.

The indexer preserves Soroban topics and value under the event DTO's `payload` field, and extracts common token IDs, addresses, amounts, and assets into top-level DTO fields when recognizable. Optional fields are `null` when the event does not carry that value.

## Supported event types

The API and indexer recognize `Mint`, `Transfer`, `RoyaltyUpdated`, `ConfigurationUpdated`, `MetadataRefreshed`, `Paused`, `Unpaused`, `Frozen`, `Unfrozen`, `Burn`, `RoyaltyPaid`, and `RoyaltyClaimed`. Event names are case-sensitive.

## API

`GET /soroban/events` returns indexed events with optional `type`, `tokenId`, `page`, and `limit` query parameters. `GET /nfts/:tokenId/events` returns the same response filtered by the required token ID, with optional `type`, `page`, and `limit`. `GET /blockchain/events` remains available as the original equivalent feed and accepts both `type` and `tokenId` filters.

The response is a `BlockchainEventsResponseDto`:

```json
{
  "data": [
    {
      "id": "clxyz123",
      "eventType": "Transfer",
      "tokenId": 42,
      "fromAddress": "G...",
      "toAddress": "G...",
      "amount": null,
      "asset": null,
      "txHash": "a1b2c3...",
      "eventIndex": 0,
      "ledger": 1234567,
      "payload": {
        "topics": ["Transfer", 42, "G...", "G..."],
        "value": {}
      },
      "createdAt": "2026-08-29T05:00:00.000Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 20,
    "totalPages": 1
  }
}
```

Swagger documents these backend routes and the event DTOs. Swagger cannot describe Soroban contract emissions themselves; the contract interface/event catalog is therefore specified above.

## Contract source boundary

This repository contains the Soroban RPC indexer and API, but no Soroban contract source or contract-level event tests. The list above defines the event names and topic/value convention consumed by this backend. The contract implementation must emit the events and have its own tests in the repository that owns the contract source.
