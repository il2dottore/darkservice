import { Module } from '@nestjs/common';
import { ConfigModule } from '@app/config';
import { RabbitmqModule, RABBITMQ_ATTACK_STATUS_QUEUE } from '@app/rabbitmq';
import { NodeRouterController } from './node-router.controller';
import { NodeRouterService } from './node-router.service';

@Module({
  imports: [
    ConfigModule,
    RabbitmqModule.forServices([
      {
        name: RABBITMQ_ATTACK_STATUS_QUEUE,
        configKey: 'rabbitmq.attackStatusQueue',
      },
    ]),
  ],
  controllers: [NodeRouterController],
  providers: [NodeRouterService],
})
export class AppModule {}
