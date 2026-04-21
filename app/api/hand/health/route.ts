import { supabaseAdmin } from '@/lib/supabase';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

async function healthResponse() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return healthResponse();
}

export async function POST() {
  return healthResponse();
}
