/* =============
Domains and Extensions
============= */

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

/* =============
Timezones
============= */

CREATE TABLE IF NOT EXISTS timezones (
  value TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  display_order SMALLINT NOT NULL CHECK (display_order >= 0),
  active BOOLEAN DEFAULT true NOT NULL
);

INSERT INTO timezones (value, label, display_order, active) VALUES
  ('America/New_York', 'Eastern Time (ET)', 1, true),
  ('America/Detroit', 'Eastern Time - Detroit (ET)', 2, true),
  ('America/Kentucky/Louisville', 'Eastern Time - Louisville, KY (ET)', 3, true),
  ('America/Kentucky/Monticello', 'Eastern Time - Monticello, KY (ET)', 4, true),
  ('America/Indiana/Indianapolis', 'Eastern Time - Indianapolis (ET)', 5, true),
  ('America/Indiana/Vincennes', 'Eastern Time - Vincennes, IN (ET)', 6, true),
  ('America/Indiana/Winamac', 'Eastern Time - Winamac, IN (ET)', 7, true),
  ('America/Indiana/Marengo', 'Eastern Time - Marengo, IN (ET)', 8, true),
  ('America/Indiana/Petersburg', 'Eastern Time - Petersburg, IN (ET)', 9, true),
  ('America/Indiana/Vevay', 'Eastern Time - Vevay, IN (ET)', 10, true),
  ('America/Chicago', 'Central Time (CT)', 11, true),
  ('America/Indiana/Tell_City', 'Central Time - Tell City, IN (CT)', 12, true),
  ('America/Indiana/Knox', 'Central Time - Knox, IN (CT)', 13, true),
  ('America/Menominee', 'Central Time - Menominee, MI (CT)', 14, true),
  ('America/North_Dakota/Center', 'Central Time - Center, ND (CT)', 15, true),
  ('America/North_Dakota/New_Salem', 'Central Time - New Salem, ND (CT)', 16, true),
  ('America/North_Dakota/Beulah', 'Central Time - Beulah, ND (CT)', 17, true),
  ('America/Denver', 'Mountain Time (MT)', 18, true),
  ('America/Boise', 'Mountain Time - Boise (MT)', 19, true),
  ('America/Phoenix', 'Mountain Time - Arizona (MT)', 20, true),
  ('America/Los_Angeles', 'Pacific Time (PT)', 21, true),
  ('America/Anchorage', 'Alaska Time (AKT)', 22, true),
  ('America/Juneau', 'Alaska Time - Juneau (AKT)', 23, true),
  ('America/Sitka', 'Alaska Time - Sitka (AKT)', 24, true),
  ('America/Metlakatla', 'Alaska Time - Metlakatla (AKT)', 25, true),
  ('America/Yakutat', 'Alaska Time - Yakutat (AKT)', 26, true),
  ('America/Nome', 'Alaska Time - Nome (AKT)', 27, true),
  ('America/Adak', 'Hawaii-Aleutian Time (HST)', 28, true),
  ('Pacific/Honolulu', 'Hawaii Time (HST)', 29, true)
ON CONFLICT (value) DO UPDATE SET
  label = EXCLUDED.label,
  display_order = EXCLUDED.display_order,
  active = EXCLUDED.active;

/* =============
Users
============= */

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone_country_code VARCHAR(5),
  phone_number VARCHAR(15),
  full_phone VARCHAR(20) GENERATED ALWAYS AS (
    CASE 
      WHEN phone_country_code IS NOT NULL AND phone_number IS NOT NULL 
      THEN phone_country_code || phone_number
      ELSE NULL
    END
  ) STORED,
  phone_verified BOOLEAN DEFAULT false NOT NULL,
  sms_opted_out BOOLEAN DEFAULT false NOT NULL,
  timezone TEXT REFERENCES timezones(value),
  time_format VARCHAR(3) DEFAULT '12h' NOT NULL CHECK (time_format IN ('12h', '24h')),
  notification_start_hour INTEGER DEFAULT 9 NOT NULL CHECK (notification_start_hour >= 0 AND notification_start_hour <= 23),
  notification_end_hour INTEGER DEFAULT 17 NOT NULL CHECK (notification_end_hour >= 0 AND notification_end_hour <= 23),
  email_notifications_enabled BOOLEAN DEFAULT false NOT NULL,
  sms_notifications_enabled BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT notification_hours_order CHECK (notification_start_hour <= notification_end_hour),
  CONSTRAINT phone_country_code_format CHECK (phone_country_code ~ '^\+[0-9]{1,4}$'),
  CONSTRAINT phone_number_format CHECK (phone_number ~ '^[0-9]{10,14}$'),
  CONSTRAINT unique_phone UNIQUE (phone_country_code, phone_number),
  CONSTRAINT phone_fields_together CHECK (
    (phone_country_code IS NULL AND phone_number IS NULL) OR
    (phone_country_code IS NOT NULL AND phone_number IS NOT NULL)
  )
);

