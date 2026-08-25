import { ApiProperty } from '@nestjs/swagger';

export class PayoutReceiptDto {
  @ApiProperty({ example: 1, description: 'Receipt ID' })
  id: number;

  @ApiProperty({
    example: 'RCP-1694812000000-ABC123XYZ',
    description: 'Unique receipt identifier',
  })
  receiptId: string;

  @ApiProperty({ example: 1, description: 'Associated payout ID' })
  payoutId: number;

  @ApiProperty({
    example: true,
    description: 'Whether email was successfully sent',
  })
  emailSent: boolean;

  @ApiProperty({
    example: '2026-08-24T12:00:00.000Z',
    description: 'Timestamp when email was sent',
    nullable: true,
  })
  emailSentAt: Date | null;

  @ApiProperty({
    example: '2026-08-24T12:00:00.000Z',
    description: 'Receipt creation timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    example: '2026-08-24T12:00:00.000Z',
    description: 'Receipt last update timestamp',
  })
  updatedAt: Date;
}

export class ReceiptDownloadResponseDto {
  @ApiProperty({
    description: 'Receipt metadata',
    type: PayoutReceiptDto,
  })
  receipt: PayoutReceiptDto;

  @ApiProperty({
    example: 'application/pdf',
    description: 'Content type of the PDF',
  })
  contentType: string;

  @ApiProperty({
    example: 'payout-receipt-1.pdf',
    description: 'Suggested filename for the receipt',
  })
  filename: string;
}
