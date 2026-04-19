#!/usr/bin/env python3
"""
Garmin Body Battery Service
Flask API for fetching Body Battery and other Garmin data.
"""

import os
import sys
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
from garminconnect import Garmin, GarminConnectConnectionError, GarminConnectAuthenticationError
from dotenv import load_dotenv
import logging
import threading
import garth.sso as garth_sso
from garth.exc import GarthException

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

_client_lock = threading.Lock()
_cached_client = None

def _patch_garth_login():
    """Patch garth login to handle Garmin's alternate login title."""
    if getattr(garth_sso, "_corpus_patched", False):
        return

    original_login = garth_sso.login

    def patched_login(*args, **kwargs):
        try:
            return original_login(*args, **kwargs)
        except GarthException as e:
            if "Unexpected title: GARMIN Authentication Application" in str(e):
                client = kwargs.get("client")
                if client and garth_sso.re.search(r'embed\\?ticket=', client.last_resp.text):
                    return garth_sso._complete_login(client)
            raise

    garth_sso.login = patched_login
    garth_sso._corpus_patched = True

def _login_garmin(client):
    """Login using tokenstore when available to avoid repeated auth."""
    _patch_garth_login()
    tokenstore = os.getenv('GARMINTOKENS')
    try:
        if tokenstore and len(tokenstore) <= 512:
            os.makedirs(tokenstore, exist_ok=True)
            try:
                client.login(tokenstore=tokenstore)
                return
            except FileNotFoundError:
                logger.info("Garmin tokenstore not found, falling back to credential login.")
        original_tokenstore = os.environ.pop('GARMINTOKENS', None)
        try:
            client.login()
        finally:
            if original_tokenstore is not None:
                os.environ['GARMINTOKENS'] = original_tokenstore
        if tokenstore and len(tokenstore) <= 512:
            try:
                client.garth.dump(tokenstore)
            except Exception as e:
                logger.warning(f"Failed to persist Garmin tokens: {e}")
    except Exception:
        raise

def get_garmin_client():
    """Get authenticated Garmin client with in-process caching."""
    email = os.getenv('GARMIN_EMAIL')
    password = os.getenv('GARMIN_PASSWORD')
    
    if not email or not password:
        logger.error("GARMIN_EMAIL and GARMIN_PASSWORD must be set")
        raise ValueError("Garmin credentials not configured")
    
    global _cached_client
    with _client_lock:
        if _cached_client is not None:
            return _cached_client

        try:
            logger.info("Authenticating with Garmin Connect...")
            client = Garmin(email, password)

            # Workaround for Garth profile assertion error during login
            try:
                _login_garmin(client)
            except AssertionError:
                # Profile loading failed during login, set a default display name and continue
                logger.warning("Profile assertion error during login, applying workaround...")
                client.display_name = email.split('@')[0]

            logger.info("Authentication successful!")
            _cached_client = client
            return client
        except GarminConnectAuthenticationError as e:
            logger.error(f"Authentication failed: {e}")
            raise
        except GarminConnectConnectionError as e:
            logger.error(f"Connection error: {e}")
            raise


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'service': 'garmin-service',
        'timestamp': datetime.now().isoformat()
    })


