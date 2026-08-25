# Financial Features Implementation Guide

This document describes the three major financial features implemented: soft delete for financial records, fee calculation for payouts, and configurable royalty support.

## Features Overview

### 1. Soft Delete for Financial Records

**Purpose:** Prevent accidental permanent deletion of financial records while allowing data recovery.

**Implementation:**
- Added `deletedAt` DateTime field to `Payout` and `PayoutMethod` models
- All financial records are now soft-deleted by setting `deletedAt` timestamp
- Soft-deleted records remain in the database and can be audited or restored

**Database Schema:**
```sql
ALTER TABLE "Payout" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "PayoutMethod" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "Payout_deletedAt_idx" ON "Payout"("deletedAt");
CREATE INDEX "Payout_userId_deletedAt_idx" ON "Payout"("userId", "deletedAt");
```

**Service: SoftDeleteService**

Location: `src/payouts/soft-delete.service.ts`

Key methods:
- `softDeletePayout(payoutId)` - Soft delete a single payout
- `softDeletePayouts(payoutIds)` - Soft delete multiple payouts
- `restorePayout(payoutId)` - Restore a soft-deleted payout
- `getDeletedPayoutsForUser(userId)` - Retrieve deleted payouts for audit
- `getActivePayoutsForUser(userId)` - Get only active (non-deleted) payouts
- `permanentlyDeletePayout(payoutId)` - Permanently delete (irreversible)

**Usage:**
```typescript
// Soft delete a payout
await softDeleteService.softDeletePayout(payoutId);

// Query active payouts (excludes deleted)
const activePayouts = await softDeleteService.getActivePayoutsForUser(userId);

// Admin audit query (includes deleted)
const deletedPayouts = await softDeleteService.getDeletedPayoutsForUser(userId);

// Restore a deleted payout
await softDeleteService.restorePayout(payoutId);
```

**Best Practices:**
- Always use soft delete for financial records instead of hard delete
- Use `deletedAt: null` filter in queries to exclude deleted records in normal operations
- Admin and audit endpoints can retrieve deleted records for compliance
- Implement retention policies to permanently delete old soft-deleted records if needed

---

### 2. Fee Calculation Before Payout Processing

**Purpose:** Calculate and display withdrawal/platform fees to users before confirming payout.

**Example:**
```
Requested payout: $100
Platform fee (2%): $2
Network fee (fixed): $1
User receives: $97
```

**Database Schema:**
```sql
ALTER TABLE "PayoutFeeConfig" ADD COLUMN "feeType" VARCHAR(50) DEFAULT 'fixed';
```

**PayoutFeeConfig Model:**
```prisma
model PayoutFeeConfig {
  id              Int
  method          String   @unique  // "stellar", "ach", "stripe", etc.
  feeType         String             // "fixed" or "percentage"
  feePercentage   Float              // Percentage fee (e.g., 2 for 2%)
  fixedFee        Float              // Fixed fee amount
  minFee          Float              // Minimum fee (floor)
  maxFee          Float?             // Maximum fee (cap)
  isActive        Boolean            // Enable/disable this config
  createdAt       DateTime
  updatedAt       DateTime
}
```

**Service: FeeService**

Location: `src/payouts/fee.service.ts`

Key methods:
- `calculateFee(amount, method)` - Calculate fees before payout
- `createFeeConfig(data)` - Create a new fee configuration
- `updateFeeConfig(method, data)` - Update fee configuration
- `getFeeConfig(method)` - Retrieve fee config for a method
- `getAllFeeConfigs()` - List all fee configurations

**Fee Types:**

1. **Fixed Fee:** Flat amount deducted regardless of payout size
   ```typescript
   feeType: 'fixed',
   fixedFee: 1.0,  // $1 flat fee
   minFee: 0,
   maxFee: null
   ```

2. **Percentage Fee:** Calculated as percentage of payout
   ```typescript
   feeType: 'percentage',
   feePercentage: 2,    // 2% of payout
   fixedFee: 0,
   minFee: 1,           // Minimum $1
   maxFee: 50           // Maximum $50
   ```

3. **Combined (Legacy):** Both fixed and percentage applied
   ```typescript
   feeType: 'combined',
   feePercentage: 1.5,  // 1.5% of payout
   fixedFee: 0.5,       // Plus $0.50 fixed
   minFee: 1,
   maxFee: 50
   ```

**FeeCalculation Response:**
```typescript
{
  feeAmount: number,       // Calculated fee (respects min/max)
  feePercentage: number,   // Fee percentage (for display)
  finalAmount: number      // Amount user receives after fees
}
```

**Usage Examples:**

