import {
  IsString,
  IsNotEmpty,
  MaxLength,
  Matches,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Stellar amounts: up to 7 decimal places, between 0.0000001 and 10000 XLM */
function IsXlmAmount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isXlmAmount',
      target: (object as any).constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, _args: ValidationArguments) {
          if (typeof value !== 'string') return false;
          // Must be a positive decimal with at most 7 places
          if (!/^\d+(\.\d{1,7})?$/.test(value)) return false;
          const n = parseFloat(value);
          return n >= 0.0000001 && n <= 10000;
        },
        defaultMessage(_args: ValidationArguments) {
          return 'amount must be a positive number between 0.0000001 and 10000 XLM with at most 7 decimal places';
        },
      },
    });
  };
}

export const TRANSACTION_MIN_AMOUNT = 0.0000001; // 1 stroop
export const TRANSACTION_MAX_AMOUNT = 10_000;    // 10 000 XLM per send
export const TRANSACTION_DAILY_LIMIT = 50_000;   // 50 000 XLM rolling 24 h

/** @deprecated Use CreateTransactionDto */
export type SendTransactionDto = CreateTransactionDto;

export class CreateTransactionDto {
  @ApiProperty({
    description: 'Stellar destination address (G... — 56 chars)',
    maxLength: 56,
    example: 'GC6XOTK6L6LGBKIWH3IRUZPVUY4COGEMW4J5YINOSPKO27YKTUUHTZF3',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(56)
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'destination must be a valid Stellar public key (G...)' })
  destination: string;

  @ApiProperty({
    description: 'Amount of XLM to send (0.0000001 – 10 000)',
    example: '10.5',
  })
  @IsString()
  @IsNotEmpty()
  @IsXlmAmount()
  amount: string;
}

