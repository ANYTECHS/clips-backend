import {
  SUPPORTED_CHAINS,
  DEFAULT_CHAIN,
  isSupportedChain,
  assertSupportedChain,
} from './chain.constants';

describe('chain constants', () => {
  it('exports exactly stellar, solana, and base as supported chains', () => {
    expect([...SUPPORTED_CHAINS]).toEqual(['stellar', 'solana', 'base']);
  });

  it('sets stellar as the default chain', () => {
    expect(DEFAULT_CHAIN).toBe('stellar');
  });
});

describe('isSupportedChain', () => {
  it.each([...SUPPORTED_CHAINS])('returns true for "%s"', (chain) => {
    expect(isSupportedChain(chain)).toBe(true);
  });

  it.each(['ethereum', 'bitcoin', 'polygon', '', 'STELLAR', 'Solana'])(
    'returns false for unsupported value "%s"',
    (chain) => {
      expect(isSupportedChain(chain)).toBe(false);
    },
  );
});

describe('assertSupportedChain', () => {
  it.each([...SUPPORTED_CHAINS])('returns the chain value for "%s"', (chain) => {
    expect(assertSupportedChain(chain)).toBe(chain);
  });

  it('throws when chain is not supported', () => {
    expect(() => assertSupportedChain('ethereum')).toThrow(
      'Unsupported chain "ethereum"',
    );
  });

  it('includes the list of supported chains in the error message', () => {
    expect(() => assertSupportedChain('bitcoin')).toThrow(
      'stellar, solana, base',
    );
  });
});
