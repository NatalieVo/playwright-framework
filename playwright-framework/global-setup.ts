import * as fs from 'fs';
import * as path from 'path';

// Runs once before every test invocation, regardless of how Playwright was launched (npx playwright
// test, npm scripts, CI) — guarantees allure-results never mixes stale data from a previous run with
// the current one. Wiring this through globalSetup (instead of relying on a "clean" npm script the
// caller has to remember to run first) is what makes the clean-up unconditional.
export default async function globalSetup(): Promise<void> {
  const allureResultsDir = path.resolve(__dirname, 'allure-results');
  fs.rmSync(allureResultsDir, { recursive: true, force: true });
}
