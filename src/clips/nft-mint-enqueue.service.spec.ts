import { ConflictException, NotFoundException } from '@nestjs/common';
import { NftMintEnqueueService } from './nft-mint-enqueue.service';

function makeQueue() {
  const jobs = new Map<string, any>();
  return {
    jobs,
    getJob: jest.fn(async (id: string) => jobs.get(id)),
    add: jest.fn(async (_name: string, _data: any, opts: any) => {
      const job = {
        id: opts.jobId,
        attemptsMade: 0,
        getState: async () => 'waiting',
      };
      jobs.set(opts.jobId, job);
      return job;
    }),
  };
}

function makeService() {
  const queue = makeQueue();
  const overflowService = {
    enqueue: jest.fn(async (o: any) =>
      queue.add(o.jobName, o.data, o.baseOptions),
    ),
  };
  const configService = { get: (_k: string, fb: string) => fb };
  const service = new NftMintEnqueueService(
    queue as any,
    overflowService as any,
    configService as any,
  );
  return { service, queue, overflowService };
}

describe('NftMintEnqueueService (#974)', () => {
  it('uses a deterministic jobId per clip', async () => {
    const { service, queue } = makeService();
    const res = await service.enqueueMint({
      clipId: 42,
      walletAddress: 'GABC',
      userId: 7,
    });
    expect(res.jobId).toBe('nft-mint-clip-42');
    expect(queue.add).toHaveBeenCalledWith(
      'mint',
      expect.objectContaining({ clipId: 42 }),
      expect.objectContaining({ jobId: 'nft-mint-clip-42' }),
    );
  });

  it('prevents duplicate active mint jobs with 409', async () => {
    const { service } = makeService();
    await service.enqueueMint({ clipId: 42, walletAddress: 'GABC', userId: 7 });
    await expect(
      service.enqueueMint({ clipId: 42, walletAddress: 'GABC', userId: 7 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('allows re-enqueue after the previous job completed', async () => {
    const { service, queue } = makeService();
    await service.enqueueMint({ clipId: 42, walletAddress: 'GABC', userId: 7 });
    const job = queue.jobs.get('nft-mint-clip-42');
    job.getState = async () => 'completed';
    const res = await service.enqueueMint({
      clipId: 42,
      walletAddress: 'GABC',
      userId: 7,
    });
    expect(res.jobId).toBe('nft-mint-clip-42');
  });

  it('maps job states to transaction states', async () => {
    const { service, queue } = makeService();
    await service.enqueueMint({ clipId: 1, walletAddress: 'GABC', userId: 7 });
    const waiting = await service.getMintStatus('nft-mint-clip-1');
    expect(waiting.txState).toBe('pending');

    const job = queue.jobs.get('nft-mint-clip-1');
    job.getState = async () => 'completed';
    job.returnvalue = { xdr: 'AAAA' };
    expect((await service.getMintStatus('nft-mint-clip-1')).txState).toBe('confirmed');

    job.getState = async () => 'failed';
    job.failedReason = 'boom';
    const failed = await service.getMintStatus('nft-mint-clip-1');
    expect(failed.txState).toBe('failed');
    expect(failed.failedReason).toBe('boom');
  });

  it('throws 404 for unknown jobId', async () => {
    const { service } = makeService();
    await expect(service.getMintStatus('nft-mint-clip-999')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
