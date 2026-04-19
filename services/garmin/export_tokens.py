#!/usr/bin/env python3
"""
Export Garmin OAuth tokens as a base64 string for GARMINTOKENS.
Run this in an environment where Garmin login succeeds, then set
GARMINTOKENS to the printed string in infra/.env.
"""

import os
import sys
from garminconnect import Garmin, GarminConnectAuthenticationError, GarminConnectConnectionError
from dotenv import load_dotenv

load_dotenv()


def main() -> int:
    email = os.getenv("GARMIN_EMAIL")
    password = os.getenv("GARMIN_PASSWORD")

    if not email or not password:
        print("GARMIN_EMAIL and GARMIN_PASSWORD must be set.")
        return 1

    try:
        client = Garmin(email, password)
        client.login()
        tokens = client.garth.dumps()
        print(tokens)
        return 0
    except (GarminConnectAuthenticationError, GarminConnectConnectionError) as e:
        print(f"Login failed: {e}")
        return 2
    except Exception as e:
        print(f"Unexpected error: {e}")
        return 3


if __name__ == "__main__":
    sys.exit(main())
