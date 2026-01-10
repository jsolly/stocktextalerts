import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { Stock } from '../src/lib/stocks';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Load .env.local
dotenv.config({ path: path.join(projectRoot, '.env.local') });

const STOCKS_FILE = path.join(__dirname, 'us-stocks.json');
const USERS_FILE = path.join(__dirname, 'users.json');
const SEED_FILE = path.join(projectRoot, 'supabase', 'seed.sql');

interface SeedUser {
  email: string;
  password?: string;
  timezone?: string;
  email_notifications_enabled?: boolean;
  sms_notifications_enabled?: boolean;
  notification_start_hour?: number;
  notification_end_hour?: number;
  time_format?: string;
  notification_frequency?: string;
  daily_notification_hour?: number;
  tracked_stocks?: string[];
}

function escapeSql(str: string): string {
  if (typeof str !== 'string') return str;
  return str.replace(/'/g, "''");
}

function generateStocksSql(stocks: Stock[]): string {
  if (stocks.length === 0) return '';
  
  const values = stocks
    .map(
      (s) =>
        `('${escapeSql(s.symbol)}', '${escapeSql(s.name)}', '${escapeSql(s.exchange)}')`
    )
    .join(',\n  ');

  return `
INSERT INTO public.stocks (symbol, name, exchange)
VALUES
  ${values}
ON CONFLICT (symbol) DO NOTHING;
`;
}

async function listAllAuthUsers(supabase: SupabaseClient) {
  const perPage = 1000;
  const maxPages = 100;
  let page = 1;
  const users: User[] = [];

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const batch = data.users ?? [];
    users.push(...batch);

    if (batch.length < perPage) break;
    
    page += 1;
    if (page > maxPages) {
      throw new Error(`listAllAuthUsers: Maximum page limit (${maxPages}) reached. This may indicate API misbehavior or unexpectedly large user count. Accumulated ${users.length} users before limit was hit.`);
    }
  }

  return users;
}

async function generateUsersSql(
  users: SeedUser[],
  supabase: SupabaseClient,
): Promise<string> {
  if (users.length === 0) return '';

  const defaultPassword = process.env.DEFAULT_PASSWORD;
  if (!defaultPassword) {
    throw new Error('DEFAULT_PASSWORD environment variable is not defined in .env.local');
  }

  const existingUsers = await listAllAuthUsers(supabase);
  const existingUserIdByEmail = new Map(
    existingUsers
      .map((u) => [u.email?.toLowerCase(), u.id] as const)
      .filter(([email]) => Boolean(email)),
  );

  let sql = '';

  for (const user of users) {
    const userEmailRaw = user.email.trim();
    const userEmailLookup = userEmailRaw.toLowerCase();
    const userEmail = escapeSql(userEmailRaw);
    const userPassword = escapeSql(user.password || defaultPassword);
    const timezone = escapeSql(user.timezone || 'America/New_York');
    const emailNotificationsEnabled = user.email_notifications_enabled ?? false;
    const smsNotificationsEnabled = user.sms_notifications_enabled ?? false;
    const notificationStartHour = user.notification_start_hour ?? 9;
    const notificationEndHour = user.notification_end_hour ?? 17;
    const timeFormat = escapeSql(user.time_format || '12h');
    const notificationFrequency = escapeSql(user.notification_frequency || 'daily');
    const dailyNotificationHour = user.daily_notification_hour ?? 9;
    const trackedStocks = user.tracked_stocks || [];

    // If user exists, use their ID. If not, generate a new UUID for the seed file.
    // We do NOT create the user here. The seed file will handle creation.
    const userId = existingUserIdByEmail.get(userEmailLookup) || crypto.randomUUID();

    // Generate SQL for public.users and user_stocks (using the user ID from Admin API)
    sql += `-- User: ${userEmail} (ID: ${userId})\n`;

    // Add auth.users insert for database reset capability
    sql += `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = '${userId}') THEN
    INSERT INTO auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      recovery_sent_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      '${userId}',
      'authenticated',
      'authenticated',
      '${userEmail}',
      crypt('${userPassword}', gen_salt('bf')),
      now(),
      now(),
      now(),
      '{"provider":"email","providers":["email"]}',
      '{}',
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  END IF;
END $$;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
)
SELECT
  gen_random_uuid(),
  '${userId}',
  format('{"sub":"%s","email":"%s"}', '${userId}', '${userEmail}')::jsonb,
  'email',
  '${userId}',
  now(),
  now(),
  now()
WHERE NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = '${userId}'
);
`;

    sql += generatePublicUserInsertSql(
      userId,
      userEmail,
      timezone,
      emailNotificationsEnabled,
      smsNotificationsEnabled,
      notificationStartHour,
      notificationEndHour,
      timeFormat,
      notificationFrequency,
      dailyNotificationHour,
      trackedStocks,
    );
  }

  return sql;
}

