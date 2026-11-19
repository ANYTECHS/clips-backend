import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

/** Mirrors `ContractError` in contracts/src/error.rs. Keep codes in sync. */
export enum NftContractError {
  NotInitialized = 1,
  AlreadyInitialized = 2,
  InvalidRoyaltyBps = 3,
  RoyaltyExceedsCap = 4,
  Unauthorized = 5,
  NotFound = 6,
  AlreadyExists = 7,
  InsufficientBalance = 8,
  ClipAlreadyMinted = 9,
  ContractPaused = 10,
  TokenFrozen = 11,
  CooldownActive = 12,
  InvalidSignature = 13,
  SignatureExpired = 14,
  NonceAlreadyUsed = 15,
  ApprovalNotFound = 16,
  TokenNotFound = 17,
}

const STATUS: Record<NftContractError, HttpStatus> = {
  [NftContractError.NotInitialized]: HttpStatus.INTERNAL_SERVER_ERROR,
  [NftContractError.AlreadyInitialized]: HttpStatus.CONFLICT,
  [NftContractError.InvalidRoyaltyBps]: HttpStatus.BAD_REQUEST,
  [NftContractError.RoyaltyExceedsCap]: HttpStatus.BAD_REQUEST,
  [NftContractError.Unauthorized]: HttpStatus.FORBIDDEN,
  [NftContractError.NotFound]: HttpStatus.NOT_FOUND,
  [NftContractError.AlreadyExists]: HttpStatus.CONFLICT,
  [NftContractError.InsufficientBalance]: HttpStatus.BAD_REQUEST,
  [NftContractError.ClipAlreadyMinted]: HttpStatus.CONFLICT,
  [NftContractError.ContractPaused]: HttpStatus.CONFLICT,
  [NftContractError.TokenFrozen]: HttpStatus.CONFLICT,
  [NftContractError.CooldownActive]: HttpStatus.TOO_MANY_REQUESTS,
  [NftContractError.InvalidSignature]: HttpStatus.UNAUTHORIZED,
  [NftContractError.SignatureExpired]: HttpStatus.UNAUTHORIZED,
  [NftContractError.NonceAlreadyUsed]: HttpStatus.CONFLICT,
  [NftContractError.ApprovalNotFound]: HttpStatus.NOT_FOUND,
  [NftContractError.TokenNotFound]: HttpStatus.NOT_FOUND,
};

/** Extracts the contract error code from a Soroban error string like `Error(Contract, #12)`. */
export function parseContractErrorCode(err: unknown): NftContractError | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m = /Error\(Contract,\s*#(\d+)\)/.exec(msg);
  const code = m ? Number(m[1]) : NaN;
  return code in STATUS ? (code as NftContractError) : null;
}

/** Converts a contract error into the documented HTTP exception. */
export function toHttpException(
  err: unknown,
  extra: Record<string, unknown> = {},
): HttpException {
  const code = parseContractErrorCode(err);
  if (code === null) return new InternalServerErrorException('Contract call failed');
  const body = { statusCode: STATUS[code], error: NftContractError[code], code, ...extra };
  switch (STATUS[code]) {
    case HttpStatus.BAD_REQUEST: return new BadRequestException(body);
    case HttpStatus.UNAUTHORIZED: return new UnauthorizedException(body);
    case HttpStatus.FORBIDDEN: return new ForbiddenException(body);
    case HttpStatus.NOT_FOUND: return new NotFoundException(body);
    case HttpStatus.CONFLICT: return new ConflictException(body);
    default: return new HttpException(body, STATUS[code]);
  }
}
