# Engram DB — Backup & Restore (WSL2 → D: USB drive)

How to back up and restore the Engram database. The DB is the **single source of
truth**, so take a verified backup before migrations, big deletes, or risky changes.

> **WSL2 note (important):** under WSL2 you do **not** mount the D: drive with
> `lsblk`/`sudo mount`. Windows drives are auto-mounted — your **D:** USB drive is
> already at **`/mnt/d/`**. (Raw Linux mounting is only relevant outside WSL2; see the
> appendix.)

## Key facts

| Thing | Value |
|-------|-------|
| Container | `unified-unified-neural-mcp-1` |
| Docker volume | `unified_unified_neural_data` → `/app/data` |
| Live DB | `/app/data/unified-platform.db` (**WAL mode** → also `-wal`, `-shm`) |
| Backup folder | `/mnt/d/Backups/Neural/` |
| File convention | `unified-platform-<tag>-<UTC-timestamp>.db` (e.g. `…-predeploy-20260531T034015Z.db`) |
| Bring up / down | `~/bin/neural-unified-up` · `~/bin/neural-unified-down` |
| Health | `curl http://localhost:6174/health` |

Because the DB runs in WAL mode, **always use SQLite's online `.backup`** (or stop the
stack first) — a plain `cp` of the live `.db` can miss the `-wal` and produce a torn copy.

## Backup (live, no downtime)

Runs an online, consistent `.backup` inside the container, integrity-checks it, then
copies it to D:. Verified end-to-end.

```bash
CONTAINER=unified-unified-neural-mcp-1
DEST=/mnt/d/Backups/Neural
TS=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$DEST"

# 1. consistent online snapshot inside the container (WAL-safe)
docker exec "$CONTAINER" sh -lc \
  "mkdir -p /app/data/backups && sqlite3 /app/data/unified-platform.db \".backup '/app/data/backups/snap-$TS.db'\""

# 2. integrity check (expect: ok)
docker exec "$CONTAINER" sqlite3 "/app/data/backups/snap-$TS.db" "PRAGMA integrity_check;"

# 3. copy the single-file snapshot out to the D: drive
docker cp "$CONTAINER:/app/data/backups/snap-$TS.db" "$DEST/unified-platform-$TS.db"

# 4. remove the in-container temp + confirm the file on D:
docker exec "$CONTAINER" rm -f "/app/data/backups/snap-$TS.db"
ls -la "$DEST/unified-platform-$TS.db"
```

A `.backup` snapshot is a **single self-contained `.db` file** — there are no `-wal`/`-shm`
sidecars to copy (any you see on D: came from older raw-file copies and aren't needed).

## Restore

Replaces the DB inside the named volume with a chosen snapshot. Verified against a
throwaway volume; the copy + `PRAGMA integrity_check` pass.

```bash
CONTAINER=unified-unified-neural-mcp-1
VOLUME=unified_unified_neural_data
BACKUP=/mnt/d/Backups/Neural/unified-platform-YYYYMMDDThhmmssZ.db   # ← pick the snapshot

# 1. stop the stack
~/bin/neural-unified-down

# 2. copy the snapshot into the volume as the live DB, dropping stale WAL/SHM sidecars
docker run --rm -v "$VOLUME":/data -v /mnt/d/Backups/Neural:/bk:ro alpine sh -lc \
  "cp '/bk/$(basename "$BACKUP")' /data/unified-platform.db \
   && rm -f /data/unified-platform.db-wal /data/unified-platform.db-shm \
   && ls -la /data/unified-platform.db*"

# 3. (optional) integrity-check before starting
docker run --rm --user root -v "$VOLUME":/data --entrypoint sh \
  "$(docker inspect --format '{{.Config.Image}}' "$CONTAINER" 2>/dev/null || echo unified-unified-neural-mcp)" \
  -lc "sqlite3 /data/unified-platform.db 'PRAGMA integrity_check;'" 2>/dev/null || true

# 4. bring it back up and verify
~/bin/neural-unified-up
sleep 5 && curl -s http://localhost:6174/health
```

## Housekeeping

- Keep snapshots with descriptive tags: `…-predeploy-…`, `…-pre-gc-…`, `…-pre-migration-…`.
- The big `.db` files are ~300 MB each — prune old ones on D: periodically.
- The dated subfolders on D: (`/mnt/d/Backups/Neural/2026-0x-xx/`) are older manual batches.

## Notes & caveats

- **Built-in backup feature (not wired up yet).** The server has an internal snapshot
  capability (`getBackupLocations()` + better-sqlite3 `.backup()`), surfaced through the
  data-management API (`/api/data/snapshot`). It's **disabled by default**
  (`ENABLE_DATA_MANAGEMENT` unset), and its external-drive auto-discovery needs the host
  drive mounted into the container as `/host-drives` plus `BACKUP_AUTODISCOVER=true` —
  neither is in the current compose. Until that's set up, use the manual method above.
- **`restore-from-backup.sh` (repo root) is stale.** It calls the removed
  `neural-ai-control.sh`, assumes a legacy multi-volume `tar.gz` layout, and uses the old
  WS port. Don't use it — follow the steps above.

## Appendix — raw USB mounting (non-WSL2 only)

Only needed on bare Linux (or for a drive WSL2 doesn't auto-mount). Under WSL2, prefer
`/mnt/d`.

```bash
lsblk                                  # find the device, e.g. /dev/sdb1
sudo mkdir -p /mnt/usb
sudo mount /dev/sdb1 /mnt/usb          # add -t exfat / ntfs-3g / vfat if needed
# … use it …
sudo umount /mnt/usb
```

To pass a physical USB device through to WSL2 itself (rarely needed — `/mnt/<letter>`
already works), use `usbipd` from Windows PowerShell:

```powershell
usbipd list
usbipd attach --wsl --busid <busid>
```
