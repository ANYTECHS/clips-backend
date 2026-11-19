import {
  SorobanContractError,
  SOROBAN_CONTRACT_ERROR_MESSAGES,
  contractErrorToHttpStatus,
  parseContractError,
} from './soroban-contract-errors';

describe('SorobanContractError (Issue #1056)', () => {
  describe('contractErrorToHttpStatus', () => {
    it('maps Unauthorized → 403', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.Unauthorized)).toBe(403);
    });

    it('maps TokenNotFound → 404', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.TokenNotFound)).toBe(404);
    });

    it('maps InvalidRoyalty → 400', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.InvalidRoyalty)).toBe(400);
    });

    it('maps ContractPaused → 409', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.ContractPaused)).toBe(409);
    });

    it('maps CooldownActive → 429', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.CooldownActive)).toBe(429);
    });

    it('maps ClipAlreadyMinted → 409', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.ClipAlreadyMinted)).toBe(409);
    });

    it('maps InsufficientBalance → 402', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.InsufficientBalance)).toBe(402);
    });

    it('maps TokenFrozen → 409', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.TokenFrozen)).toBe(409);
    });

    it('maps InvalidSignature → 400', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.InvalidSignature)).toBe(400);
    });

    it('maps SignatureExpired → 401', () => {
      expect(contractErrorToHttpStatus(SorobanContractError.SignatureExpired)).toBe(401);
    });
  });

  describe('SOROBAN_CONTRACT_ERROR_MESSAGES', () => {
    it('has a message for every enum variant', () => {
      for (const variant of Object.values(SorobanContractError)) {
        expect(SOROBAN_CONTRACT_ERROR_MESSAGES[variant]).toBeTruthy();
      }
    });
  });

  describe('parseContractError', () => {
    it('extracts the variant from an Error object', () => {
      const err = new Error('Contract invocation failed: TokenNotFound at token 42');
      expect(parseContractError(err)).toBe(SorobanContractError.TokenNotFound);
    });

    it('extracts the variant from a plain string', () => {
      expect(parseContractError('Unauthorized call')).toBe(SorobanContractError.Unauthorized);
    });

    it('returns null for unknown errors', () => {
      expect(parseContractError('Unknown database error')).toBeNull();
    });

    it('handles null and undefined gracefully', () => {
      expect(parseContractError(null)).toBeNull();
      expect(parseContractError(undefined)).toBeNull();
    });

    it('detects CooldownActive', () => {
      expect(parseContractError('CooldownActive: wait 30s')).toBe(
        SorobanContractError.CooldownActive,
      );
    });

    it('detects ClipAlreadyMinted', () => {
      expect(parseContractError('Error: ClipAlreadyMinted')).toBe(
        SorobanContractError.ClipAlreadyMinted,
      );
    });

    it('detects ContractPaused', () => {
      expect(parseContractError('ContractPaused')).toBe(SorobanContractError.ContractPaused);
    });

    it('detects TokenFrozen', () => {
      expect(parseContractError('TokenFrozen for transfer')).toBe(
        SorobanContractError.TokenFrozen,
      );
    });

    it('detects InvalidSignature', () => {
      expect(parseContractError('InvalidSignature provided')).toBe(
        SorobanContractError.InvalidSignature,
      );
    });

    it('detects SignatureExpired', () => {
      expect(parseContractError('SignatureExpired: token ttl exceeded')).toBe(
        SorobanContractError.SignatureExpired,
      );
    });
  });
});
