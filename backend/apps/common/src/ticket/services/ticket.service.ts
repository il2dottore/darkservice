import { Injectable } from '@nestjs/common';
import { ConflictError, ForbiddenError, NotFoundError } from '@app/common';
import { CreateReplyDto } from '../dtos/create-reply.dto';
import { CreateTicketDto } from '../dtos/create-ticket.dto';
import { UpdateTicketDto } from '../dtos/update-ticket.dto';
import { TicketRepository } from '../ticket.repository';
import { TicketGateway } from '../ticket.gateway';
import { UserService } from '../../user/user.service';
import { TicketStatusValue } from '../../entities/ticket.entity';
import { PermissionEnum } from '../../permission/enums/permission.enum';

type Actor = {
  id: string;
  permissions: string[];
};

@Injectable()
export class TicketService {
  constructor(
    private readonly repository: TicketRepository,
    private readonly userService: UserService,
    private readonly gateway: TicketGateway,
  ) {}

  async getActor(userId: string): Promise<Actor> {
    const details = await this.userService.getUserDetailsById(userId);
    return {
      id: userId,
      permissions: details.roles_permissions
        .map((permission) => permission.permission_id)
        .filter((permission): permission is string => Boolean(permission)),
    };
  }

  private can(actor: Actor, permission: string) {
    return actor.permissions.includes(permission);
  }
  private async getVisible(id: number, actor: Actor) {
    const ticket = await this.repository.findOne({ id });
    if (!ticket) throw new NotFoundError('Ticket not found');
    if (
      !this.can(actor, PermissionEnum.TICKET_REPLY) &&
      !this.can(actor, PermissionEnum.TICKET_MANAGE) &&
      ticket.senderId !== actor.id
    )
      throw new ForbiddenError('Forbidden');
    return ticket;
  }

  private ensureMutable(status: TicketStatusValue) {
    if (status === 'SOLVED' || status === 'CLOSED') {
      throw new ConflictError('This ticket is no longer mutable');
    }
  }

  getAll(actor: Actor, adminScope = false) {
    if (!adminScope) {
      return this.repository.findVisible(actor.id, false, false);
    }
    if (
      !this.can(actor, PermissionEnum.TICKET_REPLY) &&
      !this.can(actor, PermissionEnum.TICKET_MANAGE)
    ) {
      throw new ForbiddenError('Forbidden');
    }
    return this.repository.findVisible(
      actor.id,
      this.can(actor, PermissionEnum.TICKET_REPLY),
      this.can(actor, PermissionEnum.TICKET_MANAGE),
    );
  }
  async getById(id: number, actor: Actor) {
    const ticket = await this.getVisible(id, actor);
    return { ...ticket, replies: await this.repository.findReplies(id) };
  }
  async create(dto: CreateTicketDto, actorId: string) {
    const ticket = await this.repository.insertOne({
      ...dto,
      senderId: actorId,
    });
    this.gateway.emitUpdated(ticket.id, 'created');
    return ticket;
  }

  async update(id: number, dto: UpdateTicketDto, actor: Actor) {
    const current = await this.getVisible(id, actor);
    this.ensureMutable(current.status);
    if (
      !this.can(actor, PermissionEnum.TICKET_MANAGE) &&
      current.senderId !== actor.id
    ) {
      throw new ForbiddenError('Forbidden');
    }
    const ticket = await this.repository.updateOne(
      { id },
      { ...dto, updatedAt: new Date() },
    );
    if (!ticket) throw new NotFoundError('Ticket not found');
    this.gateway.emitUpdated(ticket.id, 'changed');
    return ticket;
  }

  async remove(id: number, actor: Actor) {
    const current = await this.getVisible(id, actor);
    this.ensureMutable(current.status);
    if (
      !this.can(actor, PermissionEnum.TICKET_MANAGE) &&
      current.senderId !== actor.id
    ) {
      throw new ForbiddenError('Forbidden');
    }
    const ticket = await this.repository.deleteOne({ id });
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }

  async claim(id: number, actor: Actor) {
    if (
      !this.can(actor, PermissionEnum.TICKET_REPLY) &&
      !this.can(actor, PermissionEnum.TICKET_MANAGE)
    )
      throw new ForbiddenError('Forbidden');
    const current = await this.getVisible(id, actor);
    this.ensureMutable(current.status);
    const ticket = await this.repository.claim(id, actor.id);
    if (!ticket)
      throw new ConflictError('Ticket is already claimed or cannot be claimed');
    this.gateway.emitUpdated(ticket.id, 'changed');
    return ticket;
  }

  async release(id: number, actor: Actor) {
    if (
      !this.can(actor, PermissionEnum.TICKET_REPLY) &&
      !this.can(actor, PermissionEnum.TICKET_MANAGE)
    )
      throw new ForbiddenError('Forbidden');
    const current = await this.getVisible(id, actor);
    this.ensureMutable(current.status);
    const ticket = await this.repository.release(
      id,
      actor.id,
      this.can(actor, PermissionEnum.TICKET_MANAGE),
    );
    if (!ticket)
      throw new ForbiddenError(
        'Only the assigned support can release this ticket',
      );
    this.gateway.emitUpdated(ticket.id, 'changed');
    return ticket;
  }

  async updateStatus(id: number, status: TicketStatusValue, actor: Actor) {
    const ticket = await this.getVisible(id, actor);
    this.ensureMutable(ticket.status);
    const manager = this.can(actor, PermissionEnum.TICKET_MANAGE);
    if (
      !manager &&
      (!this.can(actor, PermissionEnum.TICKET_REPLY) ||
        ticket.assignedSupportId !== actor.id)
    )
      throw new ForbiddenError('Forbidden');
    const updated = await this.repository.updateOne(
      { id },
      { status, updatedAt: new Date() },
    );
    if (!updated) throw new NotFoundError('Ticket not found');
    this.gateway.emitUpdated(updated.id, 'changed');
    return updated;
  }

  async addReply(id: number, dto: CreateReplyDto, actor: Actor) {
    const ticket = await this.getVisible(id, actor);
    this.ensureMutable(ticket.status);
    const isOwner = ticket.senderId === actor.id;
    const isAssignedSupport =
      this.can(actor, PermissionEnum.TICKET_REPLY) &&
      ticket.assignedSupportId === actor.id;
    if (
      !isOwner &&
      !this.can(actor, PermissionEnum.TICKET_MANAGE) &&
      !isAssignedSupport
    )
      throw new ForbiddenError('Forbidden');
    const reply = await this.repository.addReply(id, actor.id, dto.content);
    this.gateway.emitUpdated(id, 'replied');
    return reply;
  }
}
