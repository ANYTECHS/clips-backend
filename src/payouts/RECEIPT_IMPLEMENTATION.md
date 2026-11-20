# Payout Receipt Generation Implementation

## Overview

This document describes the payout receipt generation feature that automatically creates and sends PDF receipts to users after successful payouts are completed.

## Feature Flow

```
Payout Completed ↓
Generate Receipt ID ↓
Create Receipt Metadata in DB ↓
Generate PDF Receipt ↓
Send Email with PDF Attachment ↓
Update Receipt Status (emailSent flag)
```

## Database Schema

### PayoutReceipt Model

```prisma
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
```

**Fields:**
- `payoutId`: Link to the completed payout (unique, one receipt per payout)
- `receiptId`: Unique receipt identifier (format: `RCP-{timestamp}-{randomChars}`)
- `pdfUrl`: URL for cloud storage (future implementation)
- `pdfStoragePath`: Path if storing PDFs locally (future implementation)
- `emailSent`: Flag indicating successful email delivery
- `emailSentAt`: Timestamp when email was sent

## API Endpoints

### 1. Download Receipt PDF

**Endpoint:** `GET /payouts/:id/receipt`

**Authentication:** Required (Bearer token)

**Description:** Downloads the payout receipt as a PDF file.

**Response:**
- Status: 200
- Content-Type: application/pdf
- Headers: `Content-Disposition: attachment; filename="payout-receipt-{id}.pdf"`

**Error Codes:**
- 404: Payout not found or receipt doesn't exist
- 400: Payout is not completed

**Example:**
```bash
curl -H "Authorization: Bearer {token}" \
  https://api.clips.app/payouts/123/receipt \
  -o receipt.pdf
```

### 2. Get Receipt Metadata

**Endpoint:** `GET /payouts/:id/receipt/metadata`

**Authentication:** Required (Bearer token)

**Description:** Retrieves receipt metadata including ID, email status, and timestamps.

**Response:**
```json
{
  "id": 1,
  "receiptId": "RCP-1694812000000-ABC123XYZ",
  "payoutId": 123,
  "emailSent": true,
  "emailSentAt": "2026-08-24T12:00:00.000Z",
  "createdAt": "2026-08-24T12:00:00.000Z",
  "updatedAt": "2026-08-24T12:00:00.000Z"
}
```

**Error Codes:**
- 404: Receipt not found
- 401: Unauthorized

## Receipt Contents

The PDF receipt includes the following information:

```
Payout Receipt
Clips App

Payout ID:       #123
Amount:          100.00 USD
Fee:             2.50 USD (2.5%)
Net Amount:      97.50 USD
Payout Method:   stellar
Status:          Completed
Date:            2026-08-24T12:00:00.000Z
Wallet:          GBW2...2MYUA (masked)
Transaction ID:  {transaction_hash}
On-Chain Hash:   {on_chain_tx_hash}

This receipt was automatically generated. 
Please keep it for your records.
```

### Receipt Email

**Subject:** `Payout Receipt — #{payoutId}`

**Format:** HTML email with plain text fallback

**Attachments:** 
- PDF receipt (`payout-receipt-{id}.pdf`)

**Content:**
- All transaction details in table format
- Masked wallet address for security
- Transaction ID and on-chain hash for verification
- Fee breakdown including percentage and net amount

## Service Methods

### PayoutReceiptService

#### `generateAndSendReceipt(data: PayoutReceiptData): Promise<ReceiptResponse>`

**Purpose:** Main method to generate receipt, store metadata, and send email.

**Parameters:**
```typescript
interface PayoutReceiptData {
  payoutId: number;
  amount: number;
  currency: string;
  method: string;
  feeAmount?: number;
  feePercentage?: number;
  finalAmount?: number;
  transactionId: string;
  onChainTxHash: string | null;
  confirmedAt: Date;
  paidAt?: Date;
  status?: string;
  recipientEmail: string;
  walletAddress: string;
}
```

