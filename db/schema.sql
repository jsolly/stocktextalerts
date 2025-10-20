/* =============
Domains and Extensions
============= */

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- US Timezones domain
CREATE DOMAIN timezone AS TEXT
CHECK (VALUE IN (
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Detroit',
  'America/Kentucky/Louisville',
  'America/Kentucky/Monticello',
  'America/Indiana/Indianapolis',
  'America/Indiana/Vincennes',
  'America/Indiana/Winamac',
  'America/Indiana/Marengo',
  'America/Indiana/Petersburg',
  'America/Indiana/Vevay',
  'America/Indiana/Tell_City',
  'America/Indiana/Knox',
  'America/Menominee',
  'America/North_Dakota/Center',
  'America/North_Dakota/New_Salem',
  'America/North_Dakota/Beulah',
  'America/Boise',
  'America/Juneau',
  'America/Sitka',
  'America/Metlakatla',
  'America/Yakutat',
  'America/Nome',
  'America/Adak'
));

-- Delivery status domain
CREATE DOMAIN delivery_status AS TEXT
CHECK (VALUE IN ('sent', 'failed'));

/* =============
Users Table
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
  timezone timezone,
  time_format VARCHAR(3) DEFAULT '24h' NOT NULL CHECK (time_format IN ('12h', '24h')),
  alert_start_hour INTEGER DEFAULT 9 NOT NULL CHECK (alert_start_hour >= 0 AND alert_start_hour <= 23),
  alert_end_hour INTEGER DEFAULT 17 NOT NULL CHECK (alert_end_hour >= 0 AND alert_end_hour <= 23),
  alert_via_email BOOLEAN DEFAULT true NOT NULL,
  alert_via_sms BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  CONSTRAINT phone_country_code_format CHECK (phone_country_code ~ '^\+[0-9]{1,4}$'),
  CONSTRAINT phone_number_format CHECK (phone_number ~ '^[0-9]{10,14}$'),
  CONSTRAINT unique_phone UNIQUE (phone_country_code, phone_number),
  CONSTRAINT phone_fields_together CHECK (
    (phone_country_code IS NULL AND phone_number IS NULL) OR
    (phone_country_code IS NOT NULL AND phone_number IS NOT NULL)
  )
);

/* =============
Stocks Table
============= */

CREATE TABLE IF NOT EXISTS stocks (
  symbol VARCHAR(10) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  exchange VARCHAR(50) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

/* =============
User Stocks Junction Table
============= */

CREATE TABLE IF NOT EXISTS user_stocks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL REFERENCES stocks(symbol) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  PRIMARY KEY (user_id, symbol)
);

/* =============
Alerts Log Table
============= */

CREATE TABLE IF NOT EXISTS alerts_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  delivery_method VARCHAR(10) NOT NULL CHECK (delivery_method IN ('email', 'sms')),
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  status delivery_status NOT NULL,
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_alerts_log_user_id 
ON alerts_log(user_id);

CREATE INDEX IF NOT EXISTS idx_alerts_log_sent_at 
ON alerts_log(sent_at);

/* =============
Row Level Security - Users
============= */

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON users
  FOR SELECT USING ((SELECT auth.uid()) = id);

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
Row Level Security - Alerts Log
============= */

ALTER TABLE alerts_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON alerts_log
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

CREATE TRIGGER update_alerts_log_updated_at
  BEFORE UPDATE ON alerts_log
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
