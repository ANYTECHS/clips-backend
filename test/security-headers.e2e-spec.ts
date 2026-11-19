import { Controller, Get, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { configureHelmet } from '../src/common/security/helmet';

@Controller()
class SecurityHeadersController {
  @Get()
  getRoot() {
    return { ok: true };
  }
}

describe('Helmet security headers (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [SecurityHeadersController],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureHelmet(app, true);

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Security headers test').build(),
    );
    SwaggerModule.setup('api/docs', app, document);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('sets security headers on API responses', async () => {
    const response = await request(app.getHttpServer()).get('/');

    expect(response.status).toBe(200);
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'self'",
    );
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-resource-policy']).toBe(
      'cross-origin',
    );
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('serves Swagger UI and assets with the Swagger-compatible CSP', async () => {
    const docsResponse = await request(app.getHttpServer()).get('/api/docs/');

    expect(docsResponse.status).toBe(200);
    expect(docsResponse.headers['content-type']).toContain('text/html');
    expect(docsResponse.headers['content-security-policy']).toContain(
      "script-src 'self' 'unsafe-inline'",
    );
    expect(docsResponse.text).toContain('SwaggerUIBundle');

    const bundleResponse = await request(app.getHttpServer()).get(
      '/api/docs/swagger-ui-bundle.js',
    );
    expect(bundleResponse.status).toBe(200);
    expect(bundleResponse.headers['content-type']).toContain('javascript');
  });
});