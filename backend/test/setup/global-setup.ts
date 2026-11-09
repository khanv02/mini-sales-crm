import { execSync } from 'node:child_process';
import { prepareTestEnvironment, REPO_ROOT } from '../support/test-env';

export default function globalSetup(): void {
  prepareTestEnvironment();
  execSync('pnpm db:migrate', {
    cwd: REPO_ROOT,
    env: process.env,
    stdio: 'inherit',
  });
}
