# Earnings Management Features

This document describes the four key earnings management features implemented in the clips backend:

1. **Partial Payout Withdrawals** - Allow users to withdraw only part of available earnings
2. **PDF Receipt Generation** - Generate and email receipts after successful payouts
3. **Soft-Delete Earnings** - Prevent accidental permanent deletion of earnings records
4. **Leaderboard** - Show top-earning creators with privacy controls

## Feature 1: Partial Payout Withdrawals

### Overview

Users can now request payouts for any amount up to their available balance, instead of being required to withdraw their entire balance.

### API Endpoint

```
POST /payouts/request-partial
Authorization: Bearer {token}
Content-Type: application/json

{
  "amount": 200,
  "walletId": 1,
  "reason": "Monthly withdrawal"
}
```

### Request Validation

- **Amount must be positive**: Rejects zero or negative amounts
- **Must be within available balance**: Checks `totalEarnings - totalPaidOut - totalPending`
- **Respects minimum/maximum limits**: Configured per currency (default: $5 minimum)
- **Concurrent request prevention**: Uses database transactions to prevent double-spending

### Response

```json
{
  "id": 123,
  "userId": 42,
  "amount": 200,
  "currency": "USD",
  "method": "stellar",
  "status": "pending",
  "createdAt": "2026-09-27T21:00:00Z",
  "walletId": 1
}
```

### Error Codes

| Code | Message | Reason |
|------|---------|--------|
| 400 | Requested amount exceeds available balance | Balance insufficient |
| 400 | Payout amount must be greater than 0 | Zero/negative amount |
| 400 | Minimum payout amount is $5 | Below minimum threshold |
| 409 | Previous request pending | Concurrent request conflict |

### Balance Calculation

```
availableBalance = totalEarnings - totalPaidOut - totalPending

Where:
- totalEarnings = Sum of all earnings (excluding soft-deleted)
- totalPaidOut = Sum of completed payouts
- totalPending = Sum of payouts in states: pending, under_review, approved, processing
```

### Example Scenarios

**Scenario 1: Partial Withdrawal**
```
Available balance: $500
User requests: $200
Remaining available: $300
```

**Scenario 2: Insufficient Balance**
```
Available balance: $350
User requests: $400
Result: 400 Bad Request - insufficient balance
```

**Scenario 3: Multiple Concurrent Requests**
```
Available balance: $500
Request 1: $100 (pending)
Request 2: $150 (pending)
Request 3: $150 (pending)
Total: $400
Result: All succeed, $100 remains available
```

### Implementation Details

**Service**: `BalanceService`
- `getAvailableBalance(userId)` - Calculate current available balance
- `validatePayoutAmount(userId, amount)` - Validate requested amount
- `reserveBalance(userId, amount)` - Atomically reserve balance in transaction

**Database Transactions**
- Uses Prisma `$transaction()` for atomic reservation
- Prevents race conditions from concurrent requests
- Rolls back on validation failure

## Feature 2: PDF Receipt Generation

### Overview

After a payout is successfully completed, the system automatically generates a PDF receipt and emails it to the user.

### Receipt Contents

- **Payout ID**: Unique identifier for the transaction
- **Amount**: Gross payout amount
- **Fee**: Platform withdrawal fee (amount and percentage)
- **Net Amount**: Amount after fees
- **Method**: Payout method (Stellar, Bank Transfer)
- **Status**: Transaction status (Completed)
- **Date**: When payout was completed
- **Wallet**: Masked wallet address (first 4 + last 6 chars)
- **Transaction IDs**: For verification
- **On-Chain Hash**: Stellar transaction hash if applicable

### API Endpoints

**Download Receipt PDF**
```
GET /payouts/:id/receipt
Authorization: Bearer {token}
Content-Type: application/pdf

Response: PDF binary file
Headers: Content-Disposition: attachment; filename="payout-receipt-123.pdf"
```

**Get Receipt Metadata**
```
GET /payouts/:id/receipt/metadata
Authorization: Bearer {token}

Response:
{
  "id": 1,
  "receiptId": "RCP-1694812000000-ABC123XYZ",
  "payoutId": 123,
  "emailSent": true,
  "emailSentAt": "2026-08-24T12:00:00Z",
  "createdAt": "2026-08-24T12:00:00Z",
  "updatedAt": "2026-08-24T12:00:00Z"
}
```

### Email Delivery

**Subject**: `Payout Receipt — #123`

**Content**:
- HTML formatted receipt with transaction details
- Plain text fallback
- PDF attachment: `payout-receipt-123.pdf`

### Error Codes

| Code | Message | Reason |
|------|---------|--------|
| 400 | Payout not completed | Status is not 'completed' |
| 404 | Payout not found | Invalid payout ID or not owned by user |
| 404 | Receipt not found | No receipt generated for payout |
| 401 | Unauthorized | User not authenticated |

