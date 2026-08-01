import { faker } from '@faker-js/faker';
import { debugDb as createDebugDb } from './debugDatabase';
import {
  planEntity,
  usersPlansTable,
} from '../apps/common/src/entities/plan.entity';
import { roleEntity } from '../apps/common/src/entities/role.entity';
import { userRoleEntity } from '../apps/common/src/entities/user-role.entity';
import { userEntity } from '../apps/common/src/entities/user.entity';
import { RoleEnum } from '../apps/common/src/role/enums/role.enum';
import { FeatureEnum } from '../apps/common/src/feature/enums/feature.enum';
import {
  permissionEntity,
  rolePermissionEntity,
} from '../apps/common/src/entities/permission.entity';
import { featureEntity } from '../apps/common/src/entities/feature.entity';
import { planFeatureEntity } from '../apps/common/src/entities/plan-feature.entity';
import { PermissionEnum } from '../apps/common/src/permission/enums/permission.enum';
import { keyBy } from 'lodash';

const coreDatabase = process.env.CORE_SERVICE_DB ?? 'core_service_db';
const attackDatabase = process.env.ATTACK_SERVICE_DB ?? 'attack_service_db';
const debugCoreDb = createDebugDb(coreDatabase);
const debugAttackDb = createDebugDb(attackDatabase);

const users = [
  {
    email: 'Deshawn35@hotmail.com',
    firstName: 'Matthew',
    lastName: 'Vandervort',
    username: 'Louis82',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$gfGFI61IPNmxHBGOXX88uQ$npbc4H1r71uHzXFd45PMXv38KhnkKgI7D41/FWs9ro8',
  },
  {
    email: 'Lacey_Terry49@yahoo.com',
    firstName: 'Robyn',
    lastName: 'Effertz',
    username: 'Kristy_Kertzmann62',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$AtYsK/OWReKyz6Ize5F8Vg$p+1g5DMAhwMugEY0TG9/t68DeXmsQdIxNYr70RlC0LU',
  },
  {
    email: 'Salvatore_Thompson64@yahoo.com',
    firstName: 'Olive',
    lastName: 'Buckridge',
    username: 'Murphy.Johnson',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$v5HGHlQ31vbUrKd+JS7K/w$CAdjuTAY61XFeqvpH8qcRwH5k3dyTSz4S1LVF4VPybA',
  },
  {
    email: 'Stephanie59@hotmail.com',
    firstName: 'Milton',
    lastName: 'Keebler',
    username: 'Estevan.Wintheiser',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$W9o9/U3dpB4BKozO28kMXg$SqKpZgZswrGXaeaGnBo52/ewPQRW3krOztkW6PtymN8',
  },
  {
    email: 'Rodney56@yahoo.com',
    firstName: 'Lowell',
    lastName: 'Grimes',
    username: 'Carolyne_Ward32',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$msnEhwH0LX+itbUeE51jRA$g7eHRAsjKaXexV3BvR5+n4l2QK7UQPQZkkpGry8YHmY',
  },
  {
    email: 'Shari98@yahoo.com',
    firstName: 'Reanna',
    lastName: 'Corkery',
    username: 'Marguerite.Lueilwitz',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$Tv1uGd7vjtRMQK3XA4fOIw$p3fI+q2P5xzFXLdflJCz1A91yIQz4wZo3kx9RZMhKik',
  },
  {
    email: 'Delbert_Kris22@gmail.com',
    firstName: 'Cierra',
    lastName: 'Hilpert',
    username: 'Ian.Grimes',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$jLUaYGvCgGP4xosoOVQBCA$Hy9ao7hSaXKe9hsbOUyu7r7jjCtAVhdExOS+hcs9V/Y',
  },
  {
    email: 'Jewel.Beatty@yahoo.com',
    firstName: 'Opal',
    lastName: 'Kunze',
    username: 'Kelley.Heller43',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$W+AB/19bePwdTcSsIdCY7g$U8RtvZxiZnfBkqQTlWlysnIL8yiaoRhUHcInKGNaIH4',
  },
  {
    email: 'Makayla69@hotmail.com',
    firstName: 'Sheila',
    lastName: 'Orn-Parker',
    username: 'Lowell44',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$imWvn8KnIaOXFAxkIqj9TQ$fYq6NDA1S36orqkzi9Tgx8V13+3OFCaooarG46HBveI',
  },
  {
    email: 'Marcos_Farrell57@yahoo.com',
    firstName: 'Duane',
    lastName: 'Herman',
    username: 'Stephany_Cremin66',
    emailVerified: true,
    password:
      '$argon2id$v=19$m=65536,t=3,p=4$WbP4WN82EcpjBXvPYuWehQ$sa3ymADymgvBdKu4td8kU9PODkhS+XARpj99Q4WIxBw',
  },
];

