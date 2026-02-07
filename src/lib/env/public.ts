type PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string;
};

const REQUIRED_PUBLIC_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

function loadPublicEnv(): PublicEnv {
  const missing = REQUIRED_PUBLIC_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required public env vars: ${missing.join(', ')}`,
    );
  }

  return {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  };
}

let cachedPublicEnv: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (!cachedPublicEnv) {
    cachedPublicEnv = loadPublicEnv();
  }
  return cachedPublicEnv;
}

export const publicEnv = getPublicEnv();
