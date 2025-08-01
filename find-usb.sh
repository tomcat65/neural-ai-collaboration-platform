#!/bin/bash
# USB Drive Detection and Mounting Script for WSL2

echo "🔍 USB Drive Detection for Neural AI Backup"
echo "==========================================="

echo ""
echo "📋 Step 1: Current drive situation"
echo "Available mounts in WSL2:"
ls -la /mnt/
echo ""

echo "📋 Step 2: All block devices (including USB drives)"
lsblk
echo ""

echo "📋 Step 3: Checking for removable devices"
echo "Looking for USB drives..."
lsblk -d -o NAME,SIZE,RM,TYPE | grep -E "(disk.*1|part.*1)" || echo "No removable devices found with lsblk"

echo ""
echo "📋 Step 4: Recent system messages about USB devices"
echo "Last 20 system messages (looking for USB):"
dmesg | tail -20 | grep -i -E "(usb|removable|sd[b-z])" || echo "No recent USB messages found"

echo ""
echo "📋 Step 5: Windows drives accessible from WSL2"
echo "Windows drives currently available:"
ls -la /mnt/ | grep -v "^total" | grep -v "^d.*\s\.$" | grep -v "^d.*\s\.\.$"

echo ""
echo "📋 Step 6: Manual USB detection"
echo "If you just inserted a USB drive, try:"
echo "1. Wait 10 seconds after inserting"
echo "2. Run: sudo dmesg | tail -10"
echo "3. Look for messages like 'sd 2:0:0:0: [sdb] 31116288 512-byte logical blocks'"

echo ""
echo "💡 Next steps:"
echo "1. Insert your USB drive if not already inserted"
echo "2. Wait 10 seconds"
echo "3. Run this script again"
echo "4. If you see a device like sdb1, run:"
echo "   sudo mkdir -p /mnt/usb"
echo "   sudo mount /dev/sdb1 /mnt/usb"

echo ""
echo "🔧 Alternative: Use a directory in your home folder"
echo "mkdir -p ~/neural-backup"
echo "Then modify the backup script to use ~/neural-backup instead of /mnt/usb"