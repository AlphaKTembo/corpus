# User Data & Folder Structure Explanation

## Current System: Single-User

**Important**: Corpus is currently a **single-user system**. This means:

- ✅ **One user account** (configured via `SINGLE_USER_USERNAME`)
- ✅ **All data is shared** - CSV files, activities, metrics, notes all belong to the same user
- ✅ **No user isolation** - everything is stored in the same Parquet files

## Folder Structure

### Automatic Folder Creation ✅

**Folders ARE automatically created** when needed:

- `raw/csv/` - Created when copying CSV files
- `raw/fit/` - Created when copying FIT files  
- `canonical/` - Created when writing Parquet files
- `derived/` - Created when computing derived datasets
- `metadata/` - Created when saving manifests/status

All services use `fs.mkdirSync(..., { recursive: true })` to auto-create directories.

### CSV File Handling

**CSV files are NOT per-user**:

1. **Source Location**: `/data/drive_sync/TrainingPeaks/` (or your configured `DRIVE_SYNC_ROOT`)
   - You place CSV files here manually or via cloud sync
   - All files in this folder are processed

2. **Raw Storage**: `/data/corpus/raw/csv/`
   - All CSV files are copied here (immutable copies)
   - Files are organized by relative path from source

3. **Processed Data**: `/data/corpus/canonical/activities.parquet`
   - All activities from all CSV files are merged into one Parquet file
   - No user separation

## Example Flow

```
User places CSV files:
/data/drive_sync/TrainingPeaks/
  ├── 2024-01-15_activities.csv
  ├── 2024-01-16_activities.csv
  └── subfolder/
      └── 2024-01-17_activities.csv

Worker syncs:
→ Copies to /data/corpus/raw/csv/ (preserving structure)
→ Processes all files
→ Merges into /data/corpus/canonical/activities.parquet
→ All activities from all files appear in dashboard
```

## Initialization

Run once to ensure all directories exist:

```bash
docker compose run --rm worker init
```

Or directories will be auto-created on first use.

## Multi-User Support (Future)

If you need multi-user support, you would need to:

1. Add user_id to all Parquet schemas
2. Filter queries by user_id
3. Store data per-user: `/data/corpus/users/{user_id}/...`
4. Update authentication to support multiple users

Currently, the system is designed for **personal use** - one person managing their own fitness data.