function generatePublicUserInsertSql(
  userId: string,
  email: string,
  timezone: string,
  emailNotificationsEnabled: boolean,
  smsNotificationsEnabled: boolean,
  notificationStartHour: number,
  notificationEndHour: number,
  timeFormat: string,
  notificationFrequency: string,
  dailyNotificationHour: number,
  trackedStocks: string[],
): string {
  let sql = `
INSERT INTO public.users (
  id,
  email,
  timezone,
  email_notifications_enabled,
  sms_notifications_enabled,
  notification_start_hour,
  notification_end_hour,
  time_format,
  notification_frequency,
  daily_notification_hour
) VALUES (
  '${userId}',
  '${email}',
  '${timezone}',
  ${emailNotificationsEnabled},
  ${smsNotificationsEnabled},
  ${notificationStartHour},
  ${notificationEndHour},
  '${timeFormat}',
  '${notificationFrequency}',
  ${dailyNotificationHour}
)
ON CONFLICT (id) DO UPDATE SET
  timezone = EXCLUDED.timezone,
  time_format = EXCLUDED.time_format,
  email_notifications_enabled = EXCLUDED.email_notifications_enabled,
  sms_notifications_enabled = EXCLUDED.sms_notifications_enabled,
  notification_start_hour = EXCLUDED.notification_start_hour,
  notification_end_hour = EXCLUDED.notification_end_hour,
  notification_frequency = EXCLUDED.notification_frequency,
  daily_notification_hour = EXCLUDED.daily_notification_hour;
`;

  if (trackedStocks.length > 0) {
    const stocksValues = trackedStocks
      .map(symbol => `'${escapeSql(symbol)}'`)
      .join(', ');
      
    sql += `
INSERT INTO public.user_stocks (user_id, symbol)
SELECT
  '${userId}'::uuid,
  s.symbol
FROM (
  SELECT symbol FROM public.stocks WHERE symbol IN (${stocksValues})
) s
ON CONFLICT (user_id, symbol) DO NOTHING;
`;
  }

  return sql;
}

async function main() {
  console.log('Generating supabase/seed.sql...');

  // Check for required environment variables
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
      'Missing required environment variables: PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local'
    );
  }

  // Create Supabase admin client
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 1. Read Stocks Data
  let stocksData;
  try {
    stocksData = JSON.parse(fs.readFileSync(STOCKS_FILE, 'utf-8'));
  } catch (error) {
    throw new Error(`Failed to read ${STOCKS_FILE}: ${error instanceof Error ? error.message : error}`);
  }

  const stocks = stocksData.data || [];

  // 2. Read Users Data
  let users: SeedUser[] = [];
  if (fs.existsSync(USERS_FILE)) {
    try {
      users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch (error) {
      console.warn(`Failed to parse ${USERS_FILE}: ${error instanceof Error ? error.message : error}`);
      console.warn('Skipping users generation due to invalid JSON.');
    }
  }

  // 3. Generate SQL
  const stocksSql = generateStocksSql(stocks);
  const usersSql = await generateUsersSql(users, supabase);

  const fullSql = `/*
  Auto-generated seed file. 
  Generated by scripts/generate-seed.ts
  Do not edit manually.
*/

-- 1. Stocks
${stocksSql}

-- 2. Users (auth users created via Admin API, only public.users inserts here)
${usersSql}
`;

  // 4. Write File
  fs.writeFileSync(SEED_FILE, fullSql);
  
  console.log(`✅ seed.sql generated at ${SEED_FILE}`);
  console.log(`   - ${stocks.length} stocks`);
  console.log(`   - ${users.length} users (auth users created via Admin API)`);
}

main().catch(console.error);
