import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '@app/auth';
import { UseGuards } from '@nestjs/common';
import { CreateReplyDto } from './dtos/create-reply.dto';
import { CreateTicketDto } from './dtos/create-ticket.dto';
import { UpdateTicketDto } from './dtos/update-ticket.dto';
import { UpdateStatusDto } from './dtos/update-status.dto';
import { TicketService } from './services/ticket.service';

type UserPermissions = {
  user: {
    sub: string;
    details?: { roles_permissions?: { permission_id?: string }[] };
  };
};

@Controller('tickets')
@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

  @Get()
  @ApiOperation({ summary: 'List tickets visible to the current user' })
  getAll(
    @Query('scope') scope: string | undefined,
    @Req() request: UserPermissions,
  ) {
    return this.ticketService
      .getActor(request.user.sub)
      .then((actor) => this.ticketService.getAll(actor, scope === 'admin'));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a ticket and its replies' })
  getById(@Param('id') id: string, @Req() request: UserPermissions) {
    return this.ticketService
      .getActor(request.user.sub)
      .then((actor) => this.ticketService.getById(Number(id), actor));
  }

  @Post()
  @ApiOperation({ summary: 'Create a support ticket' })
  create(@Body() dto: CreateTicketDto, @Req() request: UserPermissions) {
    return this.ticketService.create(dto, request.user.sub);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update a ticket (manager only)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTicketDto,
    @Req() request: UserPermissions,
  ) {
    return this.ticketService
      .getActor(request.user.sub)
      .then((actor) => this.ticketService.update(Number(id), dto, actor));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a ticket (manager only)' })
  delete(@Param('id') id: string, @Req() request: UserPermissions) {
    return this.ticketService
      .getActor(request.user.sub)
      .then((actor) => this.ticketService.remove(Number(id), actor));
  }

  @Post(':id/claim')
  @ApiOperation({ summary: 'Claim an unassigned ticket' })
  claim(@Param('id') id: string, @Req() request: UserPermissions) {
    return this.ticketService
      .getActor(request.user.sub)
      .then((actor) => this.ticketService.claim(Number(id), actor));
  }

  @Post(':id/release')
  @ApiOperation({ summary: 'Release an assigned ticket' })
  release(@Param('id') id: string, @Req() request: UserPermissions) {
    return this.ticketService
      .getActor(request.user.sub)
      .then((actor) => this.ticketService.release(Number(id), actor));
  }

  @Post(':id/replies')
  @ApiOperation({ summary: 'Reply to a claimed ticket' })
  reply(
    @Param('id') id: string,
    @Body() dto: CreateReplyDto,
    @Req() request: UserPermissions,
  ) {
    return this.ticketService
      .getActor(request.user.sub)
      .then((actor) => this.ticketService.addReply(Number(id), dto, actor));
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Change ticket status' })
  status(
    @Param('id') id: string,
    @Body() dto: UpdateStatusDto,
    @Req() request: UserPermissions,
  ) {
    return this.ticketService
      .getActor(request.user.sub)
      .then((actor) =>
        this.ticketService.updateStatus(Number(id), dto.status, actor),
      );
  }
}