@app.route('/api/body-battery', methods=['GET'])
def get_body_battery():
    """
    Fetch Body Battery data for a specific date or date range.
    Query params:
        - date: Single date in YYYY-MM-DD format (defaults to today)
        - start_date: Start of date range in YYYY-MM-DD format
        - end_date: End of date range in YYYY-MM-DD format
    """
    try:
        client = get_garmin_client()
        
        # Check if we're fetching a range
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if start_date and end_date:
            # Fetch date range
            data = fetch_date_range(client, start_date, end_date, 'body_battery')
            return jsonify({
                'success': True,
                'data': data,
                'range': {'start': start_date, 'end': end_date}
            })
        else:
            # Fetch single date
            date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
            data = client.get_body_battery(date)
            return jsonify({
                'success': True,
                'data': data,
                'date': date
            })
    
    except ValueError as e:
        logger.error(f"Configuration error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
    except Exception as e:
        logger.error(f"Error fetching Body Battery data: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/hrv', methods=['GET'])
def get_hrv():
    """
    Fetch HRV (Heart Rate Variability) data from Garmin.
    Query params:
        - date: Single date in YYYY-MM-DD format (defaults to today)
        - start_date: Start of date range in YYYY-MM-DD format
        - end_date: End of date range in YYYY-MM-DD format
    """
    try:
        client = get_garmin_client()
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if start_date and end_date:
            data = fetch_date_range(client, start_date, end_date, 'hrv')
            return jsonify({
                'success': True,
                'data': data,
                'range': {'start': start_date, 'end': end_date}
            })
        else:
            date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
            data = client.get_hrv_data(date)
            return jsonify({
                'success': True,
                'data': data,
                'date': date
            })
    
    except Exception as e:
        logger.error(f"Error fetching HRV data: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/resting-heart-rate', methods=['GET'])
def get_resting_heart_rate():
    """
    Fetch Resting Heart Rate data from Garmin.
    Query params:
        - date: Single date in YYYY-MM-DD format (defaults to today)
        - start_date: Start of date range in YYYY-MM-DD format
        - end_date: End of date range in YYYY-MM-DD format
    """
    try:
        client = get_garmin_client()
        
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        
        if start_date and end_date:
            data = fetch_date_range(client, start_date, end_date, 'rhr')
            return jsonify({
                'success': True,
                'data': data,
                'range': {'start': start_date, 'end': end_date}
            })
        else:
            date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
            # Get heart rate data and extract resting HR
            data = client.get_heart_rates(date)
            return jsonify({
                'success': True,
                'data': data,
                'date': date
            })
    
    except Exception as e:
        logger.error(f"Error fetching Resting HR data: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sleep', methods=['GET'])
def get_sleep():
    """
    Fetch sleep data from Garmin.
    Query params:
        - date: Single date in YYYY-MM-DD format (defaults to today)
        - start_date: Start of date range in YYYY-MM-DD format
        - end_date: End of date range in YYYY-MM-DD format
    """
    try:
        client = get_garmin_client()

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        if start_date and end_date:
            data = fetch_date_range(client, start_date, end_date, 'sleep')
            return jsonify({
                'success': True,
                'data': data,
                'range': {'start': start_date, 'end': end_date}
            })
        else:
            date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
            data = client.get_sleep_data(date)
            return jsonify({
                'success': True,
                'data': data,
                'date': date
            })

    except Exception as e:
        logger.error(f"Error fetching sleep data: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/stats', methods=['GET'])
def get_stats():
    """
    Fetch daily stats data from Garmin.
    Query params:
        - date: Single date in YYYY-MM-DD format (defaults to today)
        - start_date: Start of date range in YYYY-MM-DD format
        - end_date: End of date range in YYYY-MM-DD format
    """
    try:
        client = get_garmin_client()

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        if start_date and end_date:
            data = fetch_date_range(client, start_date, end_date, 'stats')
            return jsonify({
                'success': True,
                'data': data,
                'range': {'start': start_date, 'end': end_date}
            })
        else:
            date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
            data = client.get_stats(date)
            return jsonify({
                'success': True,
                'data': data,
                'date': date
            })

    except Exception as e:
        logger.error(f"Error fetching stats data: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/activities', methods=['GET'])
def get_activities():
    """
    Fetch activities from Garmin.
    Query params:
        - start_date: Start of date range in YYYY-MM-DD format
        - end_date: End of date range in YYYY-MM-DD format
        - limit: Max activities to fetch (defaults to 200)
    """
    try:
        client = get_garmin_client()

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        limit = int(request.args.get('limit', 200))

        data = fetch_activities_range(client, start_date, end_date, limit)
        return jsonify({
            'success': True,
            'data': data,
            'range': {'start': start_date, 'end': end_date},
            'limit': limit
        })

    except Exception as e:
        logger.error(f"Error fetching activities: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/sync', methods=['POST'])
def sync_all_data():
    """
    Sync all Garmin data for the last N days.
    Body params:
        - days: Number of days to sync (defaults to 7)
    """
    try:
        client = get_garmin_client()
        
        days = request.json.get('days', 7) if request.is_json else 7
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days - 1)
        
        start_str = start_date.strftime('%Y-%m-%d')
        end_str = end_date.strftime('%Y-%m-%d')
        
        logger.info(f"Syncing data from {start_str} to {end_str}")
        
        # Fetch all data types
        body_battery = fetch_date_range(client, start_str, end_str, 'body_battery')
        hrv = fetch_date_range(client, start_str, end_str, 'hrv')
        rhr = fetch_date_range(client, start_str, end_str, 'rhr')
        sleep = fetch_date_range(client, start_str, end_str, 'sleep')
        stats = fetch_date_range(client, start_str, end_str, 'stats')
        body_composition = fetch_body_composition_range(client, start_str, end_str)
        # Activities: fetch recent list and optionally filter; do not require range
        activities = fetch_activities_range(client, None, None, 300)
        
        return jsonify({
            'success': True,
            'data': {
                'body_battery': body_battery,
                'hrv': hrv,
                'rhr': rhr,
                'sleep': sleep,
                'stats': stats,
                'activities': activities,
                'body_composition': body_composition
            },
            'range': {'start': start_str, 'end': end_str}
        })
    
    except Exception as e:
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Error syncing data: {type(e).__name__}: {str(e)}")
        logger.error(f"Full traceback:\n{error_details}")
        return jsonify({'success': False, 'error': f"{type(e).__name__}: {str(e)}", 'traceback': error_details}), 500


def fetch_date_range(client, start_date, end_date, data_type):
    """
    Fetch data for a date range.
    
    Args:
        client: Authenticated Garmin client
        start_date: Start date string in 'YYYY-MM-DD' format
        end_date: End date string in 'YYYY-MM-DD' format
        data_type: Type of data to fetch ('body_battery', 'hrv', 'rhr')
    
    Returns:
        Dictionary with dates as keys and data as values
    """
    start = datetime.strptime(start_date, '%Y-%m-%d')
    end = datetime.strptime(end_date, '%Y-%m-%d')
    
    all_data = {}
    current = start
    
    while current <= end:
        date_str = current.strftime('%Y-%m-%d')
        try:
            logger.info(f"Fetching {data_type} for {date_str}...")
            if data_type == 'body_battery':
                data = client.get_body_battery(date_str)
            elif data_type == 'hrv':
                data = client.get_hrv_data(date_str)
            elif data_type == 'rhr':
                data = client.get_heart_rates(date_str)
            elif data_type == 'sleep':
                data = client.get_sleep_data(date_str)
            elif data_type == 'stats':
                data = client.get_stats(date_str)
            else:
                data = None
            
            logger.info(f"  Got {len(data) if isinstance(data, list) else type(data).__name__} for {date_str}")
            
            if data:
                all_data[date_str] = data
                logger.info(f"  ✓ Saved {len(data) if isinstance(data, list) else 1} items for {date_str}")
            else:
                logger.warning(f"  ✗ No data for {date_str}")
        except Exception as e:
            import traceback
            logger.error(f"Error fetching {data_type} for {date_str}: {type(e).__name__}: {e}")
            logger.error(traceback.format_exc())
        
        current += timedelta(days=1)
    
    logger.info(f"Fetch complete: {len(all_data)} days with data")
    return all_data


@app.route('/api/body-composition', methods=['GET'])
def get_body_composition():
    """
    Fetch body composition (weight, body fat, etc.) from Garmin.
    Query params:
        - date: Single date in YYYY-MM-DD format (defaults to today)
        - start_date: Start of date range in YYYY-MM-DD format
        - end_date: End of date range in YYYY-MM-DD format
    """
    try:
        client = get_garmin_client()

        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        if start_date and end_date:
            data = fetch_body_composition_range(client, start_date, end_date)
            return jsonify({
                'success': True,
                'data': data,
                'range': {'start': start_date, 'end': end_date}
            })
        else:
            date = request.args.get('date', datetime.now().strftime('%Y-%m-%d'))
            data = client.get_body_composition(date)
            return jsonify({
                'success': True,
                'data': data,
                'date': date
            })

    except Exception as e:
        logger.error(f"Error fetching body composition: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


def fetch_body_composition_range(client, start_date, end_date):
    """Fetch body composition data for a date range."""
    try:
        data = client.get_body_composition(start_date, end_date)
        return data or {}
    except Exception as e:
        logger.error(f"Error fetching body composition range: {e}")
        return {}


def parse_activity_date(activity):
    """Extract YYYY-MM-DD date from a Garmin activity."""
    if not isinstance(activity, dict):
        return None
    for key in ['startTimeGMT', 'startTimeLocal', 'startTime']:
        value = activity.get(key)
        if value:
            if isinstance(value, (int, float)):
                # Assume seconds if < 1e12, otherwise milliseconds
                timestamp = value / 1000 if value > 1e12 else value
                return datetime.utcfromtimestamp(timestamp).strftime('%Y-%m-%d')
            if isinstance(value, str):
                return value.split('T')[0]
    return None


def fetch_activities_range(client, start_date, end_date, limit=200):
    """Fetch activities and filter by date range."""
    activities = []

    try:
        if hasattr(client, 'get_activities'):
            activities = client.get_activities(0, limit)
        elif hasattr(client, 'get_activities_by_date') and start_date and end_date:
            activities = client.get_activities_by_date(start_date, end_date)
        else:
            logger.warning("Garmin client has no activities method available")
            return []
    except Exception as e:
        logger.error(f"Error fetching activities list: {e}")
        return []

    if start_date and end_date:
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        filtered = []
        for activity in activities:
            activity_date = parse_activity_date(activity)
            if not activity_date:
                continue
            try:
                activity_dt = datetime.strptime(activity_date, '%Y-%m-%d')
            except ValueError:
                continue
            if start <= activity_dt <= end:
                filtered.append(activity)
        activities = filtered

    return activities


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)
