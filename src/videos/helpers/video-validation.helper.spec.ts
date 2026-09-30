import { validateAndFetchVideo } from './video-validation.helper';
import { PrismaService } from '../../prisma/prisma.service';

const asPrisma = (video: { findUnique: jest.Mock }) =>
  ({ video }) as unknown as PrismaService;

describe('validateAndFetchVideo (#1026)', () => {
  let video: { findUnique: jest.Mock };

  beforeEach(() => {
    video = { findUnique: jest.fn() };
  });

  it('returns the video when it exists', async () => {
    const record = {
      id: 3,
      sourceUrl: 'https://cdn.test/a.mp4',
      duration: 120,
    };
    video.findUnique.mockResolvedValue(record);

    await expect(validateAndFetchVideo(asPrisma(video), 3)).resolves.toEqual(
      record,
    );
  });

  it('queries the video by primary key', async () => {
    video.findUnique.mockResolvedValue({ id: 3 });

    await validateAndFetchVideo(asPrisma(video), 3);

    expect(video.findUnique).toHaveBeenCalledWith({ where: { id: 3 } });
    expect(video.findUnique).toHaveBeenCalledTimes(1);
  });

  it('throws a descriptive error when the video does not exist', async () => {
    video.findUnique.mockResolvedValue(null);

    await expect(validateAndFetchVideo(asPrisma(video), 42)).rejects.toThrow(
      'Video 42 not found',
    );
  });

  it('includes the requested id in the error message', async () => {
    video.findUnique.mockResolvedValue(undefined);

    await expect(validateAndFetchVideo(asPrisma(video), 7)).rejects.toThrow(
      'Video 7 not found',
    );
  });

  it('propagates a Prisma failure instead of masking it', async () => {
    video.findUnique.mockRejectedValue(new Error('prisma unavailable'));

    await expect(validateAndFetchVideo(asPrisma(video), 1)).rejects.toThrow(
      'prisma unavailable',
    );
  });

  it('does not swallow a soft-deleted (null) record', async () => {
    video.findUnique.mockResolvedValue(null);

    await expect(validateAndFetchVideo(asPrisma(video), 1)).rejects.toThrow(
      Error,
    );
  });
});
