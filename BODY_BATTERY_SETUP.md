# 🔋 Body Battery Integration - Complete Setup Guide

## Overview

Your Corpus fitness tracking system now has **full Garmin Body Battery integration**! This comprehensive implementation includes:

✅ **Python Garmin Service** - Fetches data directly from Garmin Connect  
✅ **NestJS API Integration** - Processes and stores Body Battery data  
✅ **CSV Storage** - Persistent data storage in `/data/corpus/metadata/`  
✅ **Frontend Charts** - Beautiful visualizations on metrics and dashboard pages  
✅ **Recovery Score** - Body Battery integrated into your recovery calculation  
✅ **Automated Sync** - Daily cron jobs to keep data fresh  

---

## 🚀 Quick Start

### Step 1: Add Garmin Credentials

Edit your `.env` file:

```bash
cd /www/wwwroot/corpus.kurasika.tech/infra
nano .env
```

Add these lines:

```env
GARMIN_EMAIL=your-garmin-email@example.com
GARMIN_PASSWORD=your-garmin-password
```

### Step 2: Verify Services are Running

```bash
cd /www/wwwroot/corpus.kurasika.tech/infra
docker compose ps
```

You should see:
- ✅ `corpus-garmin` - Python Garmin service (port 5001)
- ✅ `corpus-api` - NestJS API (port 3000)
- ✅ `corpus-web` - Next.js frontend
- ✅ `corpus-nginx` - Reverse proxy (ports 8080/8443)

### Step 3: Test the Integration

#### Check Garmin Service Health
```bash
curl http://localhost:5001/health
```

Expected response:
```json
{
  "status": "healthy",
  "service": "garmin-service",
  "timestamp": "2026-01-13T18:37:14.296900"
}
```

#### Sync Your First Data
```bash
curl -X POST http://localhost:3000/v1/garmin/sync \
  -H "Content-Type: application/json" \
  -d '{"days": 7}'
```

This will fetch the last 7 days of:
- Body Battery data
- HRV (Heart Rate Variability)
- Resting Heart Rate

#### Check the Data
```bash
# View Body Battery CSV
head /data/corpus/metadata/body_battery.csv

# View HRV CSV
head /data/corpus/metadata/hrv_garmin.csv
```

### Step 4: View in Dashboard

Open your browser and navigate to:
- **Dashboard**: `https://your-domain:8443/dashboard`
- **Metrics**: `https://your-domain:8443/metrics`

You should see:
- 📊 Body Battery chart showing energy levels (0-100)
- 💚 High energy zones (75+)
- 🟡 Medium energy zones (25-75)
- 🔴 Low energy zones (<25)

---

## 📊 Data Storage

### Body Battery CSV Format
**Location**: `/data/corpus/metadata/body_battery.csv`

```csv
date,timestamp,level,status
2026-01-13,1705161600000,85,CHARGED
2026-01-13,1705165200000,82,DRAINING
```

Fields:
- `date`: YYYY-MM-DD format
- `timestamp`: Unix timestamp in milliseconds
- `level`: Body Battery level (0-100)
- `status`: CHARGED, DRAINING, or UNKNOWN

### HRV CSV Format
**Location**: `/data/corpus/metadata/hrv_garmin.csv`

```csv
date,hrv_ms,timestamp
2026-01-13,55,1705161600000
```

---

## 🔄 Recovery Score Integration

Body Battery is now a key factor in your recovery score calculation:

### Recovery Score Algorithm

Your recovery score (0-100) is calculated using:

1. **Training Load (TSS)** - 40 points max penalty
   - TSS > 600: -40 points (OVERREACH flag)
   - TSS > 500: -30 points (HIGH_LOAD flag)
   - TSS > 400: -20 points
   - TSS > 300: -10 points

2. **Training Volume** - 15 points max penalty
   - >10 hours/week: -15 points (FATIGUE flag)

