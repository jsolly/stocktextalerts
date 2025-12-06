#!/usr/bin/env python3
"""
SMS notification sending module.
Can be imported or run standalone.
"""

import sys
from datetime import datetime
from typing import Optional

import pytz
from supabase import create_client, Client
from twilio.rest import Client as TwilioClient

from notification_utils import (
    UserRecord,
    fetch_eligible_users,
    load_user_stocks,
    should_notify_user,
    should_send_sms,
    record_notification,
)
from utils import get_env_var, load_env_file


def create_supabase_client() -> Client:
    """Create Supabase admin client."""
    load_env_file()
    
    supabase_url = get_env_var("PUBLIC_SUPABASE_URL")
    supabase_service_role_key = get_env_var("SUPABASE_SERVICE_ROLE_KEY")
    
    return create_client(supabase_url, supabase_service_role_key)


def create_twilio_client() -> TwilioClient:
    """Create Twilio client."""
    load_env_file()
    
    account_sid = get_env_var("TWILIO_ACCOUNT_SID")
    auth_token = get_env_var("TWILIO_AUTH_TOKEN")
    
    return TwilioClient(account_sid, auth_token)


def truncate_sms(message: str, max_length: int = 160) -> str:
    """Truncate SMS message to max length."""
    if len(message) <= max_length:
        return message
    return message[:max_length - 3] + "..."


def format_sms_message(stocks: list[str]) -> str:
    """Build SMS message from stock list."""
    if len(stocks) == 0:
        return "You don't have any tracked stocks. Reply STOP to opt out."
    
    stocks_list = ", ".join(stocks)
    message = f"Tracked: {stocks_list}. Reply STOP to opt out."
    return truncate_sms(message)


def send_sms(
    twilio_client: TwilioClient,
    twilio_phone_number: str,
    to: str,
    body: str,
) -> tuple[bool, Optional[str], Optional[str], Optional[str]]:
    """Send SMS via Twilio. Returns (success, message_sid, error, error_code)."""
    try:
        message = twilio_client.messages.create(
            body=body,
            from_=twilio_phone_number,
            to=to,
        )
        return (True, message.sid, None, None)
    except Exception as e:
        error_msg = str(e)
        error_code = getattr(e, "code", None)
        error_code_str = str(error_code) if error_code is not None else None
        return (False, None, error_msg, error_code_str)


def process_sms_notifications(
    supabase: Client,
    twilio_client: TwilioClient,
    twilio_phone_number: str,
    current_time: datetime,
    dry_run: bool = False,
) -> dict:
    """Process and send SMS notifications for eligible users."""
    print("Fetching eligible users for SMS notifications...")
    # Fetch all users with SMS enabled (including those with both email and SMS)
    users = fetch_eligible_users(supabase, email_enabled=True, sms_enabled=True)
    
    # Filter to only those with SMS enabled
    users = [u for u in users if u.sms_notifications_enabled]
    
    print(f"Found {len(users)} users with SMS notifications enabled\n")
    
    sms_sent = 0
    sms_failed = 0
    skipped = 0
    log_failures = 0
    
    print("Processing users for SMS notifications...")
    for user in users:
        if not should_notify_user(user, current_time):
            skipped += 1
            continue
        
        if not should_send_sms(user):
            skipped += 1
            continue
        
        stocks = load_user_stocks(supabase, user.id)
        if stocks is None:
            skipped += 1
            continue
        
        message = format_sms_message(stocks)
        phone = f"{user.phone_country_code}{user.phone_number}"
        
        if dry_run:
            print(f"[DRY RUN] Would send SMS to {user.email} ({phone})\n[DRY RUN] Message: {message}")
            sms_sent += 1
            continue
        
        success, message_sid, error, error_code = send_sms(
            twilio_client,
            twilio_phone_number,
            phone,
            message,
        )
        
        log_message = message if success else (error or "Unknown error")
        log_recorded = record_notification(
            supabase,
            user.id,
            "sms",
            success,
            log_message,
            error if not success else None,
            error_code,
        )
        
        if success:
            sms_sent += 1
            print(f"✓ Sent SMS to {user.email} ({phone})")
        else:
            sms_failed += 1
            print(f"✗ Failed to send SMS to {user.email} ({phone}): {error}")
        
        if not log_recorded:
            log_failures += 1
    
    return {
        "sms_sent": sms_sent,
        "sms_failed": sms_failed,
        "skipped": skipped,
        "log_failures": log_failures,
    }


def run_sms_notifications(current_time: datetime, dry_run: bool = False) -> dict:
    """Wrapper function that prints header and processes SMS notifications."""
    print(f"{'=' * 60}\nProcessing SMS Notifications\n{'=' * 60}\n")
    result = process_sms_notifications(
        create_supabase_client(),
        create_twilio_client(),
        get_env_var("TWILIO_PHONE_NUMBER"),
        current_time,
        dry_run=dry_run,
    )
    print()
    return result


if __name__ == "__main__":
    print(f"{'=' * 60}\nSMS Notifications Script\n{'=' * 60}\n")
    
    dry_run = "--dry-run" in sys.argv
    
    try:
        supabase = create_supabase_client()
        twilio_client = create_twilio_client()
        twilio_phone_number = get_env_var("TWILIO_PHONE_NUMBER")
        
        current_time = datetime.now(pytz.UTC)
        
        print(f"Current time (UTC): {current_time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        
        if dry_run:
            print("DRY RUN MODE: No SMS messages will be sent\n")
        
        result = process_sms_notifications(
            supabase,
            twilio_client,
            twilio_phone_number,
            current_time,
            dry_run=dry_run,
        )
        
        print(f"\n{'=' * 60}\nSummary:\n{'=' * 60}\nSMS sent: {result['sms_sent']}\nSMS failed: {result['sms_failed']}\nLog failures: {result['log_failures']}\nSkipped: {result['skipped']}\n\nDone!")
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
        sys.exit(1)
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

