import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';

async function exportOpenAPI() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('ClipCash API')
    .setDescription('ClipCash backend API documentation')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT token',
      },
      'access-token',
    )
    .addTag('auth', 'Authentication and authorization')
    .addTag('users', 'User management')
    .addTag('videos', 'Video upload and management')
    .addTag('clips', 'Clip generation and management')
    .addTag('subscriptions', 'Subscription and payment management')
    .addTag('webhooks', 'Webhook endpoints for external services')
    .addTag('wallets', 'Blockchain wallet management')
    .addTag('payouts', 'Revenue payouts')
    .addTag('earnings', 'Earnings tracking')
    .addTag('nfts', 'NFT minting and royalty queries')
    .addTag('jobs', 'Background job management')
    .addTag('platforms', 'Social platform integrations')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outputPath = path.join(process.cwd(), 'openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`✅ OpenAPI spec exported to ${outputPath}`);
  console.log(`📄 API Documentation:`);
  console.log(`   - Endpoints: ${Object.keys(document.paths).length}`);
  console.log(`   - Components: ${Object.keys(document.components?.schemas || {}).length} schemas`);

  await app.close();
}

exportOpenAPI().catch((error) => {
  console.error('Failed to export OpenAPI spec:', error);
  process.exit(1);
});