3. **Resting Heart Rate Delta** - 20 points max penalty
   - RHR +5 bpm: -20 points (ELEVATED_RHR flag)
   - RHR +3 bpm: -10 points
   - RHR -3 bpm: +5 bonus points

4. **Sleep Debt** - 25 points max penalty
   - >2 hours deficit: -25 points (SLEEP_DEFICIT flag)
   - >1 hour deficit: -15 points
   - >30 min deficit: -5 points

5. **🆕 Body Battery** - 20 points max penalty / 5 bonus
   - Body Battery < 25: -20 points (LOW_BODY_BATTERY flag)
   - Body Battery < 50: -10 points
   - Body Battery ≥ 75: +5 bonus points

### Recovery Status Thresholds
- **🟢 Green (70-100)**: Well recovered, ready for intensity
- **🟡 Yellow (40-69)**: Moderate recovery, easy training recommended
- **🔴 Red (<40)**: Poor recovery, rest day recommended

---

## ⚙️ API Endpoints

### Garmin Service (Python) - Port 5001

```bash
# Health check
GET http://localhost:5001/health

# Get Body Battery for a specific date
GET http://localhost:5001/api/body-battery?date=2026-01-13

# Get Body Battery for a date range
GET http://localhost:5001/api/body-battery?start_date=2026-01-01&end_date=2026-01-13

# Get HRV data
GET http://localhost:5001/api/hrv?date=2026-01-13

# Get Resting Heart Rate
GET http://localhost:5001/api/resting-heart-rate?date=2026-01-13

# Sync all data types
POST http://localhost:5001/api/sync
Body: {"days": 7}
```

### NestJS API - Port 3000

```bash
# Check Garmin service health
GET http://localhost:3000/v1/garmin/health

# Sync data (fetches from Garmin and saves to CSV)
POST http://localhost:3000/v1/garmin/sync
Body: {"days": 7}

# Get Body Battery data
GET http://localhost:3000/v1/garmin/body-battery?date=2026-01-13

# Get aggregated Body Battery metrics
GET http://localhost:3000/v1/metrics/body-battery?from=2026-01-01&to=2026-01-13
```

Response format:
```json
[
  {
    "date": "2026-01-13",
    "level_avg": 75.5,
    "level_min": 45,
    "level_max": 95,
    "charged_total": 120,
    "drained_total": 85,
    "points": [...]
  }
]
```

---

## 🤖 Automated Sync Setup

### Option 1: Setup Cron (Recommended)

Run the setup script:

```bash
cd /www/wwwroot/corpus.kurasika.tech/infra
./setup-garmin-cron.sh
```

This will:
- ✅ Create a cron job that runs daily at 6:00 AM
- ✅ Sync the last 7 days of data
- ✅ Log results to `infra/logs/garmin-sync.log`

To verify:
```bash
crontab -l
```

You should see:
```
0 6 * * * cd /www/wwwroot/corpus.kurasika.tech/infra && ./sync-garmin.sh >> /www/wwwroot/corpus.kurasika.tech/infra/logs/garmin-sync.log 2>&1
```

### Option 2: Manual Sync Script

Run anytime to sync manually:

```bash
cd /www/wwwroot/corpus.kurasika.tech/infra
./sync-garmin.sh
```

### Check Sync Logs

```bash
tail -f /www/wwwroot/corpus.kurasika.tech/infra/logs/garmin-sync.log
```

---

## 📱 Frontend Integration

### Metrics Page (`/metrics`)

Navigate to the **Vitals** tab to see:

**Body Battery (Garmin)** chart showing:
- 📈 **Average Level** (green line)
- 📊 **Max Level** (blue dashed line)
- 📉 **Min Level** (orange dashed line)
- Reference lines at 75 (High Energy) and 25 (Low Energy)

### Dashboard Page (`/dashboard`)

In the **Activity Analytics** section:

