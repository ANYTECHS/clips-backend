import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateVideoDto } from './create-video.dto';

describe('CreateVideoDto', () => {
  describe('targetPlatforms validation and transformation', () => {
    it('should pass validation with file upload (no sourceUrl)', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        targetPlatforms: ['tiktok'],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with valid platforms', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
        targetPlatforms: ['tiktok', 'instagram', 'youtube-shorts'],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should normalize platforms to lowercase', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
        targetPlatforms: ['TikTok', 'Instagram', 'YOUTUBE-SHORTS'],
      });

      expect(dto.targetPlatforms).toEqual([
        'tiktok',
        'instagram',
        'youtube-shorts',
      ]);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should deduplicate platforms', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
        targetPlatforms: ['tiktok', 'TikTok', 'TIKTOK', 'instagram'],
      });

      expect(dto.targetPlatforms).toEqual(['tiktok', 'instagram']);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should normalize and deduplicate together', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
        targetPlatforms: [
          'TikTok',
          'tiktok',
          'Instagram',
          'INSTAGRAM',
          'youtube',
        ],
      });

      expect(dto.targetPlatforms).toEqual(['tiktok', 'instagram', 'youtube']);
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation with invalid platform', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
        targetPlatforms: ['tiktok', 'invalid-platform'],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('targetPlatforms');
      expect(errors[0].constraints?.isValidPlatforms).toContain(
        'Invalid platform(s)',
      );
    });

    it('should fail validation when targetPlatforms is not an array', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
        targetPlatforms: 'tiktok',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('targetPlatforms');
    });

    it('should pass validation when targetPlatforms is optional and not provided', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should pass validation with empty array', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
        targetPlatforms: [],
      });

      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail validation with non-string values in array', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
        sourceUrl: 'https://youtube.com/watch?v=test',
        targetPlatforms: ['tiktok', 123, null],
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].property).toBe('targetPlatforms');
    });
  });

  describe('required fields validation', () => {
    it('should fail validation when userId is missing', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        sourceUrl: 'https://youtube.com/watch?v=test',
      });

      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'userId')).toBe(true);
    });

    it('should pass validation when sourceUrl is missing (it is optional)', async () => {
      const dto = plainToInstance(CreateVideoDto, {
        userId: 1,
      });

      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'sourceUrl')).toBe(false);
    });
  });
});
