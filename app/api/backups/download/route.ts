import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function GET(req: NextRequest) {
    const searchParams = req.nextUrl.searchParams;
    const items = searchParams.get('file');

    if (!items) {
        return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    // Security check: Allow only db.json.bak.* files
    if (!items.startsWith('db.json.bak')) {
        return NextResponse.json({ error: 'Invalid file request' }, { status: 403 });
    }

    const filePath = path.join(process.cwd(), 'lib', items);

    try {
        await fs.access(filePath);
        const fileBuffer = await fs.readFile(filePath);

        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Disposition': `attachment; filename=${items}`,
                'Content-Type': 'application/json',
            },
        });
    } catch (error) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
}
