/**
 * Backup Scheduler - Runs automatic backups hourly
 * Initialize this at server startup to enable automated backups
 */

let backupInterval: NodeJS.Timeout | null = null;

export function startBackupScheduler() {
  if (backupInterval) {
    console.log('[Backup Scheduler] Already running');
    return;
  }

  console.log('[Backup Scheduler] Starting hourly backup scheduler...');

  // Run backup immediately on startup
  performBackup();

  // Then run every hour (3600000 ms)
  backupInterval = setInterval(() => {
    performBackup();
  }, 60 * 60 * 1000); // 1 hour

  // Also log next scheduled backup
  logNextBackup();
}

export function stopBackupScheduler() {
  if (backupInterval) {
    clearInterval(backupInterval);
    backupInterval = null;
    console.log('[Backup Scheduler] Stopped');
  }
}

async function performBackup() {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/hand/auto-backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const result = await response.json();
    
    if (result.success) {
      console.log(`✅ [Backup Scheduler] ${result.message}`);
    } else {
      console.error(`❌ [Backup Scheduler] ${result.message}`);
    }
  } catch (error: any) {
    console.error(`❌ [Backup Scheduler] Backup failed:`, error.message);
  }
}

function logNextBackup() {
  const next = new Date(Date.now() + 60 * 60 * 1000);
  console.log(`[Backup Scheduler] Next backup scheduled for: ${next.toISOString()}`);
}
