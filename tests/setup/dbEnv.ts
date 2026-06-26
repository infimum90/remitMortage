import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

export const setupTestDB = async () => {
  // Ensure the database is up to date before tests start
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
};

export const teardownTestDB = async () => {
  // Clean all tables (PostgreSQL specific) to maintain test isolation
  const tablenames = await prisma.$queryRaw<
    Array<{ tablename: string }>
  >`SELECT tablename FROM pg_tables WHERE schemaname='public'`;

  const tables = tablenames
    .map(({ tablename }) => tablename)
    .filter((name) => name !== '_prisma_migrations')
    .map((name) => `"public"."${name}"`)
    .join(', ');

  try {
    if (tables.length > 0) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    }
  } catch (error) {
    console.error('Error cleaning up database', error);
  }
};

export const disconnectTestDB = async () => {
  await prisma.$disconnect();
};

export default prisma;
