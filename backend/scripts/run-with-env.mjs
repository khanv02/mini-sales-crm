#!/usr/bin/env node
// Load the nearest `.env` (walking up from the current directory), then run a
// command with those variables. Used by workspace packages whose tooling
// (Prisma CLI, seed scripts) runs from a subdirectory while the canonical
// `.env` lives at the repository root.
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { config } from 'dotenv';

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('usage: node scripts/run-with-env.mjs <command> [...args]');
  process.exit(2);
}

let current = resolve(process.cwd());
for (;;) {
  const candidate = join(current, '.env');
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
  const parent = dirname(current);
  if (parent === current) {
    break;
  }
  current = parent;
}

const result = spawnSync(command, args, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
