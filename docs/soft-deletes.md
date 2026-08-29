# Soft Delete Implementation

This guide explains how soft deletion works across ClipCash backend models, queries, APIs, and recovery flows.

## Overview

Soft delete marks a row as deleted by setting a `deletedAt` timestamp instead of removing it with SQL `DELETE`. Historical and financial data remain available for audit and restore.

Models that use soft delete today:

| Model | Field | Typical delete path |
|-------|-------|---------------------|
| `Payout` | `deletedAt DateTime?` | `SoftDeleteService`, financial cleanup |
| `PayoutMethod` | `deletedAt DateTime?` | `PayoutMethodService.remove` / `SoftDeleteService` |
| `Wallet` | `deletedAt DateTime?` | `WalletManagementService.disconnect` |
| `Earning` | `deletedAt DateTime?` | Earnings adjustment / aggregation filters |

Indexed examples (Prisma):

```prisma
model Payout {
  // ...
  deletedAt DateTime?

  @@index([deletedAt])
  @@index([userId, deletedAt])
}
```

## Meaning of `deletedAt`

| Value | Meaning |
|-------|---------|
| `null` | Active / visible to normal user queries |
| `DateTime` | Soft-deleted at that instant; excluded from default lists and lookups |

Setting `deletedAt` is the soft-delete operation. Clearing it (`null`) restores the record when restoration is supported.

## Default query behavior

**Normal application queries must exclude soft-deleted rows:**

```typescript
// Active payouts for a user
await prisma.payout.findMany({
  where: {
    userId,
    deletedAt: null,
  },
  orderBy: { createdAt: 'desc' },
});
```

```typescript
// Payout method lookup (user-facing)
await prisma.payoutMethod.findFirst({
  where: { id, userId, deletedAt: null },
});
```

```typescript
// Earnings / balances — always filter deleted earnings
await prisma.earning.findMany({
  where: {
    clip: { video: { userId } },
    deletedAt: null,
  },
});
```

```sql
-- Raw SQL joins used by leaderboard services
LEFT JOIN "Earning" e
  ON c.id = e."clipId"
 AND e."deletedAt" IS NULL
```

If you omit `deletedAt: null`, soft-deleted financial rows can leak into balances, leaderboards, and payout eligibility checks.

## Soft-delete helpers

Central utilities live in `src/payouts/soft-delete.service.ts`:

| Method | Purpose |
|--------|---------|
| `softDeletePayout` / `softDeletePayouts` | Set `deletedAt` on payout(s) |
| `restorePayout` | Clear `deletedAt` |
| `getActivePayoutsForUser` | `deletedAt: null` |
| `getDeletedPayoutsForUser` | `deletedAt: { not: null }` (audit) |
| `getPayoutIncludingDeleted` | `findUnique` without active filter |
| `softDeletePayoutMethod` / `restorePayoutMethod` | Same pattern for methods |
| `permanentlyDeletePayout(s)` | Hard delete — irreversible; use only with retention policy |

### Prisma examples

**Soft delete**

```typescript
await prisma.payout.update({
  where: { id: payoutId },
  data: { deletedAt: new Date() },
});
```

**List deleted (admin / audit)**

```typescript
await prisma.payout.findMany({
  where: {
    userId,
    deletedAt: { not: null },
  },
  orderBy: { deletedAt: 'desc' },
});
```

**Restore**

```typescript
await prisma.payout.update({
  where: { id: payoutId },
  data: { deletedAt: null },
});
```

**Wallet reconnect clears soft delete**

```typescript
await prisma.wallet.upsert({
  where: { address_chain: { address, chain } },
  create: { /* ... */ },
  update: { deletedAt: null, /* ... */ },
});
```

## Administrator access to deleted records

- **User-facing APIs** filter `deletedAt: null`. Soft-deleted resources are treated as missing.
- **Audit / admin tooling** should use `SoftDeleteService` methods such as `getDeletedPayoutsForUser` or `getPayoutIncludingDeleted`, or explicit Prisma queries with `deletedAt: { not: null }`.
- There is **no** public REST “list trash” endpoint for payouts by default; recovery is performed through service-layer helpers or future admin-only routes. Prefer keeping restore behind admin auth when exposing HTTP.

## Restoration support

| Resource | Restorable? | How |
|----------|-------------|-----|
| Payout | Yes | `SoftDeleteService.restorePayout` |
| Payout method | Yes | `SoftDeleteService.restorePayoutMethod` |
| Wallet | Yes (reconnect) | Connecting the same address/chain upserts and sets `deletedAt: null` |
| Earning | Case-by-case | Clear `deletedAt` only via controlled admin/adjustment flows |

Permanent delete methods on `SoftDeleteService` bypass restore permanently — use only under retention policy.

## API / Swagger behavior

### How deleted resources appear

- Soft-deleted rows are **omitted** from list endpoints (wallets, payout methods, earnings aggregates, balances).
- Successful delete/disconnect responses confirm the soft delete without returning the deleted entity payload in full (e.g. payout method delete returns a message; wallet disconnect returns `{ message, walletId }`).

### 404 behavior

For user-scoped GET/UPDATE/DELETE on a soft-deleted resource, services that filter `deletedAt: null` respond as if the row does not exist:

- **HTTP `404 Not Found`** — e.g. payout method get/update/delete after soft delete (`Payout method not found`).
- Soft-deleted wallets are excluded from “active wallet” lookups; balance endpoints treat missing/deleted wallets as not found / inaccessible for that user.
- Already-disconnected wallets may return **`409 Conflict`** (`Wallet is already disconnected`) on a second disconnect attempt (the row still exists but is not active).

Swagger annotations for these routes document `404` (and `409` where applicable). Do not document soft-deleted entities as normal `200` payloads on user APIs.

### Admin recovery endpoints

- Payout approve/reject admin controllers operate on payout workflow state; they are not a general trash UI.
- Restoration today is primarily via `SoftDeleteService` (and wallet reconnect). If HTTP admin recovery endpoints are added later:
  - Guard with admin auth.
  - Document under an `admin` Swagger tag.
  - Return the restored resource with `deletedAt: null`.
  - Keep user-facing 404 behavior unchanged for still-deleted IDs.

### Error response note

API errors may include `requestId` for tracing (see [logging.md](./logging.md)). Soft-delete 404s follow the same envelope; they do not expose whether a row is hard-missing vs soft-deleted to end users.

## Developer checklist

- [ ] Every new query on soft-deletable models includes `deletedAt: null` unless intentionally auditing.
- [ ] Deletes set `deletedAt`, they do not call Prisma `delete` for financial records.
- [ ] Tests cover soft-deleted → `404` and restore → visible again.
- [ ] Swagger descriptions mention soft-delete semantics on delete/disconnect operations.
- [ ] Never log encrypted payout-method fields when auditing deletes.

## Related

- `src/payouts/soft-delete.service.ts`
- `FINANCIAL_FEATURES.md` (historical implementation notes)
- [Versioning](./versioning.md) — breaking soft-delete visibility changes require a MAJOR bump
