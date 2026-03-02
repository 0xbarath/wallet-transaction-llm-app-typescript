import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Wallet Transaction History API')
    .setDescription('Wallet transaction history service with LLM-powered enrichment')
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-Auth-WalletAccess', in: 'header' }, 'auth')
    .addApiKey(
      { type: 'apiKey', name: 'X-Role', in: 'header', description: 'Role header (admin or user)' },
      'role',
    )
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  const banner = `
╔══════════════════════════════════════════════════╗
║        Wallet Transaction History API            ║
║                                                  ║
║   ┌─────────┐    ┌─────────┐    ┌──────────┐    ║
║   │ Wallets │───▶│  Sync   │───▶│ Enrichment│   ║
║   └─────────┘    └─────────┘    └──────────┘    ║
║        │              │              │           ║
║        ▼              ▼              ▼           ║
║   ┌─────────┐    ┌─────────┐    ┌──────────┐    ║
║   │ Prisma  │    │ Alchemy │    │ Anthropic │   ║
║   └─────────┘    └─────────┘    └──────────┘    ║
╚══════════════════════════════════════════════════╝`;
  logger.log(banner);
  logger.log(`API base URL:  http://localhost:${port}`);
  logger.log(`Swagger docs:  http://localhost:${port}/api-docs`);
  logger.log(`Health check:  http://localhost:${port}/health`);
}
bootstrap();
