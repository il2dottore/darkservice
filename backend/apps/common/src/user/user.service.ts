import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UserRepository } from './user.repository';
import { UserDetails } from './dtos/responses/user-details';
import type { User } from '../entities/user.entity';
import { CreateUserDto } from './dtos/requests/create-user.dto';
import { UpdateUserDto } from './dtos/requests/update-user.dto';
import { compact, groupBy, uniqBy } from 'lodash';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getUserDetailsById(id: string) {
    const rows = await this.userRepository.queryUserDetails(id);

    if (!rows.length) {
      // A valid JWT can outlive the user it belongs to (for example after a
      // database reset). Treat that token as invalid instead of returning 500.
      throw new UnauthorizedException('User session is no longer valid');
    }

    const user = rows[0].users;
    Reflect.deleteProperty(user, 'password');

    const userDetails = new UserDetails();
    userDetails.user = user;
    userDetails.roles = uniqBy(
      compact(
        rows.map(({ roles }) =>
          roles
            ? {
                key: roles.key,
                displayName: roles.displayName,
                description: roles.description,
              }
            : null,
        ),
      ),
      'key',
    );
    userDetails.roles_permissions = uniqBy(
      compact(
        rows.map(({ roles_permissions }) =>
          roles_permissions
            ? { permission_id: roles_permissions.permissionKey }
            : null,
        ),
      ),
      'permission_id',
    );
    const planRows = compact(
      rows.map(({ plans, features }) =>
        plans ? { plan: plans, feature: features } : null,
      ),
    );
    const plansById = groupBy(planRows, ({ plan }) => plan.id);
    userDetails.plans = uniqBy(planRows, ({ plan }) => plan.id).map(
      ({ plan }) => ({
        ...plan,
        plan_features: uniqBy(
          compact(plansById[plan.id].map(({ feature }) => feature)),
          'id',
        ),
      }),
    );

    return userDetails;
  }

  async getAllowedServers(userId: string): Promise<any> {
    const featureIds = await this.userRepository.queryUserFeatureIds(userId);
    const response = await fetch(
      `${process.env.ATTACK_SERVICE_URL ?? 'http://127.0.0.1:3001'}/api/v1/networks/allowed-servers`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ featureIds }),
      },
    );
    if (!response.ok)
      throw new Error(`Attack service returned ${response.status}`);
    return response.json();
  }

  async getAllUsersDetails(perPage: number, page: number) {
    const users = await this.getAll(perPage, page);
    const usersDetails = await Promise.all(
      users.map((user) => this.getUserDetailsById(user.id)),
    );

    return usersDetails.filter((user) => user !== null);
  }

  async countAll() {
    const totalUsers = await this.userRepository.countAll();
    return totalUsers;
  }

  async getById(id: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ id: id });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async getAll(perPage: number, page: number): Promise<User[]> {
    const users = await this.userRepository.find(
      {},
      {
        perPage,
        page,
      },
    );
    return users;
  }

  async findOneByUsername(username: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ username: username });
    return user;
  }

  async findOneByEmail(email: string): Promise<User | null> {
    const user = await this.userRepository.findOne({ email: email });
    return user;
  }

  async findOneByGoogleId(googleId: string): Promise<User | null> {
    return this.userRepository.findByOAuth('google', googleId);
  }

  async linkGoogleAccount(
    userId: string,
    googleId: string,
    googleEmail: string,
  ): Promise<User | null> {
    await this.userRepository.linkOAuth(
      userId,
      'google',
      googleId,
      googleEmail,
    );
    return this.getById(userId);
  }

  async getGoogleAccount(userId: string) {
    return this.userRepository.findOAuth(userId, 'google');
  }

  async unlinkGoogleAccount(userId: string) {
    await this.userRepository.unlinkOAuth(userId, 'google');
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const user = await this.userRepository.createWithDefaultAccess({
      ...createUserDto,
      password: await argon2.hash(createUserDto.password),
      emailVerified: createUserDto.emailVerified ?? false,
    });
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User | null> {
    const user = await this.userRepository.updateOne({ id: id }, updateUserDto);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async updatePassword(id: string, password: string) {
    return this.userRepository.updateOne(
      { id },
      { password: await argon2.hash(password) },
    );
  }

  async verifyEmail(id: string) {
    return this.userRepository.updateOne({ id }, { emailVerified: true });
  }

  async delete(id: string): Promise<User | null> {
    const user = await this.userRepository.deleteOne({ id: id });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async assignRole(userId: string, roleKey: string) {
    return await this.userRepository.assignRole(userId, roleKey);
  }

  async removeRole(userId: string, roleKey: string) {
    return await this.userRepository.removeRole(userId, roleKey);
  }

  getPlans(userId: string) {
    return this.userRepository.getPlans(userId);
  }
  addPlan(userId: string, planId: number, expirationDate?: Date) {
    return this.userRepository.assignPaidPlan(userId, planId, expirationDate);
  }
  updatePlan(userId: string, planId: number, expirationDate: Date) {
    return this.userRepository.updatePlan(userId, planId, expirationDate);
  }
  removePlan(userId: string, planId: number) {
    return this.userRepository.removePlan(userId, planId);
  }
}
