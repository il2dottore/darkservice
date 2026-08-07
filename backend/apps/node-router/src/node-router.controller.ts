import { Controller } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { Channel, Message } from 'amqplib';
import { NodeRouterService } from './node-router.service';

@Controller()
export class NodeRouterController {
  constructor(private readonly nodeRouter: NodeRouterService) {}

  @EventPattern('attack.fired')
  async dispatch(
    @Payload() event: AttackEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    const message = getMessage(context);
    try {
      await this.nodeRouter.dispatch(event);
    } catch (error) {
      await this.nodeRouter.publishFailure(
        event,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      getChannel(context).ack(message);
    }
  }

  @EventPattern('attack.cancel')
  async cancel(
    @Payload() event: CancelEvent,
    @Ctx() context: RmqContext,
  ): Promise<void> {
    try {
      await this.nodeRouter.cancel(event.id);
    } finally {
      getChannel(context).ack(getMessage(context));
    }
  }
}

function getChannel(context: RmqContext): Channel {
  return context.getChannelRef() as Channel;
}

function getMessage(context: RmqContext): Message {
  return context.getMessage() as Message;
}

export interface AttackEvent {
  id: number;
  userId: string;
  allowedServers: Array<{
    id: number;
    address: string;
    slots: number;
  }>;
  target: string;
  duration: number;
  method: string;
  layer: string;
  port: number;
  ppsLimit: number;
  rateLimit: number;
  requestMethod: string;
  postData: string;
  slotKey: string;
  serverId?: number;
}

interface CancelEvent {
  id: number;
}
