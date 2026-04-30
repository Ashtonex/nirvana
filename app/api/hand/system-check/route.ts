import { NextResponse } from 'next/server';
import { enforceOwnerOnly } from '@/lib/auth-helpers';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET() {
  const authError = await enforceOwnerOnly();
  if (authError) return authError;

  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: sessions },
      { data: staff },
      { data: staffChat },
      { data: globalChat },
      { data: opsLedger },
      { data: drifts },
      { data: staffLogs },
    ] = await Promise.all([
      supabaseAdmin.from('staff_sessions').select('employee_id,created_at').gte('created_at', fiveMinutesAgo),
      supabaseAdmin.from('employees').select('id,name,surname,shop_id,role'),
      supabaseAdmin.from('staff_chat_messages').select('id,shop_id,sender_employee_id,sender_name,message,created_at').order('created_at', { ascending: false }).limit(500),
      supabaseAdmin.from('chat_messages').select('id,chat_id,sender,body,created_at').order('created_at', { ascending: false }).limit(200),
      supabaseAdmin.from('operations_ledger').select('id,shop_id,amount,kind,title,notes,created_at').order('created_at', { ascending: false }).limit(200),
      supabaseAdmin.from('operations_drifts').select('id,amount,reason,resolved_kind,resolved_shop,created_at').order('created_at', { ascending: false }).limit(100),
      supabaseAdmin.from('staff_logs').select('*').order('created_at', { ascending: false }).limit(200),
    ]);

    // Map employees
    const empMap: Record<string, any> = {};
    (staff || []).forEach((e: any) => {
      empMap[String(e.id)] = { id: e.id, name: `${e.name || ''} ${e.surname || ''}`.trim(), shop_id: e.shop_id, role: e.role };
    });

    // Online staff
    const onlineStaff = (sessions || []).map((s: any) => ({
      employee_id: s.employee_id,
      last_seen: s.created_at,
      employee: empMap[String(s.employee_id)] || null,
    }));

    // Group staff chat by shop
    const chatsByShop: Record<string, any> = {};
    (staffChat || []).forEach((m: any) => {
      const shop = m.shop_id || 'universal';
      if (!chatsByShop[shop]) chatsByShop[shop] = { shopId: shop, messages: [] };
      chatsByShop[shop].messages.push({ id: m.id, sender_id: m.sender_employee_id, sender_name: m.sender_name, message: m.message, at: m.created_at, employee: empMap[String(m.sender_employee_id)] || null });
    });

    // Recent operations deposits overview
    const recentDeposits = (opsLedger || []).filter((r: any) => Number(r.amount || 0) > 0).slice(0, 100);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      onlineStaff,
      staffChat: Object.values(chatsByShop),
      globalChat: globalChat || [],
      recentOperations: opsLedger || [],
      recentDeposits,
      drifts: drifts || [],
      staffLogs: staffLogs || [],
      employeeMap: empMap,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
