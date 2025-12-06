# Scripts

One-off scripts for testing and maintenance.

## Setup

Install Python dependencies:

```bash
pip install -r requirements.txt
```

## Scripts

### send_scheduled_notifications.py

Main orchestrator script that emulates the `/api/notifications/scheduled` endpoint. Can send email notifications, SMS notifications, or both based on command-line flags.

**Usage:**

```bash
# Send both email and SMS (default)
python scripts/send_scheduled_notifications.py

# Send only email notifications
python scripts/send_scheduled_notifications.py --email

# Send only SMS notifications
python scripts/send_scheduled_notifications.py --sms

# Send both explicitly
python scripts/send_scheduled_notifications.py --email --sms

# Dry run (preview without sending)
python scripts/send_scheduled_notifications.py --dry-run
```

**Features:**
- Queries production database for eligible users
- Checks timezone and notification windows
- Supports email and/or SMS notifications
- Records notifications in the database
- Dry-run mode for testing

**Environment Variables Required:**
- `PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWILIO_ACCOUNT_SID` (for SMS)
- `TWILIO_AUTH_TOKEN` (for SMS)
- `TWILIO_PHONE_NUMBER` (for SMS)

These should be loaded from your `.env.local` file.

### email_notifications.py

Standalone email notification module. Can be imported or run directly.

**Usage:**

```bash
# Run standalone
python scripts/email_notifications.py

# Dry run
python scripts/email_notifications.py --dry-run
```

**Note:** Currently uses a placeholder email sender. Integrate with Resend, SendGrid, AWS SES, etc. to enable actual email sending.

### sms_notifications.py

Standalone SMS notification module. Can be imported or run directly.

**Usage:**

```bash
# Run standalone
python scripts/sms_notifications.py

# Dry run
python scripts/sms_notifications.py --dry-run
```

**Features:**
- Sends SMS via Twilio
- Validates phone numbers and opt-out status
- Truncates messages to 160 characters

### notification_utils.py

Shared utilities module containing common logic for:
- User fetching and filtering
- Timezone calculations
- Stock loading
- Notification logging
- Window validation

Used by both email and SMS notification modules.

