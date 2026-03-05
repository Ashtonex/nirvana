import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET() {
  const today = new Date().toISOString().split('T')[0];
  
  // Get today's sales
  const { data: sales } = await supabaseAdmin
    .from('sales')
    .select('id, item_name, quantity, total_with_tax, client_name, date, shop_id')
    .gte('date', `${today}T00:00:00`)
    .order('date', { ascending: false });

  // Get active staff (online in last 5 minutes)
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data: activeSessions } = await supabaseAdmin
    .from('staff_sessions')
    .select('employee_id, created_at')
    .gte('created_at', fiveMinutesAgo);

  // Get unread messages count
  const { data: unreadMessages } = await supabaseAdmin
    .from('chat_messages')
    .select('id')
    .gte('created_at', `${today}T00:00:00`)
    .eq('read', false);

  // Get pending stock requests
  const { data: stockRequests } = await supabaseAdmin
    .from('stock_requests')
    .select('id')
    .eq('status', 'pending')
    .gte('created_at', `${today}T00:00:00`);

  return NextResponse.json({
    sales: (sales || []).map((s: any) => ({
      id: s.id,
      itemName: s.item_name,
      quantity: s.quantity,
      totalWithTax: s.total_with_tax,
      clientName: s.client_name,
      time: new Date(s.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      shopId: s.shop_id
    })),
    activeStaffCount: new Set((activeSessions || []).map((s: any) => s.employee_id)).size,
    unreadMessagesCount: unreadMessages?.length || 0,
    pendingStockRequestsCount: stockRequests?.length || 0
  });
}
