import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { CreateAttackDto } from './dtos/create-attack.dto';
import { UpdateAttackDto } from './dtos/update-attack.dto';
import { AttackService } from './attack.service';
import { JwtAuthGuard, Role, RolesGuard } from '@app/auth';

@Controller('attacks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AttackController {
  constructor(private readonly attackService: AttackService) {}

  @ApiOperation({ summary: 'Get all attacks' })
  @Get()
  getAll(@Req() request: { user: { sub: string } }) {
    return this.attackService.getAll(request.user.sub);
  }

  @ApiOperation({ summary: 'Get dashboard attack and server statistics' })
  @Get('statistics')
  getStatistics() {
    return this.attackService.getStatistics();
  }

  @ApiOperation({ summary: 'Clear completed attack history' })
  @Delete('history')
  @Role('ADMINISTRATOR')
  clearHistory() {
    return this.attackService.clearHistory();
  }

  @ApiOperation({ summary: 'Get attack by ID' })
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.attackService.getById(Number(id));
  }

  @ApiOperation({ summary: 'Create attack' })
  @Post()
  async create(
    @Req()
    request: { user: { sub: string }; headers: { authorization?: string } },
    @Body() createAttackDto: CreateAttackDto,
  ) {
    return this.attackService.create(
      { ...createAttackDto, userId: request.user.sub },
      request.headers.authorization ?? '',
    );
  }

  @ApiOperation({ summary: 'Update attack' })
  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateAttackDto: UpdateAttackDto,
  ) {
    return this.attackService.update(Number(id), updateAttackDto);
  }

  @ApiOperation({ summary: 'Delete attack' })
  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.attackService.delete(Number(id));
  }
}
