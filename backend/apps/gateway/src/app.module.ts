import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { GatewayModule } from './gateway/gateway.module';
import { HealthController } from './health.controller';

@Module({
  imports: [ConfigModule, GatewayModule],
  controllers: [HealthController],
})
export class AppModule {}
