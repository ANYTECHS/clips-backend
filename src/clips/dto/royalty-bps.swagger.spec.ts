import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { CreateClipDto, DEFAULT_CLIP_ROYALTY_BPS } from './create-clip.dto';
import { UpdateClipRoyaltyDto } from './update-clip-royalty.dto';
import { ClipResponseDto } from './clip-response.dto';

describe('royaltyBps OpenAPI documentation', () => {
  async function buildSchemas() {
    const moduleRef = await Test.createTestingModule({
      controllers: [],
      providers: [],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Clips API').build(),
      {
        extraModels: [CreateClipDto, UpdateClipRoyaltyDto, ClipResponseDto],
      },
    );

    await app.close();
    return document.components?.schemas ?? {};
  }

  function royaltyProps(schema: unknown): Record<string, any> | undefined {
    return (schema as { properties?: Record<string, any> } | undefined)
      ?.properties?.royaltyBps;
  }

  it('documents CreateClipDto.royaltyBps with description, default 1000, min 0, max 1500, example', async () => {
    const schemas = await buildSchemas();
    const prop = royaltyProps(schemas.CreateClipDto);

    expect(prop).toBeDefined();
    expect(prop.description).toEqual(
      expect.stringContaining('NFT royalty in BPS'),
    );
    expect(prop.default).toBe(DEFAULT_CLIP_ROYALTY_BPS);
    expect(prop.default).toBe(1000);
    expect(prop.minimum).toBe(0);
    expect(prop.maximum).toBe(1500);
    expect(prop.example).toBe(1000);
  });

  it('documents UpdateClipRoyaltyDto.royaltyBps with description, default 1000, min 0, max 1500, example', async () => {
    const schemas = await buildSchemas();
    const prop = royaltyProps(schemas.UpdateClipRoyaltyDto);

    expect(prop).toBeDefined();
    expect(prop.description).toEqual(expect.stringContaining('NFT royalty'));
    expect(prop.default).toBe(1000);
    expect(prop.minimum).toBe(0);
    expect(prop.maximum).toBe(1500);
    expect(prop.example).toBe(1000);
  });

  it('documents ClipResponseDto.royaltyBps with description, default 1000, min 0, max 1500, example', async () => {
    const schemas = await buildSchemas();
    const prop = royaltyProps(schemas.ClipResponseDto);

    expect(prop).toBeDefined();
    expect(prop.description).toEqual(expect.stringContaining('NFT royalty'));
    expect(prop.default).toBe(1000);
    expect(prop.minimum).toBe(0);
    expect(prop.maximum).toBe(1500);
    expect(prop.example).toBe(1000);
  });
});
