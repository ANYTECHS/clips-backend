# Payouts Module

## Overview

The Payouts module handles all payout-related functionality including:
- Stellar cryptocurrency payouts
- Fiat bank account payouts (with encrypted storage)
- Payout fee calculation
- Payout receipts
- Admin payout management

## Components

### Services

#### `PayoutsService`
Handles Stellar cryptocurrency payouts.

**Key Methods:**
- `requestPayout(userId)` - Request a new payout
- `getPayoutHistory(userId)` - Get user's payout history
- `processPayout(payoutId)` - Process a pending payout
- `batchProcessPayouts(payoutIds)` - Process multiple payouts

#### `PayoutMethodService`
Manages encrypted fiat payout methods (bank accounts).

**Key Methods:**
- `create(userId, dto)` - Create new payout method (encrypts sensitive data)
- `findAll(userId)` - List all payout methods (sanitized)
- `findOne(id, userId)` - Get specific method (sanitized)
- `findOneWithSensitiveData(id, userId)` - **INTERNAL ONLY** - Get with decrypted data
- `update(id, userId, dto)` - Update non-sensitive fields
- `remove(id, userId)` - Soft delete method
- `getDefaultMethod(userId)` - Get user's default method

**Security:**
- All sensitive fields are encrypted using AES-256-GCM
- Only last 4 digits stored in plaintext
- Sensitive data never exposed in API responses
- Decryption only happens when processing actual payouts

#### `FeeService`
Calculates payout fees based on method and amount.

#### `PayoutReceiptService`
Generates and sends payout receipts to users.

### Controllers

#### `PayoutsController`
User-facing payout endpoints.

**Endpoints:**
- `POST /payouts/request` - Request payout
- `GET /payouts` - Get payout history
- `POST /payouts/:id/process` - Process payout

#### `PayoutMethodController`
User-facing payout method management.

**Endpoints:**
- `POST /payout-methods` - Create payout method
- `GET /payout-methods` - List payout methods
- `GET /payout-methods/default` - Get default method
- `GET /payout-methods/:id` - Get specific method
- `PUT /payout-methods/:id` - Update method
- `DELETE /payout-methods/:id` - Delete method

#### `AdminPayoutsController`
Admin endpoints for payout management.

#### `AdminFeesController`
Admin endpoints for fee configuration.

## Usage Examples

### Creating a Bank Account Payout Method

```typescript
import { PayoutMethodService } from './payout-method.service';

// In your service/controller
const payoutMethod = await this.payoutMethodService.create(userId, {
  type: 'bank_account',
  accountNumber: '1234567890',
  routingNumber: '021000021',
  bankName: 'Chase Bank',
  accountHolderName: 'John Doe',
  country: 'US',
  currency: 'USD',
  isDefault: true,
});

// Response (sensitive data encrypted):
// {
//   id: 1,
//   type: 'bank_account',
//   isDefault: true,
//   bankName: 'Chase Bank',
//   accountHolderName: 'John Doe',
//   country: 'US',
//   currency: 'USD',
//   lastFourDigits: '7890',  // Only last 4 digits visible
//   createdAt: '2026-05-31T12:00:00Z',
//   updatedAt: '2026-05-31T12:00:00Z'
// }
```

### Processing a Fiat Payout (Internal Use)

```typescript
// Get payout method with decrypted data (INTERNAL USE ONLY)
const payoutMethod = await this.payoutMethodService.findOneWithSensitiveData(
  methodId,
  userId,
);

// Now you have access to decrypted fields:
// payoutMethod.accountNumber
// payoutMethod.routingNumber
// payoutMethod.swiftCode
// payoutMethod.iban

// Use these to process the actual bank transfer
// Then create payout record
await this.prisma.payout.create({
  data: {
    userId,
    payoutMethodId: methodId,
    amount: 100.00,
    currency: 'USD',
    method: 'bank_account',
    status: 'processing',
  },
});
```

### Listing User's Payout Methods

```typescript
const methods = await this.payoutMethodService.findAll(userId);

// Returns sanitized list (no sensitive data):
// [
//   {
//     id: 1,
//     type: 'bank_account',
//     isDefault: true,
//     bankName: 'Chase Bank',
//     lastFourDigits: '7890',
//     ...
//   },
//   {
//     id: 2,
//     type: 'wire_transfer',
//     isDefault: false,
//     bankName: 'International Bank',
//     lastFourDigits: '1234',
//     ...
//   }
// ]
```

### Updating a Payout Method

```typescript
// Can only update non-sensitive fields
const updated = await this.payoutMethodService.update(methodId, userId, {
  bankName: 'Updated Bank Name',
  isDefault: true,  // This will unset other defaults
});

// To change account number, must create new method
```

## Security Best Practices

### ✅ DO

- Use `findAll()` or `findOne()` for displaying payout methods to users
- Use `findOneWithSensitiveData()` only when processing actual payouts
- Validate user ownership before any operation
- Log access to sensitive data for audit purposes
- Use soft delete to maintain audit trail

### ❌ DON'T

- Never log decrypted sensitive data
- Never expose encrypted fields in API responses
- Never return decrypted data to frontend
- Never hard delete payout methods (use soft delete)
- Never reuse encryption keys across environments

## Database Schema

```prisma
model PayoutMethod {
  id                      Int       @id @default(autoincrement())
  userId                  Int
  type                    String    // 'bank_account', 'wire_transfer', 'ach'
  isDefault               Boolean   @default(false)
  
  // Encrypted fields (AES-256-GCM)
  encryptedAccountNumber  String?
  encryptedRoutingNumber  String?
  encryptedSwiftCode      String?
  encryptedIban           String?
  
  // Non-sensitive fields
  bankName                String?
  accountHolderName       String?
  country                 String?
  currency                String    @default("USD")
  lastFourDigits          String?   // For display only
  
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  deletedAt               DateTime? // Soft delete
  
  user                    User      @relation(...)
  payouts                 Payout[]
}
```

## Testing

```bash
# Run all payout tests
npm test -- payouts

# Run specific test file
npm test -- payout-method.service.spec.ts

# Run with coverage
npm test -- --coverage payouts
```

## Environment Variables

```bash
# Required for encryption
ENCRYPTION_SECRET="your_encryption_secret_min_32_chars"

# Generate with:
openssl rand -base64 32
```

## Migration

```bash
# Apply migration
npx prisma migrate deploy

# Or for development
npx prisma migrate dev
```

## Related Documentation

- [FIAT_PAYOUT_SECURITY.md](../../FIAT_PAYOUT_SECURITY.md) - Detailed security documentation
- [IMPLEMENTATION_CHECKLIST.md](../../IMPLEMENTATION_CHECKLIST.md) - Implementation status

## Support

For questions or issues:
- Security concerns: Contact security team
- Implementation questions: Review test files for examples
- API documentation: Check Swagger UI at `/api`
