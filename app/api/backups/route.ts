import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET() {
    try {
        const libDir = path.join(process.cwd(), 'lib');
        const files = await fs.readdir(libDir);

        // Filter for db.json.bak.*
        const backupFiles = files.filter(f => f.startsWith('db.json.bak'));

        const backups = await Promise.all(backupFiles.map(async (file) => {
            const filePath = path.join(libDir, file);
            const stats = await fs.stat(filePath);
            return {
                name: file,
                size: stats.size,
                date: stats.mtime.toISOString(),
            };
        }));

        // Sort by date descending (newest first)
        backups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json(backups);
    } catch (error) {
        return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 });
    }
}
