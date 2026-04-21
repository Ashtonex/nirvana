import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    const timestamp = new Date().toISOString();
    const backupDir = path.join(process.cwd(), 'backups');
    const backupName = `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    
    // Create backups directory if it doesn't exist
    try {
      await fs.mkdir(backupDir, { recursive: true });
    } catch { }

    let results: any[] = [];

    // 1. Backup Supabase data
    try {
      // Get all main tables
      const [
        { data: sales },
        { data: ledger },
        { data: operations },
        { data: employees },
        { data: inventory }
      ] = await Promise.all([
        supabaseAdmin.from('sales').select('*'),
        supabaseAdmin.from('ledger_entries').select('*'),
        supabaseAdmin.from('operations_ledger').select('*'),
        supabaseAdmin.from('employees').select('*'),
        supabaseAdmin.from('inventory_items').select('*')
      ]);

      const supabaseBackup = {
        timestamp,
        data: {
          sales: sales || [],
          ledger: ledger || [],
          operations: operations || [],
          employees: employees || [],
          inventory: inventory || []
        }
      };

      const supabaseBackupPath = path.join(backupDir, `${backupName}_supabase.json`);
      await fs.writeFile(supabaseBackupPath, JSON.stringify(supabaseBackup, null, 2));
      results.push(`✓ Supabase backup created (${(sales?.length || 0)} sales, ${(ledger?.length || 0)} ledger entries)`);
    } catch (e: any) {
      results.push(`⚠ Supabase backup failed: ${e.message}`);
    }

    // 2. Backup local JSON
    try {
      const dbPath = path.join(process.cwd(), 'lib', 'db.json');
      const content = await fs.readFile(dbPath, 'utf-8');
      const db = JSON.parse(content);

      const localBackupPath = path.join(backupDir, `${backupName}_local.json`);
      await fs.writeFile(localBackupPath, JSON.stringify(db, null, 2));
      results.push(`✓ Local JSON backup created`);
    } catch (e: any) {
      results.push(`⚠ Local JSON backup failed: ${e.message}`);
    }

    // 3. Create backup index
    try {
      const indexPath = path.join(backupDir, 'BACKUPS.md');
      const timestamp_pretty = new Date(timestamp).toLocaleString();
      const indexEntry = `\n- **${backupName}** - ${timestamp_pretty}`;
      
      try {
        const existing = await fs.readFile(indexPath, 'utf-8');
        await fs.writeFile(indexPath, existing + indexEntry);
      } catch {
        await fs.writeFile(indexPath, `# Database Backups\n${indexEntry}`);
      }
      
      results.push(`✓ Backup index updated`);
    } catch (e: any) {
      results.push(`⚠ Backup index failed: ${e.message}`);
    }

    return NextResponse.json({
      success: true,
      message: 'Backup completed successfully',
      details: results,
      timestamp,
      backupName
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