1. Create a fee config:
```typescript
await feeService.createFeeConfig({
  method: 'stellar',
  feeType: 'percentage',
  feePercentage: 2,
  minFee: 1,
  maxFee: 100
});
```

2. Calculate fee before payout:
```typescript
const calculation = await feeService.calculateFee(100, 'stellar');
console.log(`Fee: $${calculation.feeAmount}, You receive: $${calculation.finalAmount}`);
```

3. Store fee calculation with payout:
```typescript
const payout = await prisma.payout.create({
  data: {
    userId: 123,
    amount: 100,
    feeAmount: calculation.feeAmount,
    feePercentage: calculation.feePercentage,
    finalAmount: calculation.finalAmount,
    // ... other fields
  }
});
```

**Integration with Payouts:**
The `payoutsService.requestPayout()` method now calculates fees before creating payouts:
- Fee is calculated based on method (stellar, ach, etc.)
- Fee, fee percentage, and final amount are stored with payout
- Users see final amount before confirming payout

---

### 3. Configurable Royalty Support (Basis Points)

**Purpose:** Support creator royalties on secondary NFT sales with configurable basis points (BPS).

**Background:**
- Creators should receive royalties on secondary sales
- Platform may receive a configurable fee
- 1 BPS = 0.01%, so 1000 BPS = 10%
- Maximum supported: 1500 BPS (15%)

**Database Schema:**
```sql
CREATE TABLE "ClipRoyalty" (
  "id" SERIAL PRIMARY KEY,
  "clipId" INTEGER UNIQUE NOT NULL,
  "recipientAddress" VARCHAR(255) NOT NULL,
  "basisPoints" INTEGER NOT NULL,
  "platformFeeBps" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("clipId") REFERENCES "Clip"("id") ON DELETE CASCADE
);
```

**ClipRoyalty Model:**
```prisma
model ClipRoyalty {
  id               Int
  clipId           Int       @unique
  recipientAddress String      // Stellar wallet address
  basisPoints      Int         // Royalty rate (0-1500)
  platformFeeBps   Int         // Platform fee (0+)
  createdAt        DateTime
  updatedAt        DateTime
  clip             Clip      @relation(fields: [clipId], references: [id])
}
```

**Service: ClipRoyaltyService**

Location: `src/nft/clip-royalty.service.ts`

Key methods:
- `setRoyalty(clipId, address, bps, platformFeeBps)` - Set/update royalty
- `getRoyalty(clipId)` - Get royalty configuration
- `calculateRoyaltyAmount(salePrice, bps)` - Calculate royalty payout
- `validateRoyaltyConfiguration(bps, platformFeeBps)` - Validate BPS values
- `getRoyaltiesForRecipient(address)` - Audit query for recipient

**Validation Rules:**
- Royalty BPS must be 0-1500 (max 15%)
- Recipient must be valid Stellar address (G + 55 alphanumerics)
- Platform fee BPS must be non-negative integer
- Clip must exist in database

**API Endpoints:**

1. **GET /nfts/royalties/:clipId**
   - Retrieve royalty configuration for a clip
   - Response: ClipRoyaltyResponseDto

2. **PATCH /nfts/royalties/:clipId**
   - Update royalty configuration
   - Body: UpdateClipRoyaltyDto
   - Response: ClipRoyaltyResponseDto

3. **POST /nfts/royalties/:clipId**
   - Create new royalty configuration
   - Body: SetClipRoyaltyDto
   - Response: ClipRoyaltyResponseDto

4. **POST /nfts/royalties/calculate**
   - Calculate royalty amount for a sale
   - Body: RoyaltyCalculationDto
   - Response: RoyaltyCalculationResponseDto

5. **GET /nfts/royalties/recipient/:address** (Admin only)
   - Get all clips with royalties for recipient
   - Response: ClipRoyaltyResponseDto[]

**Usage Examples:**

1. Set royalty for a clip:
```typescript
const royalty = await clipRoyaltyService.setRoyalty(
  clipId,
  'GBVP7D2V6DWXYZ...', // Recipient wallet
  1000,                 // 10% royalty
  500                   // 5% platform fee
);
```

2. Get royalty configuration:
```typescript
const royalty = await clipRoyaltyService.getRoyalty(clipId);
console.log(`Royalty: ${royalty.basisPoints} BPS = ${(royalty.basisPoints / 100).toFixed(1)}%`);
```

3. Calculate royalty payout:
```typescript
const salePrice = 1000000000; // 10 XLM in stroops
const royaltyAmount = clipRoyaltyService.calculateRoyaltyAmount(salePrice, 1000);
console.log(`Sale: ${salePrice} stroops, Royalty: ${royaltyAmount} stroops`);
```