### Implementation Details

**Service**: `PayoutReceiptService`
- `generateAndSendReceipt(data)` - Create receipt, generate PDF, send email
- `getReceiptPdf(payoutId)` - Generate PDF on-demand
- `getReceiptByPayoutId(payoutId)` - Retrieve receipt metadata

**Fire-and-Forget Pattern**
- Receipt generation is non-blocking
- Payout completion is NOT dependent on receipt success
- If email fails, receipt still created and visible to user

## Feature 3: Soft-Delete Earnings

### Overview

Earnings records are soft-deleted (marked with `deletedAt` timestamp) instead of permanently removed. This prevents accidental data loss and allows admin recovery if needed.

### Soft-Delete Behavior

**When an earning is deleted**:
1. Record is marked with `deletedAt` timestamp
2. Record is excluded from all balance calculations
3. Record is excluded from leaderboard aggregations
4. Record is excluded from earnings reports

**Data Integrity**:
- Original data is preserved for audit trail
- Hard delete never occurs in normal workflows
- Admin can restore if needed

### Database Query Pattern

All earnings queries include soft-delete filter:

```typescript
where: {
  deletedAt: null  // Only include non-deleted records
}
```

### Affected Aggregations

- **Balance Calculation**: `BalanceService.getAvailableBalance()`
- **Leaderboard Rankings**: `LeaderboardService.getLeaderboard()`
- **Earnings Summary**: `UserEarningsSummary` calculations
- **Daily Earnings**: `DailyEarning` aggregation

### API Endpoints

**Soft Delete Earning**
```
DELETE /earnings/:id
Authorization: Bearer {token}

Response:
{
  "message": "Earning deleted successfully",
  "earningId": 1,
  "deletedAt": "2026-09-27T21:00:00Z"
}
```

**Admin Restore (if enabled)**
```
PATCH /earnings/:id/restore
Authorization: Bearer {admin-token}

Response:
{
  "message": "Earning restored successfully",
  "earningId": 1,
  "deletedAt": null
}
```

### Error Codes

| Code | Message | Reason |
|------|---------|--------|
| 404 | Earning not found | Invalid earning ID or already deleted |
| 403 | Forbidden | User doesn't own the earning |
| 403 | Forbidden | Only admins can restore earnings |

### Implementation Details

**Service**: `EarningsAggregationService`
- `softDelete(earningId, userId)` - Mark earning as deleted
- `restore(earningId)` - Admin recovery (if exposed)

**Database Changes**:
- `Earning.deletedAt` field already exists in schema
- All queries already filter `deletedAt: null`
- No migration required

## Feature 4: Leaderboard

### Overview

A public leaderboard showing top-earning creators, with privacy controls to protect creator identity if desired.

### Public Endpoint

```
GET /earnings/leaderboard?page=1&limit=20&anonymize=true
```

### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-based) |
| `limit` | integer | 20 | Results per page (max 100) |
| `anonymize` | boolean | true | Hide user IDs and real names |
| `anonymizeEarnings` | boolean | false | Round earnings to ranges |

### Response

```json
{
  "data": [
    {
      "rank": 1,
      "userId": null,
      "displayName": "Creator #1",
      "totalEarnings": 5000,
      "anonymized": true
    },
    {
      "rank": 2,
      "userId": null,
      "displayName": "Creator #2",
      "totalEarnings": 4500,
      "anonymized": true
    }
  ],
  "page": 1,
  "limit": 20,
  "total": 42,
  "totalPages": 3,
  "anonymize": true,
  "earningsExact": true,
  "updatedAt": "2026-09-27T21:00:00Z"
}
```

### Privacy Features

**Anonymization**
- When `anonymize=true` (default): Displays "Creator #1", "Creator #2", etc.
- When `anonymize=false`: Shows opted-in creator usernames

**Earnings Anonymization**
- When `anonymizeEarnings=true`: Rounds to buckets (10, 50, 100, 500)
- When `anonymizeEarnings=false` (default): Shows exact amounts

**Opt-In Required**
- Only users with `showOnLeaderboard=true` appear
- Users with $0 earnings are excluded
- Soft-deleted earnings excluded from totals

### User Rank Endpoint

```
GET /earnings/leaderboard/rank
Authorization: Bearer {token}

Response:
{
  "rank": 5,
  "totalEarnings": 3500,
  "showOnLeaderboard": true
}
```

### Update Privacy Settings

```
PATCH /earnings/leaderboard/visibility
Authorization: Bearer {token}
Content-Type: application/json

{
  "showOnLeaderboard": true
}

Response:
{
  "showOnLeaderboard": true
}
```

### Caching Strategy

- **TTL**: 1 hour (3600 seconds)
- **Key Structure**: `leaderboard:p{page}:l{limit}:a{anonymize}:e{anonymizeEarnings}`
- **Invalidation**: On payout completion, earning deletion, or visibility change

