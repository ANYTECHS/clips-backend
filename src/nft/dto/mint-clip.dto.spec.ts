import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateMintDto } from './mint-clip.dto';

function makeValid(overrides: Partial<CreateMintDto> = {}): CreateMintDto {
  return plainToInstance(CreateMintDto, {
    clipId: '42',
    creatorWallet: 'GABC123',
    ...overrides,
  });
}

describe('MintClipDto royaltyBps validation', () => {
  it('passes without royaltyBps (optional)', async () => {
    const errors = await validate(makeValid());
    expect(errors).toHaveLength(0);
  });

  it('passes with royaltyBps = 0', async () => {
    const errors = await validate(makeValid({ royaltyBps: 0 }));
    expect(errors).toHaveLength(0);
  });

  it('passes with royaltyBps = 10000 (100%)', async () => {
    const errors = await validate(makeValid({ royaltyBps: 10000 }));
    expect(errors).toHaveLength(0);
  });

  it('passes with royaltyBps = 1000 (10%)', async () => {
    const errors = await validate(makeValid({ royaltyBps: 1000 }));
    expect(errors).toHaveLength(0);
  });

  it('fails with royaltyBps = -1', async () => {
    const errors = await validate(makeValid({ royaltyBps: -1 }));
    expect(errors.some((e) => e.property === 'royaltyBps')).toBe(true);
  });

  it('fails with royaltyBps = 10001 (>100%)', async () => {
    const errors = await validate(makeValid({ royaltyBps: 10001 }));
    expect(errors.some((e) => e.property === 'royaltyBps')).toBe(true);
  });

  it('fails with royaltyBps = 99999', async () => {
    const errors = await validate(makeValid({ royaltyBps: 99999 }));
    expect(errors.some((e) => e.property === 'royaltyBps')).toBe(true);
  });
});
