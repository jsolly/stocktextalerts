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
    
    notification_configs = [
        {
            "type": "EMAIL",
            "enabled": SEND_EMAIL,
            "runner": run_email_notifications,
            "sent_key": "emails_sent",
            "failed_key": "emails_failed",
            "label": "Emails",
        },
        {
            "type": "SMS",
            "enabled": SEND_SMS,
            "runner": run_sms_notifications,
            "sent_key": "sms_sent",
            "failed_key": "sms_failed",
            "label": "SMS",
        },
    ]
    
    enabled_types = [config["type"] for config in notification_configs if config["enabled"]]
    print(f"Notification types: {', '.join(enabled_types) if enabled_types else 'NONE'}\n")
    
    default_result = {
        "skipped": 0,
        "log_failures": 0,
    }
    results = {}
    
    try:
        for config in notification_configs:
            if config["enabled"]:
                result = config["runner"](current_time, DRY_RUN)
                results[config["type"]] = result
            else:
                result = default_result.copy()
                result[config["sent_key"]] = 0
                result[config["failed_key"]] = 0
                results[config["type"]] = result
        
        summary_lines = [f"{'=' * 60}\nSummary\n{'=' * 60}"]
        
        for config in notification_configs:
            if config["enabled"]:
                result = results[config["type"]]
                summary_lines.append(
                    f"{config['label']} sent: {result[config['sent_key']]}\n"
                    f"{config['label']} failed: {result[config['failed_key']]}"
                )
        
        total_skipped = sum(results[ntype]["skipped"] for ntype in results)
        total_log_failures = sum(results[ntype]["log_failures"] for ntype in results)
        
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
