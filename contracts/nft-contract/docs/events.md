# ClipCash NFT — Contract Event Payloads

This document is the authoritative reference for all events emitted by the
`clips-nft-contract`. Frontend applications and indexers should use this
guide to subscribe to and decode the on-chain event stream.

---

## How Soroban Events Work

Every state-changing call to a Soroban contract can emit one or more
**contract events**. Each event has three parts:

| Part | Description |
|---|---|
| **contract\_id** | The bech32m address of the contract that emitted the event |
| **topics** | An ordered list of XDR values used for filtering (indexed fields) |
| **data** | An XDR value carrying the event payload |

Events are only included in a ledger if `in_successful_contract_call = true`.

### Consuming Events via Horizon

Horizon exposes events through the `/events` REST endpoint and a
Server-Sent Events (SSE) stream.

```
GET https://horizon-testnet.stellar.org/events
  ?type=contract
  &contract_id=<CONTRACT_ID>
  &cursor=now
```

WebSocket consumers can wrap the SSE stream with a standard `EventSource`:

```js
// JavaScript — subscribe to all ClipCash NFT events
const HORIZON = "https://horizon-testnet.stellar.org";
const CONTRACT = "C..."; // bech32m contract address

const es = new EventSource(
  `${HORIZON}/events?type=contract&contract_id=${CONTRACT}&cursor=now`
);

es.onmessage = (ev) => {
  const record = JSON.parse(ev.data);
  const topicName = xdrSymbolToString(record.topic[0]);

  switch (topicName) {
    case "mint":            handleMint(record);           break;
    case "transfer":        handleTransfer(record);       break;
    case "approve":         handleApprove(record);        break;
    case "royalty_updated": handleRoyaltyUpdated(record); break;
    case "royalty_paid":    handleRoyaltyPaid(record);    break;
    case "royalty_claimed": handleRoyaltyClaimed(record); break;
  }
};
```

---

## Event Reference

> **Note:** Topics are **indexed** — Horizon allows filtering on any topic
> position using the `topic[]` query parameter.
> Data is not indexed — data fields must be decoded client-side.

---

### `mint`

Emitted when a new NFT is minted by the contract admin.

#### Topics (indexed)

| Position | Type | Value |
|---|---|---|
| 0 | `Symbol` | `"mint"` |
| 1 | `Address` | `to` — the recipient / initial owner |

#### Data

| Type | Value |
|---|---|
| `(u64, bool)` | `(token_id, is_soulbound)` |

#### Example JSON Payload

```json
{
  "type": "contract",
  "contract_id": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "in_successful_contract_call": true,
  "topic": [
    { "type": "symbol",  "value": "mint" },
    { "type": "address", "value": "GABC...XYZ" }
  ],
  "value": {
    "type": "tuple",
    "values": [
      { "type": "u64",  "value": "42" },
      { "type": "bool", "value": false }
    ]
  }
}
```

#### Filter by recipient

```
GET /events?type=contract&contract_id=<C...>&topic[0]=<mint_xdr>&topic[1]=<ADDRESS_XDR>
```

---

### `transfer`

Emitted when token ownership changes via `transfer` or `transfer_from`.

#### Topics (indexed)

| Position | Type | Value |
|---|---|---|
| 0 | `Symbol` | `"transfer"` |
| 1 | `Address` | `from` — previous owner |
| 2 | `Address` | `to` — new owner |

#### Data

| Type | Value |
|---|---|
| `u64` | `token_id` |

#### Example JSON Payload

```json
{
  "type": "contract",
  "contract_id": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "in_successful_contract_call": true,
  "topic": [
    { "type": "symbol",  "value": "transfer" },
    { "type": "address", "value": "GSELL...ER" },
    { "type": "address", "value": "GBUY...ER" }
  ],
  "value": { "type": "u64", "value": "42" }
}
```

---

### `approve`

Emitted when the owner grants an operator the right to transfer a specific
token on their behalf (single-token allowance).

#### Topics (indexed)

| Position | Type | Value |
|---|---|---|
| 0 | `Symbol` | `"approve"` |
| 1 | `Address` | `owner` |
| 2 | `Address` | `spender` — approved operator |

#### Data

| Type | Value |
|---|---|
| `u64` | `token_id` |

#### Example JSON Payload

```json
{
  "type": "contract",
  "contract_id": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "in_successful_contract_call": true,
  "topic": [
    { "type": "symbol",  "value": "approve" },
    { "type": "address", "value": "GOWN...ER" },
    { "type": "address", "value": "GSPE...ND" }
  ],
  "value": { "type": "u64", "value": "42" }
}
```

> The approval is automatically cleared after a successful `transfer_from`.
> No separate "revoke" event is emitted.

---

### `royalty_updated`

Emitted whenever the contract admin updates the default royalty rate.

#### Topics (indexed)

| Position | Type | Value |
|---|---|---|
| 0 | `Symbol` | `"royalty_updated"` |

