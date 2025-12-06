#!/usr/bin/env python3

from email_notifications import run_email_notifications
from sms_notifications import run_sms_notifications
from utils import load_env_file, get_current_time_utc


if __name__ == "__main__":
    SEND_EMAIL = True
    SEND_SMS = False
    DRY_RUN = True
    if DRY_RUN:
        print("DRY RUN MODE: No notifications will be sent\n")
    
    # Load environment variables
    load_env_file()
    
    current_time = get_current_time_utc()
    
    print(f"{'=' * 60}\nScheduled Stock Notifications Script\n{'=' * 60}\n")
    enabled_types = []
    if SEND_EMAIL:
        enabled_types.append("EMAIL")
    if SEND_SMS:
        enabled_types.append("SMS")
    print(f"Notification types: {', '.join(enabled_types) if enabled_types else 'NONE'}\n")
    
    email_result = {
        "emails_sent": 0,
        "emails_failed": 0,
        "skipped": 0,
        "log_failures": 0,
    }
    sms_result = {
        "sms_sent": 0,
        "sms_failed": 0,
        "skipped": 0,
        "log_failures": 0,
    }
    
    try:
        if SEND_EMAIL:
            email_result = run_email_notifications(current_time, DRY_RUN)
        
        if SEND_SMS:
            sms_result = run_sms_notifications(current_time, DRY_RUN)
        
        # Summary
        summary_lines = [f"{'=' * 60}\nSummary\n{'=' * 60}"]
        
        if SEND_EMAIL:
            summary_lines.append(f"Emails sent: {email_result['emails_sent']}\nEmails failed: {email_result['emails_failed']}")
        
        if SEND_SMS:
            summary_lines.append(f"SMS sent: {sms_result['sms_sent']}\nSMS failed: {sms_result['sms_failed']}")
        
        total_skipped = email_result["skipped"] + sms_result["skipped"]
        total_log_failures = email_result["log_failures"] + sms_result["log_failures"]
        
        summary_lines.append(f"Total skipped: {total_skipped}\nTotal log failures: {total_log_failures}\n\nDone!")
        print("\n".join(summary_lines))
        
    except KeyboardInterrupt:
        print("\n\nCancelled by user.")
        exit(1)
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback
        traceback.print_exc()
        exit(1)