4. Validate configuration before update:
```typescript
try {
  clipRoyaltyService.validateRoyaltyConfiguration(2000); // Fails: > 1500 BPS
} catch (error) {
  console.error('Invalid royalty BPS');
}
```

**DTO Schemas:**

**SetClipRoyaltyDto:**
```typescript
{
  recipientAddress: string;      // Valid Stellar public key
  basisPoints: number;           // 0-1500
  platformFeeBps?: number;       // Optional platform fee
}
```

**ClipRoyaltyResponseDto:**
```typescript
{
  clipId: number;
  recipientAddress: string;
  basisPoints: number;
  platformFeeBps: number;
  createdAt: Date;
  updatedAt: Date;
}
```

**RoyaltyCalculationDto:**
```typescript
{
  salePrice: number;             // Sale price in stroops
  basisPoints: number;           // Royalty BPS (0-1500)
}
```

**RoyaltyCalculationResponseDto:**
```typescript
{
  salePrice: number;
  basisPoints: number;
  royaltyAmount: number;         // Calculated royalty in stroops
  percentage: string;            // Human-readable percentage
}
```

**Best Practices:**
- Always validate BPS before storing (max 1500)
- Use BigInt for royalty calculations to prevent precision loss
- Store royalty recipient address in Stellar format (G + 55 chars)
- Include platform fee in royalty calculations
- Display percentage to users (e.g., "10% creator royalty + 5% platform fee")
- Allow admins to query all royalties for audit purposes

---

## Integration Testing

Location: `src/wallets/wallet-integration.spec.ts`

Test coverage:
- Wallet creation and connection tracking
- Transaction proxy error handling
- Fee calculation (fixed, percentage, combined)
- Soft delete and restore operations
- Excluded deleted records from normal queries
- Admin audit queries for deleted records

Run tests:
```bash
npm test -- wallet-integration.spec.ts
npm test -- clip-royalty.service.spec.ts
```

---

## Database Migrations

All migrations are located in `prisma/migrations/`:

1. **20260824_soft_delete_and_financial_features**
   - Adds `deletedAt` to Payout and PayoutMethod
   - Creates indices for soft delete queries
   - Adds `feeType` to PayoutFeeConfig
   - Creates ClipRoyalty table

Apply migrations:
```bash
npx prisma migrate deploy
```

---

## Acceptance Criteria Checklist

### Soft Delete
- [x] `deletedAt` added to Payout and PayoutMethod
- [x] Delete operation converted to soft delete
- [x] Normal queries exclude deleted records
- [x] Admin audit queries can access deleted records
- [x] Restore functionality implemented
- [x] Financial records not physically deleted

### Fee Calculation
- [x] Fee configuration created
- [x] Fixed fee supported
- [x] Percentage fee supported
- [x] Fee calculated before payout
- [x] Final payout amount returned
- [x] Fees stored with payout
- [x] User can see fee before confirming

### Royalty Support
- [x] `setRoyalty()` method implemented
- [x] Royalty recipient stored
- [x] Max 1500 BPS validated
- [x] Royalty getter returns recipient and BPS
- [x] Platform fee supported
- [x] Swagger/API integration documented
- [x] GET /nfts/:id/royalty endpoint
- [x] PATCH /nfts/:id/royalty endpoint
- [x] Response schema documented
- [x] Royalties stored correctly
- [x] Values above 15% rejected
- [x] Getter returns recipient and BPS
- [x] Integration tests covering scenarios

---

## Next Steps

1. Run database migrations: `npx prisma migrate deploy`
2. Build project: `npm run build`
3. Run tests: `npm test`
4. Deploy to staging environment for integration testing
5. Configure fee structures for each payout method in PayoutFeeConfig
6. Train support team on soft delete recovery procedures
7. Set up monitoring for failed fee calculations
8. Document user-facing API changes

---

## Troubleshooting

**Issue:** Soft delete queries not working
- Solution: Ensure migrations were applied with `npx prisma migrate deploy`
- Verify indices exist: `SELECT * FROM pg_indexes WHERE tablename='Payout'`

**Issue:** Fee calculations showing zero
- Solution: Check PayoutFeeConfig for method - may not be configured
- Verify `isActive` is true for the payout method

**Issue:** Royalty validation failing with valid BPS
- Solution: Ensure recipient address is valid Stellar key (G + 55 chars)
- Check that BPS is integer: `Number.isInteger(bps)`

**Issue:** Royalty calculations overflow
- Solution: Service uses BigInt internally - verify sale price is within range
- Max safe value: 9007199254740991 (Number.MAX_SAFE_INTEGER)