const permissionsSeed = [
  PermissionEnum.TICKET_MANAGE,
  PermissionEnum.TICKET_REPLY,
];

const FREE_PLAN_EXPIRATION_DATE = new Date('2099-12-31T23:59:59.999Z');

function pickPlanDurationDays(planName: string) {
  if (planName === 'Basic') return 30;
  if (planName === 'Plus') return 45;
  if (planName === 'Pro') return 60;
  return 90;
}

async function usersTableSeeder() {
  await debugCoreDb.execute(`TRUNCATE TABLE users RESTART IDENTITY CASCADE;`);
  console.log('[START] Seeding users table...');
  await debugCoreDb.insert(userEntity).values(users);
  console.log('[DONE] Seeding users table');
}

async function rolesTableSeeder() {
  await debugCoreDb.execute(`TRUNCATE TABLE roles RESTART IDENTITY CASCADE;`);
  console.log('[START] Seeding roles table...');
  await debugCoreDb.insert(roleEntity).values([
    {
      key: RoleEnum.USER,
      displayName: RoleEnum.USER,
      description: 'Standard user',
    },
    {
      key: RoleEnum.SUPPORT,
      displayName: RoleEnum.SUPPORT,
      description: 'Support agent',
    },
    {
      key: RoleEnum.MANAGER,
      displayName: RoleEnum.MANAGER,
      description: 'Support manager',
    },
    {
      key: RoleEnum.ADMINISTRATOR,
      displayName: RoleEnum.ADMINISTRATOR,
      description: 'System administrator',
    },
  ]);
  console.log('[DONE] Seeding roles table');
}

async function permissionsTableSeeder() {
  await debugCoreDb.execute(
    `TRUNCATE TABLE permissions RESTART IDENTITY CASCADE;`,
  );
  console.log('[START] Seeding permissions table...');
  await debugCoreDb.insert(permissionEntity).values(
    permissionsSeed.map((permission) => ({
      key: permission,
      displayName: permission,
      description: `Permission: ${permission}`,
    })),
  );
  console.log('[DONE] Seeding permissions table');
}

async function rolesPermissionsTableSeeder() {
  await debugCoreDb.execute(
    `TRUNCATE TABLE roles_permissions RESTART IDENTITY CASCADE;`,
  );
  console.log('[START] Seeding roles_permissions table...');

  const roles = await debugCoreDb.select().from(roleEntity);

  for (const role of roles) {
    let rolePermissions: string[] = [];

    if (role.key === (RoleEnum.SUPPORT as string)) {
      rolePermissions = [PermissionEnum.TICKET_REPLY];
    }

    if (role.key === (RoleEnum.MANAGER as string)) {
      rolePermissions = [
        PermissionEnum.TICKET_REPLY,
        PermissionEnum.TICKET_MANAGE,
      ];
    }

    if (role.key === (RoleEnum.ADMINISTRATOR as string)) {
      rolePermissions = permissionsSeed;
    }

    if (rolePermissions.length > 0) {
      await debugCoreDb.insert(rolePermissionEntity).values(
        rolePermissions.map((permission) => ({
          roleKey: role.key,
          permissionKey: permission,
        })),
      );
    }
  }

  console.log('[DONE] Seeding roles_permissions table');
}

async function usersRolesTableSeeder() {
  await debugCoreDb.execute(
    `TRUNCATE TABLE users_roles RESTART IDENTITY CASCADE;`,
  );
  console.log('[START] Seeding users_roles table...');

  const users = await debugCoreDb.select().from(userEntity);
  const roles = await debugCoreDb.select().from(roleEntity);

  const rolesByKey = keyBy(roles, 'key');
  const userRole = rolesByKey[RoleEnum.USER];
  const supportRole = rolesByKey[RoleEnum.SUPPORT];
  const managerRole = rolesByKey[RoleEnum.MANAGER];
  const adminRole = rolesByKey[RoleEnum.ADMINISTRATOR];

  if (!userRole || !supportRole || !managerRole || !adminRole) {
    throw new Error('Required roles were not seeded correctly');
  }

  const userRoleAssignments = users.map((user, index) => {
    let roleKey = userRole.key;

    if (index === 0) {
      roleKey = adminRole.key;
    } else if (index <= 2) {
      roleKey = managerRole.key;
    } else if (index <= 4) {
      roleKey = supportRole.key;
    } else if (index <= 6) {
      roleKey = userRole.key;
    }

    return {
      userId: user.id,
      roleKey,
    };
  });

  await debugCoreDb.insert(userRoleEntity).values(userRoleAssignments);
  console.log('[DONE] Seeding users_roles table');
}

