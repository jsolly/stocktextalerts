#!/usr/bin/env python3
"""
Shared utilities for scheduled notification scripts.
Contains common logic for user fetching, timezone checks, and stock loading.
"""

from datetime import datetime
from typing import Optional

import pytz
from supabase import Client


class UserRecord:
    def __init__(self, data: dict):
        self.id = data["id"]
        self.email = data["email"]
        self.phone_country_code = data.get("phone_country_code")
        self.phone_number = data.get("phone_number")
        self.phone_verified = data.get("phone_verified", False)
        self.sms_opted_out = data.get("sms_opted_out", False)
        self.timezone = data.get("timezone")
        self.notification_start_hour = data.get("notification_start_hour", 0)
        self.notification_end_hour = data.get("notification_end_hour", 23)
        self.email_notifications_enabled = data.get("email_notifications_enabled", False)
        self.sms_notifications_enabled = data.get("sms_notifications_enabled", False)


def fetch_eligible_users(supabase: Client, email_enabled: bool, sms_enabled: bool) -> list[UserRecord]:
    """Fetch users with email or SMS notifications enabled based on flags."""
    query = (
        supabase.table("users")
        .select(
            "id,email,phone_country_code,phone_number,phone_verified,"
            "sms_opted_out,timezone,notification_start_hour,notification_end_hour,"
            "email_notifications_enabled,sms_notifications_enabled"
        )
    )
    
    if email_enabled and sms_enabled:
        query = query.or_("email_notifications_enabled.eq.true,sms_notifications_enabled.eq.true")
    elif email_enabled:
        query = query.eq("email_notifications_enabled", True)
    elif sms_enabled:
        query = query.eq("sms_notifications_enabled", True)
    else:
        return []
    
    response = query.execute()
    
    if not response.data:
        return []
    
    return [UserRecord(user) for user in response.data]


def load_user_stocks(supabase: Client, user_id: str) -> Optional[list[str]]:
    """Load stock symbols for a user."""
    response = supabase.table("user_stocks").select("symbol").eq("user_id", user_id).execute()
    
    if not response.data:
        return []
    
    return [stock["symbol"] for stock in response.data]


def get_current_hour_in_timezone(timezone: str, current_time: datetime) -> Optional[int]:
    """Get current hour in user's timezone."""
    try:
        tz = pytz.timezone(timezone)
        local_time = current_time.astimezone(tz)
        return local_time.hour
    except Exception as e:
        print(f"Failed to get hour for timezone {timezone}: {e}")
        return None


def is_hour_within_window(hour: int, start: int, end: int) -> bool:
    """Check if hour is within notification window."""
    if start == end:
        return hour == start
    
    if start < end:
        return start <= hour <= end
    
    return hour >= start or hour <= end


def should_notify_user(user: UserRecord, current_time: datetime) -> bool:
    """Check if user should be notified based on timezone and window."""
    if not user.timezone:
        return False
    
    current_hour = get_current_hour_in_timezone(user.timezone, current_time)
    if current_hour is None:
        return False
    
    return is_hour_within_window(
        current_hour,
        user.notification_start_hour,
        user.notification_end_hour,
    )


def should_send_sms(user: UserRecord) -> bool:
    """Check if SMS should be sent to user."""
    has_opted_in = user.sms_notifications_enabled and not user.sms_opted_out
    has_verified_phone = (
        user.phone_verified
        and user.phone_country_code
        and user.phone_number
    )
    return has_opted_in and has_verified_phone


def record_notification(
    supabase: Client,
    user_id: str,
    delivery_method: str,
    message_delivered: bool,
    message: str,
    error: Optional[str] = None,
    error_code: Optional[str] = None,
) -> bool:
    """Record notification in the log."""
    try:
        supabase.table("notification_log").insert({
            "user_id": user_id,
            "type": "scheduled_update",
            "delivery_method": delivery_method,
            "message_delivered": message_delivered,
            "message": message,
            "error": error,
            "error_code": error_code,
        }).execute()
        return True
    except Exception as e:
        print(f"Failed to record notification for user {user_id}: {e}")
        return False

