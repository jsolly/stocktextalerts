#!/usr/bin/env python3
"""
Email notification sending module.
Can be imported or run standalone.
"""

import sys
from datetime import datetime
from typing import Optional

import pytz
from supabase import create_client, Client

from notification_utils import (
    UserRecord,
    fetch_eligible_users,
    load_user_stocks,
    should_notify_user,
    record_notification,
)
from utils import get_env_var, load_env_file


def create_supabase_client() -> Client:
    """Create Supabase admin client."""
    load_env_file()
    
    supabase_url = get_env_var("PUBLIC_SUPABASE_URL")
    supabase_service_role_key = get_env_var("SUPABASE_SERVICE_ROLE_KEY")
    
    return create_client(supabase_url, supabase_service_role_key)


def format_email_message(stocks: list[str]) -> str:
    """Build email message from stock list."""
    if len(stocks) == 0:
        return "You don't have any tracked stocks"
    
    stocks_list = ", ".join(stocks)
    return f"Your tracked stocks: {stocks_list}"


def send_email(
    to: str,
    subject: str,
    body: str,
) -> tuple[bool, Optional[str], Optional[str]]:
    """
    Send email notification.
    Currently a placeholder - returns success without actually sending.
    Returns (success, error, error_code).
    """
    # TODO: Integrate with email service (Resend, SendGrid, AWS SES, etc.)
    print(f"[EMAIL PLACEHOLDER] Would send to {to}: {subject}\n[EMAIL PLACEHOLDER] Body: {body}")
    return (True, None, None)


def process_email_notifications(
    supabase: Client,
    current_time: datetime,
    dry_run: bool = False,
) -> dict:
    """Process and send email notifications for eligible users."""
    print("Fetching eligible users for email notifications...")
    # Fetch all users with email enabled (including those with both email and SMS)
    users = fetch_eligible_users(supabase, email_enabled=True, sms_enabled=True)
    
    # Filter to only those with email enabled
    users = [u for u in users if u.email_notifications_enabled]
    
    print(f"Found {len(users)} users with email notifications enabled\n")
    
    emails_sent = 0
    emails_failed = 0
    skipped = 0
    log_failures = 0
    
    print("Processing users for email notifications...")
    for user in users:
        if not should_notify_user(user, current_time):
            skipped += 1
            continue
        
        stocks = load_user_stocks(supabase, user.id)
        if stocks is None:
            skipped += 1
            continue
        
        message = format_email_message(stocks)
        
        if dry_run:
            print(f"[DRY RUN] Would send email to {user.email}\n[DRY RUN] Message: {message}")
            emails_sent += 1
            continue
        
        success, error, error_code = send_email(
            to=user.email,
            subject="Your Stock Update",
            body=message,
        )
        
        log_message = message if success else (error or "Unknown error")
        log_recorded = record_notification(
            supabase,
            user.id,
            "email",
            success,
            log_message,
            error if not success else None,
            error_code,
        )
        
        if success:
            emails_sent += 1
            print(f"✓ Sent email to {user.email}")
        else:
            emails_failed += 1
            print(f"✗ Failed to send email to {user.email}: {error}")
        
        if not log_recorded:
            log_failures += 1
    
    return {
        "emails_sent": emails_sent,
        "emails_failed": emails_failed,
        "skipped": skipped,
        "log_failures": log_failures,
    }


def run_email_notifications(current_time: datetime, dry_run: bool = False) -> dict:
    """Wrapper function that prints header and processes email notifications."""
    print(f"{'=' * 60}\nProcessing Email Notifications\n{'=' * 60}\n")
    result = process_email_notifications(
        create_supabase_client(),
        current_time,
        dry_run=dry_run,
    )
    print()
    return result


if __name__ == "__main__":
    print(f"{'=' * 60}\nEmail Notifications Script\n{'=' * 60}\n")
    
    dry_run = "--dry-run" in sys.argv
    
    try:
        supabase = create_supabase_client()
        current_time = datetime.now(pytz.UTC)
        
        print(f"Current time (UTC): {current_time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        if dry_run:
            print("DRY RUN MODE: No emails will be sent\n")
        
        result = process_email_notifications(supabase, current_time, dry_run=dry_run)
        
        print(f"\n{'=' * 60}\nSummary:\n{'=' * 60}\nEmails sent: {result['emails_sent']}\nEmails failed: {result['emails_failed']}\nLog failures: {result['log_failures']}\nSkipped: {result['skipped']}\n\nDone!")
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

