#!/usr/bin/env python3
"""
Garmin Data Sync Cron Script
Fetches Body Battery, HRV, and RHR data from Garmin and sends to NestJS API.
This script is designed to run as a scheduled job.
"""

import os
import sys
import requests
from datetime import datetime, timedelta
from garminconnect import Garmin, GarminConnectConnectionError, GarminConnectAuthenticationError
from dotenv import load_dotenv
import logging

load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def authenticate_garmin():
    """Authenticate with Garmin Connect."""
    email = os.getenv('GARMIN_EMAIL')
    password = os.getenv('GARMIN_PASSWORD')
    
    if not email or not password:
        logger.error("GARMIN_EMAIL and GARMIN_PASSWORD must be set")
        sys.exit(1)
    
    try:
        logger.info("Authenticating with Garmin Connect...")
        client = Garmin(email, password)
        client.login()
        logger.info("Authentication successful!")
        return client
    except GarminConnectAuthenticationError as e:
        logger.error(f"Authentication failed: {e}")
        sys.exit(1)
    except GarminConnectConnectionError as e:
        logger.error(f"Connection error: {e}")
        sys.exit(1)


def sync_to_api(days=7):
    """Sync data to the NestJS API."""
    api_url = os.getenv('API_URL', 'http://api:3000')
    url = f"{api_url}/v1/garmin/sync"
    
    try:
        logger.info(f"Syncing {days} days of data to API...")
        response = requests.post(
            url,
            json={'days': days},
            timeout=60
        )
        response.raise_for_status()
        result = response.json()
        
        if result.get('success'):
            logger.info("Data synced successfully to API")
            return True
        else:
            logger.error(f"API sync failed: {result}")
            return False
    except Exception as e:
        logger.error(f"Error syncing to API: {e}")
        return False


def main():
    """Main sync function."""
    days = int(os.getenv('SYNC_DAYS', '7'))
    
    logger.info(f"Starting Garmin data sync for last {days} days...")
    
    try:
        # Authenticate
        client = authenticate_garmin()
        
        # Sync to API (which will call the Python service and save to CSV)
        success = sync_to_api(days)
        
        if success:
            logger.info("Sync completed successfully")
            sys.exit(0)
        else:
            logger.error("Sync failed")
            sys.exit(1)
    except Exception as e:
        logger.error(f"Sync failed with exception: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