#### Data

| Type | Value |
|---|---|
| `(u32, u32)` | `(old_bps, new_bps)` — basis points (1 BPS = 0.01 %) |

`old_bps` is `0` when the royalty is being set for the first time.

#### Example JSON Payload

```json
{
  "type": "contract",
  "contract_id": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "in_successful_contract_call": true,
  "topic": [
    { "type": "symbol", "value": "royalty_updated" }
  ],
  "value": {
    "type": "tuple",
    "values": [
      { "type": "u32", "value": "250" },
      { "type": "u32", "value": "500" }
    ]
  }
}
```

---

### `royalty_paid`

Emitted by the marketplace (via `pay_royalty`) whenever a secondary-sale
royalty is recorded on-chain.

> **Important:** `pay_royalty` is a **notification-only** entry point. It does
> not move funds. Actual XLM or token transfers are the responsibility of the
> marketplace contract and should be verified separately.

#### Topics (indexed)

| Position | Type | Value |
|---|---|---|
| 0 | `Symbol` | `"royalty_paid"` |
| 1 | `u64` | `token_id` — the NFT for which royalty is being paid |
| 2 | `Address` | `payer` — account that authorised the royalty call |

#### Data

| Type | Value |
|---|---|
| `(Address, u64)` | `(creator, amount_stroops)` |

`amount_stroops` is denominated in **stroops** (1 XLM = 10 000 000 stroops).

#### Example JSON Payload

```json
{
  "type": "contract",
  "contract_id": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "in_successful_contract_call": true,
  "topic": [
    { "type": "symbol",  "value": "royalty_paid" },
    { "type": "u64",     "value": "42" },
    { "type": "address", "value": "GPAY...ER" }
  ],
  "value": {
    "type": "tuple",
    "values": [
      { "type": "address", "value": "GCRE...AT" },
      { "type": "u64",     "value": "5000000" }
    ]
  }
}
```

#### Filter by token

```
GET /events?type=contract&contract_id=<C...>&topic[0]=<royalty_paid_xdr>&topic[1]=<token_id_xdr>
```

---

### `royalty_claimed`

Emitted when a creator successfully calls `claim_royalties` and transfers their
accrued royalty balance.

#### Topics (indexed)

| Position | Type | Value |
|---|---|---|
| 0 | `Symbol` | `"royalty_claimed"` |
| 1 | `Address` | `recipient` — the royalty recipient who claimed |

#### Data

| Type | Value |
|---|---|
| `(u64, i128, Address)` | `(token_id, amount, asset)` |

`amount` is in the smallest unit of `asset` (stroops for XLM).

#### Example JSON Payload

```json
{
  "type": "contract",
  "contract_id": "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
  "in_successful_contract_call": true,
  "topic": [
    { "type": "symbol",  "value": "royalty_claimed" },
    { "type": "address", "value": "GCRE...AT" }
  ],
  "value": {
    "type": "tuple",
    "values": [
      { "type": "u64",    "value": "42" },
      { "type": "i128",   "value": "5000000" },
      { "type": "address","value": "CAAA...SAC" }
    ]
  }
}
```

---

## Indexer Reference (Rust)

The snippet below shows how a Rust indexer can decode the `royalty_paid`
event using `soroban-sdk` types.

```rust
use soroban_sdk::{Address, Env, Symbol, Val};

struct SorobanEvent {
    topics: Vec<Val>,
    data: Val,
}

fn handle_event(env: &Env, ev: &SorobanEvent) {
    let name: Symbol = ev.topics[0].clone().try_into_val(env).unwrap();

    if name == Symbol::new(env, "royalty_paid") {
        let token_id: u64  = ev.topics[1].clone().try_into_val(env).unwrap();
        let payer: Address = ev.topics[2].clone().try_into_val(env).unwrap();
        let (creator, amount_stroops): (Address, u64) =
            ev.data.clone().try_into_val(env).unwrap();

        // Persist to your database...
        println!(
            "Royalty of {} stroops on token {} paid by {} to {}",
            amount_stroops, token_id, payer, creator
        );
    }
}
```

---

## Event Summary Table

| Event | Entrypoint | Topics (indexed) | Data |
|---|---|---|---|
| `mint` | `mint(to, token_id, …)` | `("mint", to)` | `(token_id, is_soulbound)` |
| `transfer` | `transfer` / `transfer_from` | `("transfer", from, to)` | `token_id` |
| `approve` | `approve` | `("approve", owner, spender)` | `token_id` |
| `royalty_updated` | `set_default_royalty_bps` | `("royalty_updated",)` | `(old_bps, new_bps)` |
| `royalty_paid` | `pay_royalty` | `("royalty_paid", token_id, payer)` | `(creator, amount_stroops)` |
| `royalty_claimed` | `claim_royalties` | `("royalty_claimed", recipient)` | `(token_id, amount, asset)` |