**Body Battery** card displays:
- 7-day trend of your energy levels
- Integration with other recovery metrics
- Tooltip showing exact values

---

## 🔧 Troubleshooting

### Issue: No Data Appearing

1. **Check if sync ran successfully:**
   ```bash
   curl -X POST http://localhost:3000/v1/garmin/sync \
     -H "Content-Type: application/json" \
     -d '{"days": 7}'
   ```

2. **Verify CSV files exist:**
   ```bash
   ls -lh /data/corpus/metadata/body_battery.csv
   cat /data/corpus/metadata/body_battery.csv | head
   ```

3. **Check service logs:**
   ```bash
   docker compose logs garmin
   docker compose logs api
   ```

### Issue: Authentication Failed

Check your credentials:
```bash
cat /www/wwwroot/corpus.kurasika.tech/infra/.env | grep GARMIN
```

Ensure:
- ✅ `GARMIN_EMAIL` is set correctly
- ✅ `GARMIN_PASSWORD` is set correctly
- ✅ Credentials work on Garmin Connect website

### Issue: Garmin Service Not Running

```bash
# Check service status
docker compose ps garmin

# Restart service
docker compose restart garmin

# View logs
docker compose logs garmin --tail=50
```

### Issue: Port 5001 Already in Use

Edit `docker-compose.yml` and change the external port:
```yaml
ports:
  - "5002:5000"  # Change 5002 to any available port
```

Then restart:
```bash
docker compose up -d garmin
```

### Issue: Empty Charts on Frontend

1. **Hard refresh the browser** (Ctrl+Shift+R or Cmd+Shift+R)
2. **Clear browser cache**
3. **Check API response:**
   ```bash
   curl http://localhost:3000/v1/metrics/body-battery | jq .
   ```

---

## 📈 Understanding Body Battery

### What is Body Battery?

Garmin Body Battery is a proprietary metric that estimates your energy reserves on a scale of 0-100. It's calculated based on:

- **Heart Rate Variability (HRV)** - Higher HRV = better recovery
- **Stress Levels** - Lower stress = faster charging
- **Sleep Quality** - Deep sleep charges your battery
- **Physical Activity** - Exercise drains your battery

### How to Use It

**High Body Battery (75-100):**
- ✅ Good time for intense workouts
- ✅ Tackle challenging tasks
- ✅ Your body is well-recovered

**Medium Body Battery (25-75):**
- ⚠️ Moderate activities recommended
- ⚠️ Listen to your body
- ⚠️ Consider easy training

**Low Body Battery (<25):**
- 🛑 Prioritize rest and recovery
- 🛑 Avoid intense exercise
- 🛑 Focus on sleep and stress reduction

### Charging Your Battery

To improve your Body Battery:
- 😴 Get 7-9 hours of quality sleep
- 🧘 Manage stress through meditation/relaxation
- 🥗 Maintain good nutrition and hydration
- 📵 Reduce screen time before bed
- 🚫 Avoid alcohol (significantly impacts recovery)

---

## 🎯 Next Steps

1. **Set up your Garmin credentials** in `.env`
2. **Run your first sync** to fetch historical data
3. **Setup the cron job** for daily automated sync
4. **Check the dashboard** to see your Body Battery trends
5. **Monitor your recovery score** to optimize training

---

## 📚 Additional Resources

- **Full Documentation**: `/www/wwwroot/corpus.kurasika.tech/infra/README-GARMIN.md`
- **Garmin Connect**: https://connect.garmin.com
- **Python Garmin Library**: https://github.com/cyberjunky/python-garminconnect

---

## 🆘 Support

If you encounter any issues:

1. Check the logs: `docker compose logs garmin api`
2. Review this guide's troubleshooting section
3. Test API endpoints manually with curl
4. Verify your Garmin credentials are correct

---

**🎉 Congratulations!** Your Body Battery integration is complete and ready to help optimize your training and recovery!
