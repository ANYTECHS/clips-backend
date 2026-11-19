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
    .addTag('Authentication', 'Authentication and authorization')
    .addTag('Users', 'User management')
    .addTag('Videos', 'Video upload and management')
    .addTag('Clips', 'Clip generation and management')
    .addTag('Subscriptions', 'Subscription plans and lifecycle')
    .addTag('Payments', 'Fiat and Stellar subscription payments')
    .addTag('Webhooks', 'Webhook endpoints for external services')
    .addTag('Wallets', 'Blockchain wallet management')
    .addTag('Payouts', 'Revenue payouts and payout methods')
    .addTag('Admin', 'Admin-only endpoints')
    .addTag('earnings', 'Earnings tracking')
    .addTag('NFTs', 'NFT minting and royalty management')
    .addTag('stellar', 'Stellar network interactions')
    .addTag('jobs', 'Background job management')
    .addTag('platforms', 'Social platform integrations')
    .addTag('queues', 'BullMQ queue management')
    .addTag('circuit-breaker', 'Circuit breaker monitoring and management')
    .addTag('metrics', 'Prometheus metrics endpoint')
    .addTag('user-platforms', 'Social platform connections')
    .addTag('platform', 'Platform revenue queries')
    .addTag('health', 'System health checks')
    .addTag('blockchain', 'Indexed Soroban contract events')
    .addTag('transactions', 'Blockchain transactions')
    .addTag('payout-methods', 'Payout method management')
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
