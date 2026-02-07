import 'server-only';

type ServerEnv = {
  AUTH_USER: string;
  AUTH_PASS: string;
  ANTHROPIC_API_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

const REQUIRED_SERVER_VARS = [
  'AUTH_USER',
  'AUTH_PASS',
  'ANTHROPIC_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

function loadServerEnv(): ServerEnv {
  const missing = REQUIRED_SERVER_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required server env vars: ${missing.join(', ')}`,
    );
  }

  return {
    AUTH_USER: process.env.AUTH_USER as string,
    AUTH_PASS: process.env.AUTH_PASS as string,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY as string,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  };
}

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (!cachedServerEnv) {
    cachedServerEnv = loadServerEnv();
  }
  return cachedServerEnv;
}

export const serverEnv = getServerEnv();
