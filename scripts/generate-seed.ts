import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
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

function generateUsersSql(users: SeedUser[]): string {
  if (users.length === 0) return '';

  const defaultPassword = process.env.DEFAULT_PASSWORD;
  if (!defaultPassword) {
    throw new Error('DEFAULT_PASSWORD environment variable is not defined in .env.local');
  }
  const password = defaultPassword;

  let sql = '';

  for (const user of users) {
    const userEmail = escapeSql(user.email);
    const userPassword = escapeSql(user.password || password);
    const timezone = escapeSql(user.timezone || 'America/New_York');
    const emailNotificationsEnabled = user.email_notifications_enabled ?? false;
    const smsNotificationsEnabled = user.sms_notifications_enabled ?? false;
    const notificationStartHour = user.notification_start_hour ?? 9;
    const notificationEndHour = user.notification_end_hour ?? 17;
    const timeFormat = escapeSql(user.time_format || '12h');
    const notificationFrequency = escapeSql(user.notification_frequency || 'daily');
    const dailyNotificationHour = user.daily_notification_hour ?? 9;
    const trackedStocks = user.tracked_stocks || [];

    // 1. Insert into auth.users
    sql += `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '${userEmail}') THEN
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
      gen_random_uuid(),
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
`;

    // 2. Insert into auth.identities
    sql += `
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
  id,
  id,
  format('{"sub":"%s","email":"%s"}', id, email)::jsonb,
  'email',
  id::text,
  now(),
  now(),
  now()
FROM auth.users
WHERE email = '${userEmail}'
AND NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE provider_id = auth.users.id::text
);
`;

    // 3. Insert into public.users
    sql += `
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
)
SELECT
  id,
  email,
  '${timezone}',
  ${emailNotificationsEnabled},
  ${smsNotificationsEnabled},
  ${notificationStartHour},
  ${notificationEndHour},
  '${timeFormat}',
  '${notificationFrequency}',
  ${dailyNotificationHour}
FROM auth.users
WHERE email = '${userEmail}'
ON CONFLICT (id) DO UPDATE SET
  email_notifications_enabled = EXCLUDED.email_notifications_enabled,
  sms_notifications_enabled = EXCLUDED.sms_notifications_enabled,
  notification_start_hour = EXCLUDED.notification_start_hour,
  notification_end_hour = EXCLUDED.notification_end_hour,
  notification_frequency = EXCLUDED.notification_frequency,
  daily_notification_hour = EXCLUDED.daily_notification_hour;
`;

    // 4. Insert tracked stocks
    if (trackedStocks.length > 0) {
      const stocksValues = trackedStocks
        .map(symbol => `'${escapeSql(symbol)}'`)
        .join(', ');
        
      sql += `
INSERT INTO public.user_stocks (user_id, symbol)
SELECT
  id,
  s.symbol
FROM auth.users u
CROSS JOIN (
  SELECT symbol FROM public.stocks WHERE symbol IN (${stocksValues})
) s
WHERE u.email = '${userEmail}'
ON CONFLICT (user_id, symbol) DO NOTHING;
`;
    }
  }

  return sql;
}

async function main() {
  console.log('Generating supabase/seed.sql...');

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
      console.warn(`Failed to read ${USERS_FILE}, skipping users generation.`);
    }
  }

  // 3. Generate SQL
  const stocksSql = generateStocksSql(stocks);
  const usersSql = generateUsersSql(users);

  const fullSql = `/*
  Auto-generated seed file. 
  Generated by scripts/generate-seed.ts
  Do not edit manually.
*/

-- 1. Stocks
${stocksSql}

-- 2. Users
${usersSql}
`;

  // 4. Write File
  fs.writeFileSync(SEED_FILE, fullSql);
  
  console.log(`✅ seed.sql generated at ${SEED_FILE}`);
  console.log(`   - ${stocks.length} stocks`);
  console.log(`   - ${users.length} users`);
}

main().catch(console.error);