**Returns:**
```typescript
interface ReceiptResponse {
  id: number;
  receiptId: string;
  payoutId: number;
  emailSent: boolean;
  emailSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**Behavior:**
1. Generates unique receipt ID
2. Creates PDF from payout data
3. Creates receipt metadata in database
4. Sends email with PDF attachment
5. Updates `emailSent` flag and timestamp
6. Returns receipt metadata
7. If email fails, receipt is still created and returned

#### `getReceiptByPayoutId(payoutId: number): Promise<ReceiptResponse>`

Retrieves receipt metadata by payout ID.

#### `getReceiptById(receiptId: string): Promise<ReceiptResponse>`

Retrieves receipt metadata by unique receipt ID.

#### `getReceiptPdf(payoutId: number, data: PayoutReceiptData): Promise<Buffer>`

Generates PDF buffer on-demand for downloading.

## Integration Points

### PayoutsService

Receipt generation is triggered automatically when a payout is completed:

```typescript
// In processPayout() and batchProcessPayouts()
void this.payoutReceiptService.generateAndSendReceipt({
  payoutId: completePayoutData.id,
  amount: completePayoutData.amount,
  currency: completePayoutData.currency,
  method: completePayoutData.method,
  feeAmount: completePayoutData.feeAmount,
  feePercentage: completePayoutData.feePercentage,
  finalAmount: completePayoutData.finalAmount,
  transactionId: transaction.hash().toString('hex'),
  onChainTxHash: txHash,
  confirmedAt: confirmedTime,
  paidAt: confirmedTime,
  status: 'completed',
  recipientEmail: payout.user.email,
  walletAddress: payout.wallet.address,
});
```

**Key Points:**
- Receipt generation is fire-and-forget (void/non-blocking)
- Payout completion is NOT dependent on receipt generation success
- If receipt generation fails, the payout still completes successfully
- Email failure is logged but doesn't prevent payout success

## Security Considerations

### Data Privacy
- Wallet addresses are masked: `GBW2...2MYUA` (first 4 + last 6 characters)
- Email contains no sensitive data that could expose account details
- Receipt only accessible to payout owner (userId validation)

### Error Handling
- Receipt generation errors are logged but don't affect payout completion
- Email delivery failures are caught and logged separately
- Both failures return the receipt metadata for user visibility

### Access Control
- Receipt download requires authentication
- User can only access their own receipts (userId validation)
- 404 returned if payout not found or belongs to different user

## Environment Variables

Required for email functionality:

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Clips App <noreply@clips.app>"
```

## Testing

### Manual Testing

1. Create a payout request:
```bash
curl -X POST http://localhost:3000/payouts/request \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{"amount": 100, "currency": "USD", "method": "stellar"}'
```

2. Approve the payout (admin only)

3. Process the payout:
```bash
curl -X POST http://localhost:3000/payouts/123/process \
  -H "Authorization: Bearer {token}"
```

4. Verify receipt was created:
```bash
curl http://localhost:3000/payouts/123/receipt/metadata \
  -H "Authorization: Bearer {token}"
```

5. Download receipt:
```bash
curl http://localhost:3000/payouts/123/receipt \
  -H "Authorization: Bearer {token}" \
  -o receipt.pdf
```

### Unit Tests

Test coverage should include:
- Receipt ID generation (uniqueness)
- PDF generation with all fields
- Database storage of metadata
- Email sending with attachment
- Authorization checks on receipt endpoints
- Error handling for missing receipts
- Payout completion without email failure

## Database Migration

Migration file: `prisma/migrations/20260824_add_payout_receipt/migration.sql`

Run migration:
```bash
npx prisma migrate deploy
```

## Future Enhancements

1. **PDF Storage**: Store generated PDFs in cloud storage (S3, GCS) with `pdfUrl` and `pdfStoragePath`
2. **Receipt Resend**: Allow users to resend receipt email
3. **Receipt History**: Bulk download multiple receipts as ZIP
4. **Export Formats**: Support CSV/JSON export in addition to PDF
5. **Scheduled Retry**: Retry failed email deliveries
6. **Receipt Templates**: Customizable receipt templates per brand
7. **QR Codes**: Add QR code linking to receipt details
8. **Webhook Notifications**: Send webhooks on receipt generation

## Troubleshooting

### Receipt not created
- Check email configuration (SMTP variables)
- Verify payout status is "completed"
- Check application logs for PayoutReceiptService errors

### Email not sent
- Verify SMTP credentials are correct
- Check spam folder
- Review email service logs
- Verify recipient email is valid

### PDF generation fails
- Ensure pdfkit library is installed
- Check available disk space for PDF generation
- Verify required node version (14+)

### Access denied on receipt download
- Verify user is authenticated
- Confirm user owns the payout (userId matches)
- Check payout exists and status is "completed"

## Related Files

- `src/payouts/payout-receipt.service.ts` - Receipt generation service
- `src/payouts/payouts.service.ts` - Payout processing integration
- `src/payouts/payouts.controller.ts` - Receipt endpoints
- `src/payouts/dto/receipt-responses.dto.ts` - Receipt DTOs
- `prisma/schema.prisma` - Database schema
- `prisma/migrations/20260824_add_payout_receipt/` - Migration files
