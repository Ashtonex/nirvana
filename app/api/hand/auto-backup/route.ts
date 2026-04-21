import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Create timestamped backup of entire database to /backups folder
 * Can be called via: POST /api/hand/auto-backup
 */
export async function POST(request: Request) {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    
    // Create backups directory if it doesn't exist
    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch (e) {
      // Directory already exists
    }

    // Get current timestamp
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2026-04-21T10-30-45
    const backupFileName = `backup-${timestamp}.json`;
    const backupPath = path.join(backupDir, backupFileName);

    // Fetch all data from Supabase
    const [
      { data: sales },
      { data: ledger },
      { data: operations },
      { data: inventory },
      { data: shops },
      { data: employees }
    ] = await Promise.all([
      supabaseAdmin.from('sales').select('*'),
      supabaseAdmin.from('ledger_entries').select('*'),
      supabaseAdmin.from('operations_ledger').select('*'),
      supabaseAdmin.from('inventory_items').select('*'),
      supabaseAdmin.from('shops').select('*'),
      supabaseAdmin.from('employees').select('*')
    ]);

    const backup = {
      timestamp: now.toISOString(),
      version: '1.0',
      database: 'postgresql',
      tables: {
        sales: sales || [],
        ledger_entries: ledger || [],
        operations_ledger: operations || [],
        inventory_items: inventory || [],
        shops: shops || [],
        employees: employees || []
      },
      stats: {
        sales_count: sales?.length || 0,
        ledger_count: ledger?.length || 0,
        operations_count: operations?.length || 0,
        inventory_count: inventory?.length || 0
      }
    };

    // Write backup file
    await fs.writeFile(backupPath, JSON.stringify(backup, null, 2));

    // Also update the local db.json for quick access
    const dbPath = path.join(process.cwd(), 'lib', 'db.json');
    try {
      const dbContent = await fs.readFile(dbPath, 'utf-8');
      const db = JSON.parse(dbContent);
      db.lastBackup = now.toISOString();
      db.backupFile = backupFileName;
      await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
    } catch (e) {
      console.warn('Could not update db.json with backup info:', e);
    }

    // Clean old backups (keep only last 30 days)
    try {
      const files = await fs.readdir(backupDir);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      for (const file of files) {
        if (file.startsWith('backup-') && file.endsWith('.json')) {
          const filePath = path.join(backupDir, file);
          const stat = await fs.stat(filePath);
          if (stat.mtime < thirtyDaysAgo) {
            await fs.unlink(filePath);
            console.log(`Deleted old backup: ${file}`);
          }
        }
      }
    } catch (e) {
      console.warn('Could not cleanup old backups:', e);
    }

    return NextResponse.json({
      success: true,
      message: `Backup created: ${backupFileName}`,
      backup: {
        file: backupFileName,
        timestamp: now.toISOString(),
        stats: backup.stats
      }
    });
  } catch (error: any) {
    console.error('Backup failed:', error);
    return NextResponse.json({
      success: false,
      message: `Backup failed: ${error.message}`
    }, { status: 500 });
  }
}

/**
 * GET backup status and list available backups
 */
export async function GET(request: Request) {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    
    let files: string[] = [];
    try {
      files = await fs.readdir(backupDir);
    } catch {
      // Directory doesn't exist yet
    }

    const backups = files
      .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, 10); // Last 10 backups

    return NextResponse.json({
      success: true,
      backupDir,
      backups,
      count: backups.length,
      nextScheduledBackup: new Date(Date.now() + 60 * 60 * 1000).toISOString() // Next hour
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      message: error.message
    }, { status: 500 });
  }
}
