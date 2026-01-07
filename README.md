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
# VERCEL_URL is automatically set by Vercel for all deployments.
# For local development, set it manually:
VERCEL_URL=http://localhost:4321

# Supabase Configuration
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
DATABASE_URL=postgresql://postgres:password@host:5432/database

# Twilio Configuration
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=your-verify-service-sid

# Vercel Cron Configuration
CRON_SECRET=your-random-secret-string

# Resend Configuration
RESEND_API_KEY=re_123456789
EMAIL_FROM=notifications@updates.example.com
```

**Where to find these:**
- `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY`: Supabase Dashboard → Project Settings → API
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Dashboard → Project Settings → API (under "Service role")
- `DATABASE_URL`: Supabase Dashboard → Project Settings → Database → Connection String → Transaction mode (pooler)
- Twilio credentials: Twilio Console → Account Dashboard
- `CRON_SECRET`: Generate a random string (e.g., `openssl rand -hex 32`)
- Resend credentials: Resend Dashboard → API Keys

**Security Note:** The `SUPABASE_SERVICE_ROLE_KEY` bypasses Row Level Security. Never expose it on the client side. The `.env.local` file (and all `.env*` files) are already excluded from version control via `.gitignore`; keep secrets only in environment files or your deployment platform, not in committed code.

### 4. Start Local Development

Start the local Supabase instance and the Astro development server:

```bash
# Start Supabase (requires Docker)
npx supabase start

# Start Astro dev server
npm run dev
```

`supabase start` will automatically:
1. Spin up local Supabase services (Postgres, Auth, etc.)
2. Apply database migrations from `supabase/migrations`
3. Seed the database with stock data from `supabase/seed.sql`

Visit <http://localhost:4321> to see the application.

### 5. (Optional) Update Stock Tickers

The database is pre-seeded with stock data. If you need to update the list of available stocks:

1. Update `scripts/us-stocks.json`
2. Generate a new seed file:
   ```bash
   npm run db:generate-seed
   ```
3. Reset the database to apply changes:
   ```bash
   npx supabase db reset
   ```

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
- `VERCEL_URL` - Not needed on Vercel. This is automatically set by Vercel for all deployments.
- `PUBLIC_SUPABASE_URL`
- `PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_PHONE_NUMBER`
- `TWILIO_VERIFY_SERVICE_SID`
- `CRON_SECRET`
- `RESEND_API_KEY`
- `EMAIL_FROM`

**Important for Astro SSR:**
- For each environment variable, ensure it's available for **Production**, **Preview**, and **Development** environments (or at least the ones you're using)
- **Enable "Available during Build"** for all variables - this is required for Astro's `import.meta.env` to work in serverless functions
- You can find this option when adding/editing each variable in the Vercel dashboard

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
│   │   │   ├── DashboardPreferencesForm.astro
│   │   │   ├── PhoneInput.vue      # Phone input with validation
│   │   │   ├── SetupRequiredBanner.astro
│   │   │   ├── StockInput.vue      # Fuzzy search stock selector
│   │   │   └── TrackedStocksPanel.vue
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
│   │   ├── supabase.ts     # Supabase client configuration
│   │   └── users.ts        # User service functions
│   ├── pages/              # File-based routing
│   │   ├── dashboard.astro # Authenticated dashboard experience
│   │   ├── api/            # API endpoints
│   │   │   ├── auth/       # Authentication endpoints
│   │   │   ├── notifications/
│   │   │   │   ├── shared.ts       # Shared logic
│   │   │   │   ├── sms/            # SMS logic
│   │   │   │   ├── email/          # Email logic
│   │   │   │   ├── scheduled.ts    # Cron job endpoint
│   │   │   │   └── instant.ts      # Instant notifications endpoint
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
├── supabase/               # Supabase configuration
│   ├── migrations/         # Database migrations
│   ├── seed.sql            # Initial data (generated)
│   └── config.toml         # Local config
├── scripts/                # Utility scripts
│   ├── generate-seed.ts    # Script to generate seed.sql
│   └── us-stocks.json      # US stock ticker data
├── tests/                  # Vitest unit tests
├── astro.config.ts         # Astro + Vercel + Vue config
├── vercel.json             # Cron job configuration
├── biome.jsonc             # Linter/formatter config
├── tsconfig.json
├── env.example             # Environment variables template
└── package.json
```

## Security Features

- ✅ Row Level Security (RLS) on all database tables
- ✅ Rate limiting on phone verification (3 attempts/hour)
- ✅ Cron endpoint protected by secret header
- ✅ Phone verification via Twilio Verify API
- ✅ SMS opt-out support (STOP keyword compliance)
- ✅ Service role key never exposed to client
- ✅ Traditional form submissions (no client-side state)

## Adding More Stocks

The stock data is imported from `scripts/us-stocks.json`. To update the stock list:

### JSON Structure

The `scripts/us-stocks.json` file must follow this structure:

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

See `scripts/us-stocks.json` for the canonical schema and example data.

### Update Process

1. Fetch updated stock data from [US Stock Symbols](https://github.com/rreichel3/US-Stock-Symbols) or your preferred source
2. Update `scripts/us-stocks.json` with the new data (must match the JSON structure above)
3. Regenerate the seed file:

```bash
npm run db:generate-seed
```

4. Reset the local database to apply the new seed data:

```bash
npm run db:reset
```

### ⚠️ Data Reset Warning

**Resetting the database (`npm run db:reset`) will:**
- Delete all existing data (users, preferences, tracked stocks)
- Re-apply the schema
- Re-seed the database with the updated stock list

This is safe for local development but **do not run this against a production database**. For production updates, you should create a migration that inserts/updates the stocks table.

## License

MIT
