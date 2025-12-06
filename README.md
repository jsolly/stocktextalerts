# Stock Notification Dashboard 📈📱

A stock notification application that sends scheduled SMS and email updates about tracked stocks. Built with Astro, deployed on Vercel, with Supabase authentication and PostgreSQL database.

## Features

- 📊 **Stock Tracking** - Search and track your favorite stocks (AAPL, MSFT, GOOGL, etc.)
- 📧 **Email Notifications** - Receive scheduled email updates about your tracked stocks
- 📱 **SMS Notifications** - Optional SMS messages via Twilio
- 📞 **Phone Verification** - Secure phone verification with rate limiting (3 attempts/hour)
- 🌍 **Timezone Support** - All US timezones with browser auto-detection
- ⏰ **Notification Windows** - Configure start/end hours for delivery
- 🔕 **SMS Opt-out** - Users can reply STOP to opt out of SMS

## Tech Stack

- **Framework**: Astro 5 with SSR
- **UI**: Vue 3 components with Tailwind CSS
- **Database**: Supabase (PostgreSQL)
- **SMS**: Twilio Verify API + Messaging API
- **Hosting**: Vercel with Cron Jobs
- **Phone Validation**: libphonenumber-js
- **Search**: Fuse.js for fuzzy stock search
- **Linting**: Biome (no ESLint or Prettier)
- **Testing**: Vitest

## Prerequisites

- Node.js 18+
- Supabase account
- Twilio account with Verify API enabled
- Vercel account (for deployment and cron jobs)

## Development Setup

### 1. Clone and Install

```bash
git clone git@github.com:jsolly/stocktextalerts.git
cd stocktextalerts
npm install
```

### 2. Create Accounts

**Supabase:**
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose a project name, database password, and region
3. Wait for the project to finish provisioning

