import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/personal_ai_assistant?schema=public";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;

    super({
      datasources: {
        db: {
          url: databaseUrl
        }
      }
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
