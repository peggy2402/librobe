import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PrismaService } from '../../src/modules/prisma/prisma.service.js';

/** Provision only a newly generated schema; never push to the supplied schema. */
export async function createPostgresTestDatabase(databaseUrl: string) {
  const schema = `borrow_limit_test_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(databaseUrl);
  url.searchParams.set('schema', schema);
  url.searchParams.set('connection_limit', '8');
  const isolatedUrl = url.toString();
  const admin = new PrismaService({ datasourceUrl: databaseUrl });
  const prisma = new PrismaService({ datasourceUrl: isolatedUrl });

  async function dispose() {
    await prisma.$disconnect();
    try {
      // The identifier is generated here, and checked again before destructive DDL.
      if (!/^borrow_limit_test_[a-f0-9]{32}$/.test(schema)) {
        throw new Error('Invalid test schema name');
      }
      await admin.$executeRawUnsafe(
        `DROP SCHEMA IF EXISTS "${schema}" CASCADE`,
      );
    } finally {
      await admin.$disconnect();
    }
  }

  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    await promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(
          new URL('../../node_modules/prisma/build/index.js', import.meta.url),
        ),
        'db',
        'push',
        '--skip-generate',
        '--schema',
        fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url)),
      ],
      {
        env: {
          ...process.env,
          DATABASE_URL: isolatedUrl,
          DIRECT_URL: isolatedUrl,
        },
        timeout: 45_000,
        windowsHide: true,
      },
    );
    await prisma.$connect();
    return { prisma, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}
