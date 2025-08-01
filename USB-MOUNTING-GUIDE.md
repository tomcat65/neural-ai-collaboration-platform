# 💾 USB Drive Mounting Guide - Complete Walkthrough

## 🎯 What is "Mounting" a USB Drive?

In Linux/WSL2, unlike Windows where drives appear as `C:`, `D:`, etc., you need to **"mount"** external drives to access them. Mounting means telling the system where to access the USB drive in the file system.

---

## 🔍 **Step 1: Find Your USB Drive**

### **Insert USB Drive First**
1. **Physically insert** your USB drive into the computer
2. **Wait 3-5 seconds** for the system to detect it

### **Find the USB Device Name**
```bash
# Option 1: List all storage devices
lsblk

# You'll see output like:
# NAME   MAJ:MIN RM   SIZE RO TYPE MOUNTPOINT
# sda      8:0    0 931.5G  0 disk 
# ├─sda1   8:1    0   100M  0 part 
# ├─sda2   8:2    0    16M  0 part 
# └─sda3   8:3    0 931.4G  0 part /
# sdb      8:16   1  14.9G  0 removable  <-- This is likely your USB!
# └─sdb1   8:17   1  14.9G  0 part        <-- This is the partition
```

```bash
# Option 2: Check system messages (shows recent device additions)
dmesg | tail -20

# Look for lines like:
# [12345.678] usb 1-1: new high-speed USB device
# [12345.789] sd 2:0:0:0: [sdb] 31116288 512-byte logical blocks
# [12345.890] sdb: sdb1        <-- Your USB partition!
```

```bash
# Option 3: List USB devices specifically
sudo fdisk -l | grep -A 5 "Disk /dev/sd"

# Shows details like:
# Disk /dev/sdb: 14.9 GiB, 15931539456 bytes, 31116288 sectors
# Device     Boot Start      End  Sectors  Size Id Type
# /dev/sdb1        2048 31116287 31116240 14.9G  b W95 FAT32
```

### **Common USB Device Names**
- `/dev/sdb1` - Most common for first USB drive
- `/dev/sdc1` - If you have multiple drives
- `/dev/sdd1` - Third drive, etc.
- The **number (1)** represents the partition on the drive

---

## 📂 **Step 2: Create Mount Point**

### **What is a Mount Point?**
A mount point is just a **directory** where you'll access the USB drive contents.

```bash
# Create the directory where USB will be accessible
sudo mkdir -p /mnt/usb

# Explanation:
# - sudo: Run as administrator (needed to create in /mnt/)
# - mkdir: Create directory command
# - -p: Create parent directories if they don't exist
# - /mnt/usb: The path where you'll access your USB drive
```

### **Alternative Mount Points (You Can Choose)**
```bash
# Option 1: Standard system location
sudo mkdir -p /mnt/usb

# Option 2: In your home directory (no sudo needed)
mkdir -p ~/usb-backup

# Option 3: More descriptive name
sudo mkdir -p /mnt/neural-backup

# Option 4: In /media (another standard location)
sudo mkdir -p /media/usb
```

---

## 🔗 **Step 3: Mount the USB Drive**

### **Basic Mount Command**
```bash
# Replace sdb1 with YOUR USB device from Step 1
sudo mount /dev/sdb1 /mnt/usb

# Breaking this down:
# - sudo: Administrator privileges (needed to mount)
# - mount: The mount command
# - /dev/sdb1: Your USB device (FROM STEP 1!)
# - /mnt/usb: Where to access it (FROM STEP 2!)
```

### **Mount with Specific File System (If Needed)**
```bash
# For FAT32 USB drives (most common)
sudo mount -t vfat /dev/sdb1 /mnt/usb

# For NTFS USB drives (Windows formatted)
sudo mount -t ntfs-3g /dev/sdb1 /mnt/usb

# For exFAT USB drives (modern large drives)
sudo mount -t exfat /dev/sdb1 /mnt/usb

# For ext4 USB drives (Linux formatted)
sudo mount -t ext4 /dev/sdb1 /mnt/usb
```

---

## ✅ **Step 4: Verify the Mount Worked**

```bash
# Check if mount was successful
ls -la /mnt/usb

# You should see files/folders on your USB drive
# If empty, either:
# 1. USB is actually empty, or
# 2. Mount failed

# Check mount status
mount | grep usb
# Should show: /dev/sdb1 on /mnt/usb type vfat (rw,relatime,...)

# Check available space
df -h /mnt/usb
# Shows: Filesystem Size Used Avail Use% Mounted on
#        /dev/sdb1   15G  1.2G   14G   8% /mnt/usb
```

---

## 🚨 **Common Issues & Solutions**

### **Issue 1: "Device is busy"**
```bash
# Error: mount: /dev/sdb1 is already mounted or /mnt/usb busy

# Solution: Unmount first
sudo umount /mnt/usb
# Then try mounting again
sudo mount /dev/sdb1 /mnt/usb
```

