#!/usr/bin/env python3
"""Test script to debug Garmin Body Battery fetching"""

import os
import sys
import traceback
from datetime import datetime
from garminconnect import Garmin
from dotenv import load_dotenv

load_dotenv()

email = os.getenv('GARMIN_EMAIL')
password = os.getenv('GARMIN_PASSWORD')

print(f"Email: {email[:3]}***")
print(f"Password: {'*' * len(password)}")

try:
    print("\n1. Creating Garmin client...")
    client = Garmin(email, password)
    
    print("2. Logging in...")
    client.login()
    print("✅ Login successful!")
    
    print("\n3. Fetching Body Battery for today...")
    today = datetime.now().strftime('%Y-%m-%d')
    print(f"   Date: {today}")
    
    data = client.get_body_battery(today)
    
    print(f"\n✅ Success! Got {len(data) if isinstance(data, list) else 'unknown'} data points")
    print(f"Data type: {type(data)}")
    
    if isinstance(data, list) and len(data) > 0:
        print(f"\nFirst data point: {data[0]}")
    elif isinstance(data, dict):
        print(f"\nData keys: {data.keys()}")
        print(f"Sample: {list(data.items())[:3]}")
    else:
        print(f"\nData: {data}")
        
except Exception as e:
    print(f"\n❌ Error: {type(e).__name__}")
    print(f"Error message: '{str(e)}'")
    print(f"Error repr: {repr(e)}")
    print("\nFull traceback:")
    traceback.print_exc()
