import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;
  
  try {
    const { key, value } = await request.json();

    if (!key || value === undefined) {
      return NextResponse.json({ success: false, message: 'Missing key or value' }, { status: 400 });
    }

    // Update database
    const { error: dbError } = await supabaseAdmin
      .from('settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });

    if (dbError && !dbError.message.includes('relation')) {
      console.error('DB error:', dbError);
    }

    // Update local JSON
    const dbPath = path.join(process.cwd(), 'lib', 'db.json');
    const content = await fs.readFile(dbPath, 'utf-8');
    const db = JSON.parse(content);
    db.settings = db.settings || {};
    db.settings[key] = value;
    await fs.writeFile(dbPath, JSON.stringify(db, null, 2));

    return NextResponse.json({
      success: true,
      message: `${key} updated to ${value}`
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
