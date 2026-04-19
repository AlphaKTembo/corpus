#!/usr/bin/env python3
"""Test Garmin authentication with direct Garth usage"""

import os
import sys
import traceback
from garth import Client, exc
from dotenv import load_dotenv

load_dotenv()

email = os.getenv('GARMIN_EMAIL')
password = os.getenv('GARMIN_PASSWORD')

print(f"Email: {email}")
print(f"Password set: {'Yes' if password else 'No'}")

try:
    print("\n1. Creating Garth client...")
    garth_client = Client()
    
    print("2. Attempting login...")
    garth_client.login(email, password)
    
    print("✅ Login successful!")
    
    print("\n3. Getting profile...")
    profile = garth_client.profile
    print(f"Profile type: {type(profile)}")
    print(f"Profile: {profile}")
    
except exc.GarthHTTPError as e:
    print(f"\n❌ HTTP Error: {e}")
    print(f"Status: {e.status}")
    print(f"Response: {e.msg}")
except AssertionError as e:
    print(f"\n❌ AssertionError: {e}")
    print("This usually means the profile wasn't loaded correctly")
    traceback.print_exc()
except Exception as e:
    print(f"\n❌ Error: {type(e).__name__}: {e}")
    traceback.print_exc()
