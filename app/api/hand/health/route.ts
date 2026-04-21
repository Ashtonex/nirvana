import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function POST(request: Request) {
  try {
    // Check Supabase
    const { data: supabaseOk } = await supabaseAdmin.from('employees').select('count').limit(1);
    
    // Check local JSON
    let localJsonOk = false;
    try {
      const dbPath = path.join(process.cwd(), 'lib', 'db.json');
      await fs.access(dbPath);
      localJsonOk = true;
    } catch { }

    return NextResponse.json({
      supabase: !!supabaseOk,
      localJson: localJsonOk
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
