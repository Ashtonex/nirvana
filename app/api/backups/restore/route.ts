import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(req: NextRequest) {
    try {
        const { file } = await req.json();

        if (!file || !file.startsWith('db.json.bak')) {
            return NextResponse.json({ error: 'Invalid file selection' }, { status: 400 });
        }

        const libDir = path.join(process.cwd(), 'lib');
        const backupPath = path.join(libDir, file);
        const dbPath = path.join(libDir, 'db.json');

        // Security: Ensure backup file exists
        await fs.access(backupPath);

        // Perform Restore: Copy backup -> db.json
        const backupContent = await fs.readFile(backupPath, 'utf-8');

        // Create a safety backup of CURRENT state before restoring (Just in case)
        await fs.writeFile(`${dbPath}.safety_restore_bak`, await fs.readFile(dbPath, 'utf-8'));

        // Overwrite
        await fs.writeFile(dbPath, backupContent, 'utf-8');

        return NextResponse.json({ success: true, message: 'System restored successfully.' });
    } catch (error) {
        console.error("Restore failed:", error);
        return NextResponse.json({ error: 'Restore failed' }, { status: 500 });
    }
}