### Performance

- Soft-deleted earnings excluded at query level
- Pagination prevents full table scan
- Redis caching reduces database queries
- Ranked query uses efficient SQL window functions

### Implementation Details

**Service**: `LeaderboardService`
- `getLeaderboard(options)` - Fetch leaderboard page
- `getUserRank(userId)` - Get user's current rank
- `setLeaderboardVisibility(userId, visible)` - Update privacy preference
- `invalidateLeaderboardCache()` - Clear cached results

**Queries**:
- Raw SQL for efficient ranking
- Excluded soft-deleted earnings at WHERE clause
- Only includes opted-in users

## Database Schema

### New/Modified Models

```prisma
model Earning {
  id                    Int       @id @default(autoincrement())
  clipId                Int
  amount                Float
  currency              String    @default("USD")
  amountInBaseCurrency  Float?
  exchangeRate          Float?
  date                  DateTime
  source                String?
  isAnomaly             Boolean   @default(false)
  anomalyReason         String?
  createdAt             DateTime  @default(now())
  deletedAt             DateTime?        // Soft delete timestamp
  clip                  Clip      @relation(fields: [clipId], references: [id], onDelete: Cascade)

  @@index([date])
  @@index([currency])
  @@index([date, currency])
  @@index([deletedAt])              // Index for fast soft-delete filtering
  @@index([clipId, date])
  @@index([clipId])
}

model PayoutReceipt {
  id               Int       @id @default(autoincrement())
  payoutId         Int       @unique
  receiptId        String    @unique
  pdfUrl           String?
  pdfStoragePath   String?
  emailSent        Boolean   @default(false)
  emailSentAt      DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  payout           Payout    @relation(fields: [payoutId], references: [id], onDelete: Cascade)

  @@index([payoutId])
  @@index([receiptId])
  @@index([emailSent])
}

model User {
  id                     Int            @id @default(autoincrement())
  email                  String         @unique
  password               String?
  mfaEnabled             Boolean        @default(false)
  mfaSecret              String?
  provider               String?
  providerId             String?
  name                   String?
  picture                String?
  emailVerified          DateTime?
  stellarPublicKey       String?
  walletType             String?
  encryptedStellarSecret String?
  role                   String         @default("user")
  showOnLeaderboard      Boolean        @default(false)  // Privacy preference
  createdAt              DateTime       @default(now())
  updatedAt              DateTime       @updatedAt
  // ... other fields
}
```

## Testing

### Unit Tests

- **BalanceService**: Partial withdrawal validation, concurrent requests
- **LeaderboardService**: Ranking, anonymization, pagination, caching
- **EarningsService**: Soft-delete filtering in aggregations
- **PayoutReceiptService**: PDF generation, email sending

### Integration Tests

- Full payout workflow: request → approve → process → receipt
- Concurrent partial withdrawal attempts
- Leaderboard with multiple users and privacy settings
- Soft-delete impact on earnings aggregations

### Test Coverage

- Edge cases: zero balance, minimum amounts, concurrent limits
- Authorization: user ownership, admin-only operations
- Error scenarios: insufficient funds, invalid amounts, network failures

## Environment Configuration

### Payout Receipts

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Clips App <noreply@clips.app>"
```

### Leaderboard

```bash
LEADERBOARD_ENABLED=true
REDIS_CACHE_TTL_SECONDS=3600
```

### Payout Limits

```bash
MIN_PAYOUT_USD=5
MAX_PAYOUT_USD=50000
```

## Migration Guide

No database migrations required. All features use existing schema:

1. `Earning.deletedAt` - Already in schema (nullable DateTime)
2. `PayoutReceipt` - Already in schema
3. `User.showOnLeaderboard` - Already in schema
4. `BalanceService` - New service, no schema changes

## Troubleshooting

### Issue: Receipt not received

**Causes**:
- SMTP configuration incorrect
- Email service quota exceeded
- User email address invalid

**Solution**:
- Verify `SMTP_*` environment variables
- Check email service logs
- Verify user email in database

### Issue: Leaderboard shows no users

**Causes**:
- No users with `showOnLeaderboard=true`
- All users have $0 earnings
- Leaderboard disabled

**Solution**:
- Check `LEADERBOARD_ENABLED=true`
- Verify users have opted in: `UPDATE "User" SET "showOnLeaderboard" = true`
- Check earnings aggregation

### Issue: Concurrent payout requests fail

**Causes**:
- Race condition in balance check
- Transaction timeout

**Solution**:
- Increase Prisma transaction timeout
- Check database performance
- Verify Redis cache is working

## Related Documentation

- [API Contract](./api-contract.md)
- [Payout Processing](./queue-flows.md)
- [Database Transactions](./safe-math.md)
- [Error Codes](./error-codes.md)

