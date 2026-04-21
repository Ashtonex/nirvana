import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const backupDir = path.join(process.cwd(), 'backups');
    
    // List available backups
    const files = await fs.readdir(backupDir);
    const localBackups = files
      .filter(f => f.endsWith('_local.json'))
      .sort()
      .reverse();

    if (localBackups.length === 0) {
      return NextResponse.json(
        { success: false, message: 'No local backups found' },
        { status: 400 }
      );
    }

    // Get the latest backup
    const latestBackup = localBackups[0];
    const backupPath = path.join(backupDir, latestBackup);
    const backupContent = await fs.readFile(backupPath, 'utf-8');
    const backupData = JSON.parse(backupContent);

    // Restore to lib/db.json
    const dbPath = path.join(process.cwd(), 'lib', 'db.json');
    await fs.writeFile(dbPath, JSON.stringify(backupData, null, 2));

    return NextResponse.json({
      success: true,
      message: `Restored from backup: ${latestBackup}`,
      source: latestBackup,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
