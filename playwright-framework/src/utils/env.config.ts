import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function getEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  BASE_URL: getEnv('BASE_URL', 'http://localhost'),
  USERNAME: getEnv('APP_USERNAME', 'u1'),
  PASSWORD: getEnv('APP_PASSWORD', '111111Aa'),
  ENV: getEnv('ENV', 'dev'),
  ALLURE_RESULTS: getEnv('ALLURE_RESULTS', 'false') === 'true',
} as const;

export type EnvConfig = typeof env;
