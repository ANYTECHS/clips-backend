import { ConfigService } from '@nestjs/config';
import {
  getBullMQWorkerConfig,
  validateWorkerConfig,
  getBullMQConnectionConfig,
  validateConnectionConfig,
  BullMQWorkerConfig,
  BullMQConnectionConfig,
} from './bullmq.config';

describe('BullMQ Configuration', () => {
  describe('getBullMQWorkerConfig', () => {
    it('should return default values when env vars are not set', () => {
      const configService = new ConfigService();
      const config = getBullMQWorkerConfig(configService);

      expect(config.clipGenerationConcurrency).toBe(2);
      expect(config.emailDeliveryConcurrency).toBe(5);
    });

    it('should parse env vars correctly', () => {
      const configService = new ConfigService({
        BULLMQ_CLIP_GENERATION_CONCURRENCY: '4',
        BULLMQ_EMAIL_DELIVERY_CONCURRENCY: '10',
      });
      const config = getBullMQWorkerConfig(configService);

      expect(config.clipGenerationConcurrency).toBe(4);
      expect(config.emailDeliveryConcurrency).toBe(10);
    });

    it('should handle string values', () => {
      const configService = new ConfigService({
        BULLMQ_CLIP_GENERATION_CONCURRENCY: '8',
        BULLMQ_EMAIL_DELIVERY_CONCURRENCY: '20',
      });
      const config = getBullMQWorkerConfig(configService);

      expect(config.clipGenerationConcurrency).toBe(8);
      expect(config.emailDeliveryConcurrency).toBe(20);
    });
  });

  describe('validateWorkerConfig', () => {
    it('should accept valid configuration', () => {
      const config: BullMQWorkerConfig = {
        clipGenerationConcurrency: 4,
        emailDeliveryConcurrency: 10,
      };

      expect(() => validateWorkerConfig(config)).not.toThrow();
    });

    it('should reject clip generation concurrency < 1', () => {
      const config: BullMQWorkerConfig = {
        clipGenerationConcurrency: 0,
        emailDeliveryConcurrency: 5,
      };

      expect(() => validateWorkerConfig(config)).toThrow(
        /BULLMQ_CLIP_GENERATION_CONCURRENCY must be at least 1/,
      );
    });

    it('should reject clip generation concurrency > 200', () => {
      const config: BullMQWorkerConfig = {
        clipGenerationConcurrency: 250,
        emailDeliveryConcurrency: 5,
      };

      expect(() => validateWorkerConfig(config)).toThrow(
        /BULLMQ_CLIP_GENERATION_CONCURRENCY should not exceed 200/,
      );
    });

    it('should reject email delivery concurrency < 1', () => {
      const config: BullMQWorkerConfig = {
        clipGenerationConcurrency: 2,
        emailDeliveryConcurrency: 0,
      };

      expect(() => validateWorkerConfig(config)).toThrow(
        /BULLMQ_EMAIL_DELIVERY_CONCURRENCY must be at least 1/,
      );
    });

    it('should reject email delivery concurrency > 50', () => {
      const config: BullMQWorkerConfig = {
        clipGenerationConcurrency: 2,
        emailDeliveryConcurrency: 60,
      };

      expect(() => validateWorkerConfig(config)).toThrow(
        /BULLMQ_EMAIL_DELIVERY_CONCURRENCY should not exceed 50/,
      );
    });

    it('should accept boundary values', () => {
      const minConfig: BullMQWorkerConfig = {
        clipGenerationConcurrency: 1,
        emailDeliveryConcurrency: 1,
      };
      expect(() => validateWorkerConfig(minConfig)).not.toThrow();

      const maxConfig: BullMQWorkerConfig = {
        clipGenerationConcurrency: 200,
        emailDeliveryConcurrency: 50,
      };
      expect(() => validateWorkerConfig(maxConfig)).not.toThrow();
    });

    it('should collect multiple validation errors', () => {
      const config: BullMQWorkerConfig = {
        clipGenerationConcurrency: 0,
        emailDeliveryConcurrency: 60,
      };

      expect(() => validateWorkerConfig(config)).toThrow(
        /BULLMQ_CLIP_GENERATION_CONCURRENCY must be at least 1/,
      );
      expect(() => validateWorkerConfig(config)).toThrow(
        /BULLMQ_EMAIL_DELIVERY_CONCURRENCY should not exceed 50/,
      );
    });
  });
});

describe('BullMQ Connection Configuration', () => {
  describe('getBullMQConnectionConfig', () => {
    it('should return defaults when env vars are not set', () => {
      const configService = new ConfigService();
      const config = getBullMQConnectionConfig(configService);

      expect(config.redisHost).toBe('localhost');
      expect(config.redisPort).toBe(6379);
    });

    it('should parse env vars correctly', () => {
      const configService = new ConfigService({
        REDIS_HOST: 'redis.prod.internal',
        REDIS_PORT: '6380',
      });
      const config = getBullMQConnectionConfig(configService);

      expect(config.redisHost).toBe('redis.prod.internal');
      expect(config.redisPort).toBe(6380);
    });
  });

  describe('validateConnectionConfig', () => {
    it('should accept valid configuration', () => {
      const config: BullMQConnectionConfig = { redisHost: 'localhost', redisPort: 6379 };
      expect(() => validateConnectionConfig(config)).not.toThrow();
    });

    it('should reject empty REDIS_HOST', () => {
      const config: BullMQConnectionConfig = { redisHost: '', redisPort: 6379 };
      expect(() => validateConnectionConfig(config)).toThrow(
        /REDIS_HOST must be a non-empty string/,
      );
    });

    it('should reject whitespace-only REDIS_HOST', () => {
      const config: BullMQConnectionConfig = { redisHost: '   ', redisPort: 6379 };
      expect(() => validateConnectionConfig(config)).toThrow(
        /REDIS_HOST must be a non-empty string/,
      );
    });

    it('should reject REDIS_PORT of 0', () => {
      const config: BullMQConnectionConfig = { redisHost: 'localhost', redisPort: 0 };
      expect(() => validateConnectionConfig(config)).toThrow(
        /REDIS_PORT must be a valid port number/,
      );
    });

    it('should reject REDIS_PORT > 65535', () => {
      const config: BullMQConnectionConfig = { redisHost: 'localhost', redisPort: 70000 };
      expect(() => validateConnectionConfig(config)).toThrow(
        /REDIS_PORT must be a valid port number/,
      );
    });

    it('should reject NaN REDIS_PORT', () => {
      const config: BullMQConnectionConfig = { redisHost: 'localhost', redisPort: NaN };
      expect(() => validateConnectionConfig(config)).toThrow(
        /REDIS_PORT must be a valid port number/,
      );
    });

    it('should accept boundary port values', () => {
      expect(() =>
        validateConnectionConfig({ redisHost: 'localhost', redisPort: 1 }),
      ).not.toThrow();
      expect(() =>
        validateConnectionConfig({ redisHost: 'localhost', redisPort: 65535 }),
      ).not.toThrow();
    });

    it('should collect multiple errors', () => {
      const config: BullMQConnectionConfig = { redisHost: '', redisPort: 0 };
      expect(() => validateConnectionConfig(config)).toThrow(
        /Invalid BullMQ connection configuration/,
      );
    });
  });
});
