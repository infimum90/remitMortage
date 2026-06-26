const { PrismaClient } = require("@prisma/client") as {
  PrismaClient: new () => unknown;
};

export const prisma = new PrismaClient() as any;
