import pg from 'pg';

let pool: pg.Pool | undefined;
let schemaReady: Promise<void> | undefined;

export function database(): pg.Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  if (!pool) pool = new pg.Pool({connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10_000});
  return pool;
}

export async function ensureSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = database();
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        name TEXT NOT NULL,
        username_lookup CHAR(64) NOT NULL UNIQUE,
        username_cipher TEXT NOT NULL,
        birth_date_cipher TEXT NOT NULL,
        phone_cipher TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','ADMIN')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ
      );
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash CHAR(64) NOT NULL UNIQUE,
        actor_admin_id UUID REFERENCES users(id) ON DELETE CASCADE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS app_data (
        user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        data_cipher TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        transaction_count INTEGER NOT NULL DEFAULT 0,
        total_expense BIGINT NOT NULL DEFAULT 0,
        total_saving BIGINT NOT NULL DEFAULT 0,
        total_xp INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS auth_attempts (
        attempt_key CHAR(64) PRIMARY KEY,
        failed_count INTEGER NOT NULL DEFAULT 0,
        locked_until TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS admin_audit (
        id UUID PRIMARY KEY,
        actor_admin_id UUID NOT NULL REFERENCES users(id),
        target_user_id UUID NOT NULL REFERENCES users(id),
        action TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  })().catch(error => {schemaReady = undefined; throw error;});
  return schemaReady;
}
