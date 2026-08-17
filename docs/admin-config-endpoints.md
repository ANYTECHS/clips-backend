# Admin Configuration Endpoints

## Overview

This document describes the Soroban NFT contract's admin configuration endpoints that allow platform administrators to update global contract settings without requiring a contract redeployment.

## Authorization

All admin configuration endpoints require the caller to:
1. Be the contract administrator (set during contract initialization)
2. Authorize the transaction with their signing key

## Endpoints

### 1. Set Default Platform Fee

**Function:** `set_default_platform_fee`

**Description:** Updates the global platform fee that is deducted from royalties as a fallback for tokens without per-token royalty overrides.

**Parameters:**
- `recipient` (Address): The wallet address that receives platform fees
- `bps` (u32): Platform fee in basis points (1 BPS = 0.01%, max 10,000 = 100%)

**Returns:** 
- `Ok(())` on success
- `Error::NotInitialized` if contract hasn't been initialized
- `Error::Unauthorized` if caller is not the admin
- `Error::InvalidRoyaltyBps` if bps exceeds 10,000

**Events Emitted:**
- `config_updated` with topics: `["config_updated", admin_address]`
  - Data: `("platform_fee", old_bps, new_bps)`
- (Legacy) `royalty_updated` with topics: `["royalty_updated"]`
  - Data: `(old_bps, new_bps)`

**Constraints:**
- Only the contract owner/admin can call this function
- BPS value must be ≤ 10,000 (representing 100%)
- Changes take effect immediately on subsequent token transfers

### Example Request (via Soroban CLI)

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_ACCOUNT> \
  --network testnet \
  -- \
  set_default_platform_fee \
  --recipient <PLATFORM_RECIPIENT_ADDRESS> \
  --bps 500
```

### Example Response

On success, emits events:
```json
{
  "event_type": "config_updated",
  "topics": ["config_updated", "G...ADMIN_ADDRESS"],
  "data": {
    "config_type": "platform_fee",
    "old_bps": 0,
    "new_bps": 500
  }
}
```

### Example Use Cases

**Set 5% platform fee:**
- BPS = 500
- When a token has 10% default royalty, 5% goes to creator, 5% to platform

**Update platform recipient address:**
- Call with new recipient address and same BPS to just change the wallet

---

### 2. Set Default Royalty BPS

**Function:** `set_default_royalty_bps`

**Description:** Updates the global default royalty rate applied to all NFT transfers, unless overridden per token.

**Parameters:**
- `bps` (u32): Default royalty in basis points (1 BPS = 0.01%, max 10,000 = 100%)

**Returns:**
- `Ok(())` on success
- `Error::NotInitialized` if contract hasn't been initialized
- `Error::Unauthorized` if caller is not the admin
- `Error::InvalidRoyaltyBps` if bps exceeds 10,000

**Events Emitted:**
- `config_updated` with topics: `["config_updated", admin_address]`
  - Data: `("default_royalty", old_bps, new_bps)`
- (Legacy) `royalty_updated` with topics: `["royalty_updated"]`
  - Data: `(old_bps, new_bps)`

**Constraints:**
- Only the contract owner/admin can call this function
- BPS value must be ≤ 10,000 (representing 100%)
- This is the fallback royalty; per-token overrides take precedence
- Changes take effect immediately on subsequent token transfers

### Example Request (via Soroban CLI)

```bash
soroban contract invoke \
  --id <CONTRACT_ID> \
  --source <ADMIN_ACCOUNT> \
  --network testnet \
  -- \
  set_default_royalty_bps \
  --bps 1000
