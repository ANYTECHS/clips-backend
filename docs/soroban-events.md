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
| `Refunded`             | `token_id`, `to_address`                                  | `amount`, `asset`                                               |
| `RoyaltyPaid`          | `token_id`, `from_address`, `to_address`                  | `amount`, `asset`                                              |
| `RoyaltyClaimed`       | `token_id`, `to_address`                                  | `amount`, `asset`                                              |

Use `Paused`/`Unpaused` for contract-wide pause state and `Frozen`/`Unfrozen` for token-level freeze state. Use `RoyaltyUpdated` for royalty recipient/rate changes and `ConfigurationUpdated` for other contract configuration changes. Emit events only after the corresponding state transition succeeds.

The indexer preserves Soroban topics and value under the event DTO's `payload` field, and extracts common token IDs, addresses, amounts, and assets into top-level DTO fields when recognizable. Optional fields are `null` when the event does not carry that value.

## Supported event types

The API and indexer recognize `Mint`, `Transfer`, `RoyaltyUpdated`, `ConfigurationUpdated`, `MetadataRefreshed`, `Paused`, `Unpaused`, `Frozen`, `Unfrozen`, `Burn`, `Refunded`, `RoyaltyPaid`, and `RoyaltyClaimed`. Event names are case-sensitive.

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

## Example event schemas

The three highest-traffic events, shown with their full indexed DTO. Optional fields are `null` when the event does not carry them.

### `Mint`

```json
{
  "id": "clxyz456",
  "eventType": "Mint",
  "tokenId": 42,
  "fromAddress": null,
  "toAddress": "GCREATOR",
  "amount": null,
  "asset": null,
  "txHash": "a1b2c3d4e5f6...",
  "eventIndex": 0,
  "ledger": 1234567,
  "payload": {
    "topics": ["Mint", 42, "GCREATOR"],
    "value": { "metadata_uri": "bafybeigdyrzt..." }
  },
  "createdAt": "2026-08-29T05:00:00.000Z"
}
```

`fromAddress` is `null` because a mint has no sender. `tokenId` is `topics[1]` and the new owner is `toAddress` (`topics[2]`).

### `Transfer`

```json
{
  "id": "clxyz789",
  "eventType": "Transfer",
  "tokenId": 42,
  "fromAddress": "GSELLER",
  "toAddress": "GBUYER",
  "amount": null,
  "asset": null,
  "txHash": "f6e5d4c3b2a1...",
  "eventIndex": 1,
  "ledger": 1234800,
  "payload": {
    "topics": ["Transfer", 42, "GSELLER", "GBUYER"],
    "value": {}
  },
  "createdAt": "2026-08-29T06:00:00.000Z"
}
```

`amount` and `asset` stay `null` for a plain ownership transfer; they are populated for sale-style transfers that carry a price in the value.

### `RoyaltyPaid`

```json
{
  "id": "clxyz012",
  "eventType": "RoyaltyPaid",
  "tokenId": 42,
  "fromAddress": "GBUYER",
  "toAddress": "GCREATOR",
  "amount": "150000000",
  "asset": "CCONTRACT",
  "txHash": "9988776655...",
  "eventIndex": 3,
  "ledger": 1234999,
  "payload": {
    "topics": ["RoyaltyPaid", 42, "GBUYER", "GCREATOR"],
    "value": { "amount": "150000000", "asset": "CCONTRACT" }
  },
  "createdAt": "2026-08-29T07:00:00.000Z"
}
```

`amount` is a string in the asset's smallest unit (stroops for native XLM, indivisible units for a contract asset). `asset` is the contract address of the asset that was paid, or the native asset sentinel.

## Frontend integration

### Polling the REST API

Poll `GET /soroban/events` (or `GET /nfts/:tokenId/events` for a single token) with `type`, `tokenId`, `page`, and `limit`. Use the returned `meta.totalPages` to paginate, and keep the last seen `id` or `ledger` as a cursor for incremental refresh. Polling is the authoritative path: every event above is queryable through these routes.

### WebSocket progress events

Real-time clip-generation progress is pushed over the Socket.IO gateway on the `/clips` namespace. The connection must carry a valid JWT in the handshake; unauthorized sockets are disconnected before joining. On success the server replies with `connected`, and the client then receives events in its per-user room:

| Event            | Payload                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `connected`      | `{ room }` — the per-user room the socket joined                                                                                                                                |
| `clip.progress`  | `{ jobId, videoId, percent, progress, stage, step, currentClip? }` — `percent`/`progress` are 0–100; `stage`/`step` are one of `video_download`, `ai_analysis`, `ffmpeg_processing`, `upload`, `done` |
| `clip.completed` | `{ jobId, videoId, clipId?, clipUrl?, thumbnail?, status }`                                                                                                                     |
| `clip.failed`    | `{ jobId, videoId, reason, attemptsMade }`                                                                                                                                     |

`ffmpeg_cut` remains accepted as a backwards-compatible alias for `ffmpeg_processing` in older payloads. Soroban contract events are **not** pushed over this gateway — subscribe to `/clips` for generation progress only, and read contract events from the REST routes above.

Example `clip.progress` payload:

```json
{
  "jobId": "123",
  "videoId": "vid_abc",
  "percent": 60,
  "progress": 60,
  "stage": "ffmpeg_processing",
  "step": "ffmpeg_processing"
}
```

## Contract source boundary

This repository contains the Soroban RPC indexer and API, but no Soroban contract source or contract-level event tests. The list above defines the event names and topic/value convention consumed by this backend. The contract implementation must emit the events and have its own tests in the repository that owns the contract source.
