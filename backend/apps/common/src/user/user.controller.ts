import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiParam,
} from '@nestjs/swagger';
import { CreateUserDto } from './dtos/requests/create-user.dto';
import { UpdateUserDto } from './dtos/requests/update-user.dto';
import { DeleteUserDto } from './dtos/requests/delete-user.dto';
import { UserDetails, UserResponse } from './dtos/responses/user-details';
import { Role } from '@app/auth/decorators/role.decorator';
import { ResourceOwnerGuard } from '@app/auth/guards/resource-owner.guard';
import { UserService } from './user.service';
import { JwtAuthGuard } from '@app/auth';

@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserController {
  constructor(private readonly userService: UserService) {}

  @ApiOperation({ summary: 'Get servers available to a user' })
  @ApiParam({ name: 'id', description: 'User ID', format: 'uuid' })
  @ApiOkResponse({
    description: 'Servers available through the user plans',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'EU server 1' },
          address: { type: 'string', example: '192.0.2.10' },
          slots: { type: 'integer', example: 10 },
        },
      },
    },
  })
  @Get(':id/allowed-servers')
  getAllowedServers(@Param('id') userId: string): Promise<any> {
    return this.userService.getAllowedServers(userId);
  }

  @ApiOperation({ summary: 'Get all users' })
  @ApiOkResponse({ type: UserResponse, isArray: true })
  @Get()
  getAllUsers(
    @Query('perPage') perPage: number = 5,
    @Query('page') page: number = 1,
  ) {
    return this.userService.getAll(+perPage, +page);
  }

  @ApiOperation({ summary: 'Get user details data by ID' })
  @ApiOkResponse({ type: UserDetails })
  @Role('ADMINISTRATOR')
  @UseGuards(ResourceOwnerGuard)
  @Get(':id/details')
  getUserDetailsById(@Param('id') id: string) {
    return this.userService.getUserDetailsById(id);
  }

  @ApiOperation({ summary: 'Get all user details data' })
  @ApiOkResponse({ type: UserDetails, isArray: true })
  @Get('details')
  getUserDetails(
    @Query('perPage') perPage: number = 5,
    @Query('page') page: number = 1,
  ) {
    return this.userService.getAllUsersDetails(+perPage, +page);
  }

  @ApiOperation({ summary: 'Get total users count' })
  @ApiOkResponse({ description: 'Total users count' })
  @Get('count')
  async countAllUsers() {
    const totalUsers = await this.userService.countAll();
    return { count: totalUsers };
  }

  @ApiOperation({ summary: 'Get user by ID' })
  @ApiOkResponse({ type: UserResponse })
  @Get(':id')
  @Role('ADMINISTRATOR')
  @UseGuards(ResourceOwnerGuard)
  getUserById(@Param('id') id: string) {
    return this.userService.getById(id);
  }

  @ApiOperation({ summary: 'Create user' })
  @ApiCreatedResponse({ type: UserResponse })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @ApiOperation({ summary: 'Update user' })
  @ApiOkResponse({ type: UserResponse })
  @Put(':id')
  @Role('ADMINISTRATOR')
  @UseGuards(ResourceOwnerGuard)
  update(@Body() updateUserDto: UpdateUserDto, @Param('id') id: string) {
    return this.userService.update(id, updateUserDto);
  }

  @ApiOperation({ summary: 'Delete user' })
  @ApiOkResponse({ type: UserResponse })
  @Delete(':id')
  @Role('ADMINISTRATOR')
  @UseGuards(ResourceOwnerGuard)
  delete(@Param() deleteUserDto: DeleteUserDto) {
    return this.userService.delete(deleteUserDto.id);
  }

  @ApiOperation({ summary: 'Assign role to user' })
  @Post(':userId/roles/:roleKey')
  assignRole(
    @Param('userId') userId: string,
    @Param('roleKey') roleKey: string,
  ) {
    return this.userService.assignRole(userId, roleKey);
  }

  @ApiOperation({ summary: 'Remove role from user' })
  @Delete(':userId/roles/:roleKey')
  removeRole(
    @Param('userId') userId: string,
    @Param('roleKey') roleKey: string,
  ) {
    return this.userService.removeRole(userId, roleKey);
  }

  @ApiOperation({ summary: 'List plans of a user' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @Get(':id/plans')
  getPlans(@Param('id') id: string) {
    return this.userService.getPlans(id);
  }

  @ApiOperation({ summary: 'Add or replace a user plan' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @Post(':id/plans')
  addPlan(
    @Param('id') id: string,
    @Body() body: { planId: number; expirationDate?: string },
  ) {
    return this.userService.addPlan(
      id,
      body.planId,
      body.expirationDate ? new Date(body.expirationDate) : undefined,
    );
  }

  @ApiOperation({ summary: 'Update a user plan' })
  @Put(':id/plans/:planId')
  updatePlan(
    @Param('id') id: string,
    @Param('planId') planId: string,
    @Body() body: { expirationDate: string },
  ) {
    return this.userService.updatePlan(
      id,
      Number(planId),
      new Date(body.expirationDate),
    );
  }

  @ApiOperation({ summary: 'Remove a user plan' })
  @Delete(':id/plans/:planId')
  removePlan(@Param('id') id: string, @Param('planId') planId: string) {
    return this.userService.removePlan(id, Number(planId));
  }
}