### **Issue 2: "Permission denied"**
```bash
# Error: mount: only root can mount /dev/sdb1 on /mnt/usb

# Solution: Use sudo
sudo mount /dev/sdb1 /mnt/usb
```

### **Issue 3: "No such file or directory"**
```bash
# Error: mount: /dev/sdb1: No such file or directory

# Solution: Check device name again
lsblk
# Use the CORRECT device name (might be sdc1, sdd1, etc.)
```

### **Issue 4: "Invalid file system"**
```bash
# Error: mount: wrong fs type, bad option, bad superblock

# Solution: Specify file system type
sudo mount -t vfat /dev/sdb1 /mnt/usb    # For FAT32
sudo mount -t ntfs-3g /dev/sdb1 /mnt/usb # For NTFS
```

---

## 🔧 **Complete Example Walkthrough**

### **Real Example Session**
```bash
# Step 1: Insert USB and find it
$ lsblk
NAME   MAJ:MIN RM   SIZE RO TYPE MOUNTPOINT
sda      8:0    0 931.5G  0 disk 
└─sda3   8:3    0 931.4G  0 part /
sdb      8:16   1  29.8G  0 removable     <-- Found it!
└─sdb1   8:17   1  29.8G  0 part          <-- This is the partition

# Step 2: Create mount point
$ sudo mkdir -p /mnt/usb

# Step 3: Mount the drive
$ sudo mount /dev/sdb1 /mnt/usb

# Step 4: Verify it worked
$ ls /mnt/usb
Documents  Photos  Music     <-- USB contents visible!

$ df -h /mnt/usb
Filesystem      Size  Used Avail Use% Mounted on
/dev/sdb1        30G  2.1G   28G   7% /mnt/usb   <-- Mounted successfully!

# Now you can use /mnt/usb in the backup script!
```

---

## 🏃‍♂️ **Quick Commands for Common Scenarios**

### **For Most USB Drives (FAT32/exFAT)**
```bash
# All-in-one command
lsblk && sudo mkdir -p /mnt/usb && sudo mount /dev/sdb1 /mnt/usb && df -h /mnt/usb
```

### **Auto-Detect and Mount**
```bash
# Find USB automatically and mount it
USB_DEVICE=$(lsblk -no NAME,RM,TYPE | awk '$2=="1" && $3=="part" {print "/dev/"$1}' | head -1)
echo "Found USB: $USB_DEVICE"
sudo mkdir -p /mnt/usb
sudo mount "$USB_DEVICE" /mnt/usb
ls /mnt/usb
```

---

## 🧹 **When You're Done: Safely Unmount**

### **Always Unmount Before Removing USB**
```bash
# Unmount the USB drive
sudo umount /mnt/usb

# Verify it's unmounted
mount | grep usb
# Should show nothing

# Now it's safe to physically remove the USB drive
```

### **Force Unmount (If Stuck)**
```bash
# If normal unmount fails
sudo umount -f /mnt/usb

# Or kill processes using the mount
sudo fuser -km /mnt/usb
sudo umount /mnt/usb
```

---

## 🎯 **For Your Neural AI Backup**

### **Complete Backup Workflow**
```bash
# 1. Insert USB drive and wait 5 seconds

# 2. Find your USB device
lsblk

# 3. Mount it (replace sdb1 with YOUR device)
sudo mkdir -p /mnt/usb
sudo mount /dev/sdb1 /mnt/usb

# 4. Verify mount worked
ls /mnt/usb
df -h /mnt/usb

# 5. Run the backup
cd /home/tomcat65/projects/shared-memory-mcp
./quick-backup.sh

# 6. When backup complete, safely unmount
sudo umount /mnt/usb

# 7. Remove USB drive physically
```

---

## 💡 **WSL2 Specific Notes**

If you're in WSL2 (Windows Subsystem for Linux):

### **Method 1: Mount Windows USB**
```bash
# If USB shows up in Windows as D:
ls /mnt/d/
# Use Windows mount point directly
BACKUP_DIR="/mnt/d/neural-ai-backup-$(date +%Y%m%d_%H%M%S)"
```

### **Method 2: WSL2 USB Passthrough (Advanced)**
```bash
# Requires Windows 11 or Windows 10 with recent updates
# USB device must be attached to WSL2
usbipd wsl list          # From Windows PowerShell
usbipd wsl attach -d Ubuntu -b <busid>  # From Windows PowerShell
# Then use normal Linux mounting in WSL2
```

---

## ✅ **Summary**

1. **Find USB**: `lsblk` to see `/dev/sdb1` (or similar)
2. **Create mount point**: `sudo mkdir -p /mnt/usb`
3. **Mount**: `sudo mount /dev/sdb1 /mnt/usb`
4. **Verify**: `ls /mnt/usb` and `df -h /mnt/usb`
5. **Use**: `/mnt/usb` is now your USB drive location
6. **Unmount when done**: `sudo umount /mnt/usb`

**Your USB drive is now accessible at `/mnt/usb` for the backup script! 🎉**