**Twilio:**
1. Go to [twilio.com](https://www.twilio.com) and create an account
2. Purchase a phone number (or use trial number)
3. Create a Verify Service in Console → Verify → Services
4. Note your Account SID, Auth Token, Phone Number, and Verify Service SID

**Vercel:**
1. Push your code to GitHub (if you haven't already)
2. Go to [vercel.com](https://vercel.com) and import your repository
3. Don't deploy yet - we'll add environment variables first

### 3. Environment Variables

Create a `.env.local` file in the root directory (you can copy from `env.example` and fill in secrets). This file is gitignored and **must not** be committed.

```env
# Site Configuration
SITE_URL=http://localhost:4321

# Supabase Configuration
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:password@host:5432/database
DEFAULT_PASSWORD=your-strong-local-seed-password

# Twilio Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=your-verify-service-sid

# Vercel Cron Configuration
CRON_SECRET=your-random-secret-string
```

**Where to find these:**
- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`: Supabase Dashboard → Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Project Settings → API (under "Service role")
- `DATABASE_URL`: Supabase Dashboard → Project Settings → Database → Connection String → Transaction mode (pooler)
- Twilio credentials: Twilio Console → Account Dashboard
- `CRON_SECRET`: Generate a random string (e.g., `openssl rand -hex 32`)

For local development, `DEFAULT_PASSWORD` is used only by `db/seed-users.sh` to create test users via the Supabase Admin API. Use a strong throwaway password and never reuse production credentials here.

**Security Note:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. Never expose it on the client side. The `.env.local` file (and all `.env*` files) are already excluded from version control via `.gitignore`; keep secrets only in environment files or your deployment platform, not in committed code.

### 4. Database Setup

Run the database setup script to create all required tables:

```bash
./db/apply-schema.sh
```

This creates:
- **users** table - Extended with phone, timezone, notification preferences
- **stocks** table - Symbol, name, exchange
- **user_stocks** junction table - Many-to-many relationship
- **notification_log** table - Audit trail for all notifications
- All RLS policies, triggers, and functions

### 5. Import Stock Tickers

Import stock tickers into the database:

```bash
npm run db:import-tickers
```

This imports thousands of US stock tickers from `db/us-stocks.json` that users can track. The script uses PostgreSQL's COPY command for efficient bulk import.

⚠️ **See 'Production Safety Warning' below** - This command truncates the `stocks` and `user_stocks` tables. Always back up your database and test in development first.

### 6. Run Development Server

```bash
npm run dev
```

Visit <http://localhost:4321> to see the application.

## Usage

### User Flow

1. **Register** - Create an account with email
2. **Set Settings** - Configure timezone and notification window
3. **Add Stocks** - Search and add stocks to track
4. **Enable SMS** (optional) - Add phone number and verify via SMS code
5. **Receive Notifications** - Get scheduled updates during your configured time window

### API Endpoints

**Authentication:**
- `POST /api/auth/email/register` - User registration
- `POST /api/auth/email/forgot-password` - Request password reset
- `POST /api/auth/email/resend-verification` - Resend verification email
- `POST /api/auth/signin` - User login
- `POST /api/auth/signout` - User logout
- `POST /api/auth/delete-account` - Delete user account
- `POST /api/auth/sms/send-verification` - Send SMS verification code
- `POST /api/auth/sms/verify-code` - Verify SMS code

**Notifications & Preferences:**
- `POST /api/preferences` - Update notification preferences and tracked stocks
- `POST /api/notifications/scheduled` - Cron endpoint (protected by CRON_SECRET)
- `POST /api/notifications/inbound-sms` - Twilio webhook for STOP/START/HELP keywords

## Deployment to Vercel

### 1. Add Environment Variables

In your Vercel project settings (Settings → Environment Variables), add all variables from your `.env.local` file:
- `SITE_URL` - Your production URL (e.g., `https://yourdomain.com`)
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_VERIFY_SERVICE_SID`
- `CRON_SECRET`

**Note:** You don't need `DATABASE_URL` in Vercel - it's only for running the local schema setup script.

### 2. Deploy

Push to your main branch or click "Redeploy" in Vercel. The application will automatically build and deploy.

### 3. Configure Twilio Webhook

After deployment, configure the Twilio webhook for incoming SMS:
1. Go to Twilio Console → Phone Numbers → Manage → Active numbers
2. Select your phone number
3. Under "Messaging", set the webhook URL to: `https://yourdomain.com/api/notifications/inbound-sms`
4. Save changes

### 4. Verify Cron Job

The `vercel.json` file configures a scheduled cron job that runs at minute 0 of every hour.

Vercel will automatically call `/api/notifications/scheduled` with the `x-vercel-cron-secret` header.

The cron job:
1. Queries users who need notifications based on their timezone and time window
2. Fetches their tracked stocks
3. Sends via email and/or SMS based on settings
4. Logs all notification attempts to `notification_log` table

## Project Structure

```text
/
├── public/
│   └── favicons/           # Favicon files
├── src/
│   ├── components/
│   │   ├── dashboard/      # Dashboard components for managing preferences
│   │   │   ├── NotificationPreferences.astro
│   │   │   ├── PhoneInput.vue      # Phone input with validation
│   │   │   ├── SetupRequiredBanner.astro
│   │   │   ├── StockInput.vue      # Fuzzy search stock selector
│   │   │   └── TrackedStocks.astro
│   │   ├── landing/        # Landing page components
│   │   │   ├── CTA.astro
│   │   │   ├── Features.astro
│   │   │   └── Hero.astro
│   │   ├── layout/
│   │   │   └── Navigation.astro
│   │   └── profile/        # Profile page components
│   │       ├── AccountManagement.astro
│   │       └── DangerZone.astro
│   ├── layouts/
│   │   └── Layout.astro    # Main layout with meta tags
│   ├── lib/                # Services and utilities
│   │   ├── format.ts       # Formatting utilities
│   │   ├── notifications/  # Shared notification helpers and types
│   │   │   ├── contracts.ts
│   │   │   ├── scheduled/
│   │   │   ├── instant/
│   │   │   └── inbound-sms.ts
│   │   ├── supabase.ts     # Supabase client configuration
│   │   └── users.ts        # User service functions
│   ├── pages/              # File-based routing
│   │   ├── dashboard.astro # Authenticated dashboard experience
│   │   ├── api/            # API endpoints
│   │   │   ├── auth/       # Authentication endpoints
│   │   │   │   ├── delete-account.ts
│   │   │   │   ├── signin.ts
│   │   │   │   ├── signout.ts
│   │   │   │   ├── email/
│   │   │   │   │   ├── forgot-password.ts
│   │   │   │   │   ├── register.ts
│   │   │   │   │   └── resend-verification.ts
│   │   │   │   └── sms/
│   │   │   │       ├── send-verification.ts
│   │   │   │       └── verify-code.ts
│   │   │   ├── notifications/
│   │   │   │   ├── scheduled/      # Cron job endpoint and utilities
│   │   │   │   ├── instant/        # Placeholder for immediate notifications
│   │   │   │   └── inbound-sms.ts  # Twilio webhook (STOP/START)
│   │   │   └── preferences/
│   │   │       └── index.ts        # Update prefs and manage tracked stocks
│   │   ├── auth/
│   │   │   ├── forgot.astro
│   │   │   ├── recover.astro
│   │   │   ├── register.astro
│   │   │   └── unconfirmed.astro
│   │   ├── index.astro     # Landing page
│   │   └── profile.astro   # User profile page
│   ├── global.css
│   └── env.d.ts
├── db/                     # Database setup
│   ├── schema.sql          # Complete database schema
│   ├── apply-schema.sh     # Schema setup script
│   ├── seed-stocks.sh      # Stock data import script
│   └── us-stocks.json      # US stock ticker data
├── tests/                  # Vitest unit tests
│   ├── phone-normalization.test.ts
│   ├── pii-truncation.test.ts
│   ├── sanity.test.ts
│   └── timezone-validation.test.ts
├── astro.config.ts         # Astro + Vercel + Vue config
├── vercel.json             # Cron job configuration
├── biome.jsonc             # Linter/formatter config
├── tsconfig.json
├── env.example             # Environment variables template
└── package.json
```

## Database Schema

### users
- Core fields: `id`, `email`, `created_at`, `updated_at`
- Phone: `phone_country_code`, `phone_number`, `full_phone`, `phone_verified`, `sms_opted_out`
- Notification preferences: `timezone`, `notification_start_hour`, `notification_end_hour`, `email_notifications_enabled`, `sms_notifications_enabled`

### stocks
- `symbol` (PRIMARY KEY) - Stock ticker symbol
- `name` - Company name
- `exchange` - NYSE or NASDAQ

### user_stocks
- `user_id` - References users
- `symbol` - References stocks
- `created_at` - When stock was added
- Primary key on (user_id, symbol)

### notification_log
- Audit trail of all notification attempts
- Tracks delivery status, method, and message content

## Commands

All commands are run from the root of the project:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `npm install`            | Installs dependencies                            |
| `npm run dev`            | Starts local dev server at `localhost:4321`      |
| `npm run build`          | Build your production site to `./dist/`          |
| `npm run preview`        | Preview your build locally, before deploying     |
| `npm run db:import-tickers` | Import stock tickers into database            |
| `npm run test:unit`      | Run unit tests with Vitest                       |
| `npm run check:ts`       | Run TypeScript type checking                     |
| `npm run check:biome`    | Run Biome linter and formatter (auto-fix)        |
| `npm run fix`            | Run linter + type checking (fixes what it can)   |
| `npm run outdated`       | Check for outdated packages                      |
| `npm run update`         | Update all packages to latest versions           |

## Troubleshooting

### Phone Verification Not Working

1. Check Twilio credentials in `.env.local`
2. Verify your Twilio phone number is active
3. Check Twilio Verify service is created and active
4. Check Twilio logs in the Console for delivery issues

### Cron Jobs Not Running

1. Verify `CRON_SECRET` is set in Vercel environment variables
2. Check Vercel cron logs in dashboard (Deployments → Functions → Cron)
3. Ensure timezone calculations are correct in `scheduled/scheduled-utils.ts`
4. Test the endpoint manually with the correct header

### Database Connection Issues

1. Verify `DATABASE_URL` and Supabase credentials
2. Check RLS policies are properly configured
3. Ensure service role key has admin access
4. Try running `./db/apply-schema.sh` again

### Email Notifications Not Sending

The current `email.ts` implementation is a placeholder that logs to console. To enable actual email sending, integrate with:
- [Resend](https://resend.com) - Recommended, developer-friendly API
- [SendGrid](https://sendgrid.com) - Popular enterprise option
- [AWS SES](https://aws.amazon.com/ses/) - Cost-effective for high volume

### SMS Not Being Delivered

1. Check Twilio phone number is SMS-enabled
2. Verify recipient phone number format
3. Check SMS length doesn't exceed 160 characters
4. Review Twilio error logs in Console
5. Ensure you're not hitting Twilio rate limits

## Security Features

- ✅ Row Level Security (RLS) on all database tables
- ✅ Rate limiting on phone verification (3 attempts/hour)
- ✅ Cron endpoint protected by secret header
- ✅ Phone verification via Twilio Verify API
- ✅ SMS opt-out support (STOP keyword compliance)
- ✅ Service role key never exposed to client
- ✅ Traditional form submissions (no client-side state)

## Adding More Stocks

The stock data is imported from `db/us-stocks.json`. To update the stock list:

### JSON Structure

The `db/us-stocks.json` file must follow this structure:

```json
{
  "metadata": {
    "source": "https://github.com/rreichel3/US-Stock-Symbols",
    "fetched_at": "2025-11-08T15:18:17Z",
    "exchanges": ["NASDAQ", "NYSE", "AMEX"],
    "total_symbols": 7036
  },
  "data": [
    {
      "symbol": "AAPL",
      "name": "Apple Inc. Common Stock",
      "exchange": "NASDAQ"
    },
    {
      "symbol": "MSFT",
      "name": "Microsoft Corporation Common Stock",
      "exchange": "NASDAQ"
    }
  ]
}
```

**Required fields:**
- `data` (array) - Array of stock objects
- Each stock object must have:
  - `symbol` (string, required) - Stock ticker symbol (max 10 characters)
  - `name` (string, required) - Company name (max 255 characters)
  - `exchange` (string, required) - Exchange name (e.g., "NASDAQ", "NYSE", "AMEX")

**Optional fields:**
- `metadata` (object) - Metadata about the data source (not imported, for reference only)

See `db/us-stocks.json` for the canonical schema and example data.

### Import Process

1. Fetch updated stock data from [US Stock Symbols](https://github.com/rreichel3/US-Stock-Symbols) or your preferred source
2. Update `db/us-stocks.json` with the new data (must match the JSON structure above)
3. Run:

```bash
npm run db:import-tickers
```

### ⚠️ Production Safety Warning

**The import script truncates both the `stocks` and `user_stocks` tables, which means:**
- All existing stock data is deleted
- **All user stock associations are permanently deleted** - users will lose their tracked stocks
- The script does NOT preserve existing `user_stocks` associations

**Before running in production:**

1. **Back up your database** - Create a full database backup before running the import
2. **Test on development/staging first** - Always run the import on a non-production copy first
3. **Verify the JSON structure** - Ensure your JSON matches the expected format (use `jq` to validate)
4. **Schedule during off-peak hours** - Run during low-traffic periods to minimize user impact
5. **Notify users in advance** - Inform users that tracked stocks will be reset
6. **Plan for data recovery** - If needed, restore user stock associations from backups after import

The import uses PostgreSQL's `TRUNCATE` command which cannot be rolled back - always test thoroughly before production use.

## License

MIT