/* =============
Stocks
============= */

CREATE TABLE IF NOT EXISTS stocks (
  symbol VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  exchange VARCHAR(50) NOT NULL
);

/* =============
User Stocks Junction
============= */

CREATE TABLE IF NOT EXISTS user_stocks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL REFERENCES stocks(symbol) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

/* =============
Stock Functions
============= */

CREATE OR REPLACE FUNCTION public.replace_user_stocks(
  user_id uuid,
  symbols text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  DELETE FROM user_stocks WHERE user_stocks.user_id = replace_user_stocks.user_id;

  IF symbols IS NULL OR array_length(symbols, 1) IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO user_stocks (user_id, symbol)
  SELECT replace_user_stocks.user_id, sanitized.symbol
  FROM (
    SELECT DISTINCT UPPER(TRIM(BOTH FROM entry)) AS symbol
    FROM unnest(symbols) AS raw(entry)
    WHERE TRIM(BOTH FROM entry) <> ''
  ) AS sanitized;
END;
$$;

/* =============
User Preferences and Stocks Functions
============= */

CREATE OR REPLACE FUNCTION public.update_user_preferences_and_stocks(
  user_id uuid,
  timezone text,
  notification_start_hour integer,
  notification_end_hour integer,
  time_format varchar(3),
  email_notifications_enabled boolean,
  sms_notifications_enabled boolean,
  symbols text[]
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE users
  SET
    timezone = COALESCE(update_user_preferences_and_stocks.timezone, users.timezone),
    notification_start_hour = COALESCE(update_user_preferences_and_stocks.notification_start_hour, users.notification_start_hour),
    notification_end_hour = COALESCE(update_user_preferences_and_stocks.notification_end_hour, users.notification_end_hour),
    time_format = COALESCE(update_user_preferences_and_stocks.time_format, users.time_format),
    email_notifications_enabled = COALESCE(update_user_preferences_and_stocks.email_notifications_enabled, users.email_notifications_enabled),
    sms_notifications_enabled = COALESCE(update_user_preferences_and_stocks.sms_notifications_enabled, users.sms_notifications_enabled)
  WHERE id = update_user_preferences_and_stocks.user_id;

  PERFORM replace_user_stocks(update_user_preferences_and_stocks.user_id, symbols);
END;
$$;

/* =============
Notification Log
============= */

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  delivery_method VARCHAR(10) NOT NULL CHECK (delivery_method IN ('email', 'sms')),
  message_delivered BOOLEAN DEFAULT true NOT NULL,
  message TEXT,
  error TEXT,
  error_code VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

/* =============
Row Level Security - Users
============= */

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING ((SELECT auth.uid()) = id);

CREATE POLICY "Users can insert own profile" ON users
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE 
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "Users can delete own profile" ON users
  FOR DELETE USING ((SELECT auth.uid()) = id);

/* =============
Row Level Security - User Stocks
============= */

ALTER TABLE user_stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own stocks" ON user_stocks
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can insert own stocks" ON user_stocks
  FOR INSERT WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users can delete own stocks" ON user_stocks
  FOR DELETE USING ((SELECT auth.uid()) = user_id);

/* =============
Row Level Security - Stocks (Public Read)
============= */

ALTER TABLE stocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view stocks" ON stocks
  FOR SELECT USING (true);

/* =============
Row Level Security - Notification Log
============= */

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON notification_log
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

/* =============
Timestamp Functions
============= */

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_log_updated_at
  BEFORE UPDATE ON notification_log
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();