async function featuresTableSeeder() {
  await debugCoreDb.execute(
    `TRUNCATE TABLE features RESTART IDENTITY CASCADE;`,
  );
  console.log('[START] Seeding features table...');
  await debugCoreDb.insert(featureEntity).values([
    { id: FeatureEnum.PAID_ACCESS, name: 'PAID FEATURES ACCESS' },
    { id: FeatureEnum.API_ACCESS, name: 'API ACCESS' },
    { id: FeatureEnum.VIP_ACCESS, name: 'VIP ACCESS' },
  ]);
  console.log('[DONE] Seeding features table');
}

async function plansTableSeeder() {
  await debugCoreDb.execute(`TRUNCATE TABLE plans RESTART IDENTITY CASCADE;`);
  console.log('[START] Seeding plans table...');
  await debugCoreDb.insert(planEntity).values([
    {
      name: 'Free',
      price: 0,
      days: 36500,
      maxDuration: 60,
      maxConcurrents: 1,
      isCustom: false,
    },
    {
      name: 'Basic',
      price: 5000,
      days: 30,
      maxDuration: 120,
      maxConcurrents: 2,
      isCustom: false,
    },
    {
      name: 'Plus',
      price: 6000,
      days: 45,
      maxDuration: 300,
      maxConcurrents: 3,
      isCustom: false,
    },
    {
      name: 'Pro',
      price: 8000,
      days: 60,
      maxDuration: 300,
      maxConcurrents: 4,
      isCustom: false,
    },
    {
      name: 'Business',
      price: 10000,
      days: 90,
      maxDuration: 600,
      maxConcurrents: 5,
      isCustom: false,
    },
  ]);
  console.log('[DONE] Seeding plans table');
}

async function plansFeaturesTableSeeder() {
  await debugCoreDb.execute(
    `TRUNCATE TABLE plans_features RESTART IDENTITY CASCADE;`,
  );
  console.log('[START] Seeding plans_features table...');

  const plans = await debugCoreDb.select().from(planEntity);
  const features = await debugCoreDb.select().from(featureEntity);
  const featuresById = keyBy(features, 'id');

  const featureAssignments: Record<string, FeatureEnum[]> = {
    Free: [],
    Basic: [FeatureEnum.PAID_ACCESS],
    Plus: [FeatureEnum.PAID_ACCESS],
    Pro: [FeatureEnum.PAID_ACCESS, FeatureEnum.VIP_ACCESS],
    Business: [
      FeatureEnum.PAID_ACCESS,
      FeatureEnum.VIP_ACCESS,
      FeatureEnum.API_ACCESS,
    ],
  };

  const planFeatures = plans.flatMap((plan) =>
    (featureAssignments[plan.name] ?? []).map((featureId) => {
      if (!featuresById[featureId]) {
        throw new Error(`Feature ${featureId} was not seeded correctly`);
      }

      return { planId: plan.id, featureId };
    }),
  );

  if (planFeatures.length > 0) {
    await debugCoreDb.insert(planFeatureEntity).values(planFeatures);
  }

  console.log('[DONE] Seeding plans_features table');
}

async function usersPlansTableSeeder() {
  await debugCoreDb.execute(
    `TRUNCATE TABLE users_plans RESTART IDENTITY CASCADE;`,
  );
  console.log('[START] Seeding users_plans table...');

  const users = await debugCoreDb.select().from(userEntity);
  const plans = await debugCoreDb.select().from(planEntity);
  const plansByName = keyBy(plans, 'name');

  const userPlanAssignments = users.map((user, index) => {
    const plan =
      index === 0
        ? plansByName.Business
        : index <= 2
          ? plansByName.Pro
          : index <= 5
            ? plansByName.Plus
            : index <= 7
              ? plansByName.Basic
              : plansByName.Free;

    if (!plan) {
      throw new Error('Required plans were not seeded correctly');
    }

    return {
      userId: user.id,
      planId: plan.id,
      expirationDate:
        plan.name === 'Free'
          ? FREE_PLAN_EXPIRATION_DATE
          : faker.date.soon({ days: pickPlanDurationDays(plan.name) }),
    };
  });

  await debugCoreDb.insert(usersPlansTable).values(userPlanAssignments);
  console.log('[DONE] Seeding users_plans table');
}

async function main() {
  await usersTableSeeder();

  await rolesTableSeeder();
  await permissionsTableSeeder();
  await rolesPermissionsTableSeeder();
  await usersRolesTableSeeder();

  await featuresTableSeeder();
  await plansTableSeeder();
  await plansFeaturesTableSeeder();
  await usersPlansTableSeeder();

  await debugCoreDb.$client.end();
  await debugAttackDb.$client.end();
}

void main();
