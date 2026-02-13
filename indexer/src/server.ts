import http from 'node:http';
import { z } from 'zod';
import { LobbyCache } from './cache.js';
import { fetchSeedLobbies } from './solana.js';
import type { IndexerLobbyPayload } from './types.js';

const envSchema = z.object({
  INDEXER_PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  INDEXER_RPC_URL: z.string().url().default('https://api.devnet.solana.com'),
  INDEXER_PROGRAM_ID: z.string().min(32).default('11111111111111111111111111111111')
});

async function bootstrap(): Promise<void> {
  const env = envSchema.parse(process.env);
  const cache = new LobbyCache(60_000);

  try {
    const seed = await fetchSeedLobbies(env.INDEXER_RPC_URL, env.INDEXER_PROGRAM_ID);
    seed.forEach((entry) => cache.upsert(entry));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'unknown seed error';
    const fallback: IndexerLobbyPayload = {
      publicKey: '4uQeVj5tqViQh7yWWGStvkEG1Zmhx6uasJtWCJziofM',
      activeUsers: 1,
      recentRollAverage: 3.5
    };
    cache.upsert(fallback);
    process.stderr.write(`seed-warning: ${message}\n`);
  }

  const server = http.createServer((request, response) => {
    if (request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: true, lobbies: cache.list().length }));
      return;
    }

    if (request.url === '/lobbies') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(cache.list()));
      return;
    }

    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });

  server.listen(env.INDEXER_PORT, () => {
    process.stdout.write(`indexer listening on :${env.INDEXER_PORT}\n`);
  });
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown fatal error';
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
