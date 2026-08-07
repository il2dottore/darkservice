import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Socket } from 'node:net';
import { AppModule } from './app.module';
import { GatewayService } from './gateway/gateway.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const gateway = app.get(GatewayService);
  const corsOrigins = (
    process.env.CORS_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.use(gateway.use.bind(gateway));

  const server = app.getHttpServer() as HttpServer;
  server.headersTimeout = 10_000;
  server.on(
    'upgrade',
    (request: IncomingMessage, socket: Socket, head: Buffer) => {
      gateway.handleUpgrade(request, socket, head);
    },
  );

  const port = Number(process.env.GATEWAY_PORT ?? 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid GATEWAY_PORT: ${process.env.GATEWAY_PORT}`);
  }

  await app.listen(port, '0.0.0.0');
  gateway.logListening(port);
}

void bootstrap();
