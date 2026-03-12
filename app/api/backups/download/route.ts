import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { requireOwnerAccess } from "@/lib/api-auth";

// Required for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const auth = await requireOwnerAccess(req);
    if (!auth.ok) {
        return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const searchParams = req.nextUrl.searchParams;
    const items = searchParams.get('file');

    if (!items) {
        return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Security: allowlist exact backup filename format.
    // Prevents traversal like db.json.bak../.. and prevents arbitrary file reads.
    const name = path.basename(items);
    if (!/^db\.json\.bak\.[0-9]+$/.test(name)) {
        return NextResponse.json({ error: 'Invalid file request' }, { status: 403 });
    }

    const libDir = path.join(process.cwd(), 'lib');
    const filePath = path.join(libDir, name);

    try {
        await fs.access(filePath);
        const fileBuffer = await fs.readFile(filePath);

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Disposition': `attachment; filename=${name}`,
                'Content-Type': 'application/json',
            },
        });
    } catch {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
}

