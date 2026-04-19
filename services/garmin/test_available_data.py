#!/usr/bin/env python3
"""Check what data is available from Garmin"""

import os
from datetime import datetime, timedelta
from garminconnect import Garmin
from dotenv import load_dotenv

load_dotenv()

email = os.getenv('GARMIN_EMAIL')
password = os.getenv('GARMIN_PASSWORD')

print("Authenticating...")
client = Garmin(email, password)

# Workaround for profile error
try:
    client.login()
except AssertionError:
    client.display_name = email.split('@')[0]

print("✅ Authenticated!\n")

today = datetime.now().strftime('%Y-%m-%d')
yesterday = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')

print(f"Testing data availability for {yesterday} and {today}:\n")

# Test Body Battery
print("1. Body Battery:")
try:
    data = client.get_body_battery(today)
    print(f"   Today: {len(data) if isinstance(data, list) else type(data).__name__} items")
    if isinstance(data, list) and len(data) > 0:
        print(f"   Sample: {data[0]}")
except Exception as e:
    print(f"   Error: {type(e).__name__}: {e}")

# Test HRV
print("\n2. HRV:")
try:
    data = client.get_hrv_data(today)
    print(f"   Type: {type(data).__name__}")
    if isinstance(data, dict):
        print(f"   Keys: {list(data.keys())[:5]}")
    elif isinstance(data, list):
        print(f"   Items: {len(data)}")
except Exception as e:
    print(f"   Error: {type(e).__name__}: {e}")

# Test Heart Rates
print("\n3. Heart Rates (includes RHR):")
try:
    data = client.get_heart_rates(today)
    print(f"   Type: {type(data).__name__}")
    if isinstance(data, dict):
        print(f"   Keys: {list(data.keys())[:10]}")
        if 'restingHeartRate' in data:
            print(f"   Resting HR: {data['restingHeartRate']}")
    elif isinstance(data, list):
        print(f"   Items: {len(data)}")
except Exception as e:
    print(f"   Error: {type(e).__name__}: {e}")

# Test Sleep Data
print("\n4. Sleep Data:")
try:
    data = client.get_sleep_data(today)
    print(f"   Type: {type(data).__name__}")
    if isinstance(data, dict):
        print(f"   Keys: {list(data.keys())[:10]}")
    elif isinstance(data, list):
        print(f"   Items: {len(data)}")
except Exception as e:
    print(f"   Error: {type(e).__name__}: {e}")

# Test Stats
print("\n5. User Stats:")
try:
    stats = client.get_stats(today)
    print(f"   Available: {list(stats.keys())[:10] if isinstance(stats, dict) else type(stats).__name__}")
except Exception as e:
    print(f"   Error: {type(e).__name__}: {e}")

print("\n✅ Testing complete!")
