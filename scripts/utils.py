#!/usr/bin/env python3
"""
Shared utility functions for notification scripts.
"""

import os
from datetime import datetime

import pytz
from dotenv import load_dotenv


def get_env_var(name: str) -> str:
    """Get required environment variable."""
    value = os.getenv(name)
    if not value:
        raise ValueError(f"Missing required environment variable: {name}")
    return value


def load_env_file() -> None:
    """Load environment variables from .env.local file."""
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    env_path = os.path.join(project_root, ".env.local")
    load_dotenv(dotenv_path=env_path)


def get_current_time_utc() -> datetime:
    """Get current time in UTC and print it. Returns the datetime object."""
    current_time = datetime.now(pytz.UTC)
    print(f"Current time (UTC): {current_time.strftime('%Y-%m-%d %H:%M:%S')}\n")
    return current_time