```

### Example Response

On success, emits events:
```json
{
  "event_type": "config_updated",
  "topics": ["config_updated", "G...ADMIN_ADDRESS"],
  "data": {
    "config_type": "default_royalty",
    "old_bps": 500,
    "new_bps": 1000
  }
}
```

### Example Use Cases

**Set 10% default royalty:**
- BPS = 1000
- All NFT transfers use 10% royalty unless token has override

**Set 5% default royalty:**
- BPS = 500
- Split with platform: if platform fee is 200 BPS, creator gets 300 BPS

---

## Getter Methods

### Get Default Platform Fee

**Function:** `get_default_platform_fee`

**Description:** Returns the currently configured platform fee.

**Parameters:** None

**Returns:** `Option<(Address, u32)>`
- `Some((recipient, bps))` if configured
- `None` if not yet set

### Get Default Royalty BPS

**Function:** `get_default_royalty_bps`

**Description:** Returns the currently configured default royalty rate.

**Parameters:** None

**Returns:** `Option<u32>`
- `Some(bps)` if configured
- `None` if not yet set

---

## Event Schema

### ConfigUpdated Event

Emitted whenever global configuration is updated (platform fee or default royalty).

**Event Name:** `config_updated`

**Topics:**
1. `"config_updated"` (Symbol)
2. `admin` (Address) - The admin who made the change

**Data:**
- `config_type` (String) - Either "platform_fee" or "default_royalty"
- `old_bps` (u32) - Previous BPS value
- `new_bps` (u32) - New BPS value

**Example Event in XDR:**
```
{
  "type": "contract",
  "contract_id": "C...CONTRACT_ADDRESS",
  "topics": [
    "AAAADwAAAA5jb25maWdfdXBkYXRlZA==",  // "config_updated"
    "AAAAEgAAAAGJUBkzQKVJo..."          // admin Address
  ],
  "data": {
    "type": "record",
    "fields": [
      {"name": "config_type", "value": "cGxhdGZvcm1fZmVl"},  // "platform_fee"
      {"name": "old_bps", "value": 0},
      {"name": "new_bps", "value": 500}
    ]
  }
}
```

---

## Access Control Summary

| Function | Required Role | Auth Check |
|----------|---------------|-----------|
| `set_default_platform_fee` | Admin | ✅ Required |
| `set_default_royalty_bps` | Admin | ✅ Required |
| `get_default_platform_fee` | Public | ❌ None |
| `get_default_royalty_bps` | Public | ❌ None |

---

## Configuration Flow Diagram

```
Admin Request
    ↓
authenticate()
    ↓
validate_bps() [0 ≤ BPS ≤ 10,000]
    ↓
get_old_value()
    ↓
set_new_value()
    ↓
emit_config_updated_event()
    ↓
emit_legacy_royalty_updated_event()
    ↓
Return Ok(())
```

---

## Best Practices

### Setting Platform Fee

1. **Determine total royalty budget:** E.g., 15% total
2. **Allocate platform portion:** E.g., 5% platform, 10% creator
3. **Call set_default_platform_fee** with 500 BPS
4. **Call set_default_royalty_bps** with 1500 BPS total
   - Platform gets 500 BPS from this
   - Creator gets 1000 BPS from this

### Monitoring Configuration Changes

Listen for `config_updated` events to track when admins modify settings:

```bash
soroban events watch \
  --id <CONTRACT_ID> \
  --topic config_updated \
  --network testnet
```

### Validation Checks

Before calling configuration endpoints:

```javascript
// Example validation (pseudo-code)
if (newBps > 10000) {
  throw new Error("BPS cannot exceed 10,000 (100%)");
}

if (typeof recipient !== "string" || !recipient.startsWith("G")) {
  throw new Error("Invalid Stellar address");
}

if (!adminAccount.canSign()) {
  throw new Error("Admin account must be able to sign transactions");
}
```

---

## Error Handling

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `NotInitialized` | Contract not yet initialized | Call `initialize(admin)` first |
| `Unauthorized` | Caller is not admin | Use admin account for transaction |
| `InvalidRoyaltyBps` | BPS > 10,000 | Use value ≤ 10,000 |

### Rate Limiting

Currently, there are no rate limits on configuration updates. However, consider:
- Setting configuration only during planned maintenance windows
- Notifying users before major changes
- Implementing governance if needed in future

---

## Related Functions

- `transfer_with_royalty` - Uses default royalty if token has no override
- `get_royalties` - Returns full royalty split including platform fee
- `set_royalties` - Set per-token royalty overrides
- `claim_royalties` - Creator claims accrued royalties

---

## Historical Context

- **Issue #679:** Admin-configurable collection name/symbol
- **Issue #680:** Royalty calculation helpers
- **Issue #685:** Fractional royalty for custom decimals
- **Current:** Admin-configurable platform fee and default royalty with unified `ConfigUpdated` event emission
