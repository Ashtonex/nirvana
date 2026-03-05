import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const employeeId = url.searchParams.get('employeeId');

  if (!employeeId) {
    return NextResponse.json({ error: 'Missing employeeId' }, { status: 400 });
  }

  // Get notifications from the last 1 hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Get unread messages for this employee
  const { data: messages } = await supabaseAdmin
    .from('chat_messages')
    .select('id, content, sender_id, created_at, read')
    .neq('sender_id', employeeId)
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false });

  // Get stock requests assigned to this employee's shop
  const { data: employee } = await supabaseAdmin
    .from('employees')
    .select('shop_id')
    .eq('id', employeeId)
    .single();

  let stockRequests: any[] = [];
  if (employee) {
    const { data: requests } = await supabaseAdmin
      .from('stock_requests')
      .select('id, item_name, quantity, created_at, status')
      .eq('target_shop_id', employee.shop_id)
      .eq('status', 'pending')
      .gte('created_at', oneHourAgo)
      .order('created_at', { ascending: false });
    
    stockRequests = requests || [];
  }

  // Combine and format notifications
  const notifications = [
    ...(messages || []).map((m: any) => ({
      id: `msg_${m.id}`,
      type: 'message',
      title: 'New Message',
      body: m.content,
      createdAt: m.created_at,
      read: m.read
    })),
    ...(stockRequests || []).map((r: any) => ({
      id: `stock_${r.id}`,
      type: 'stock_request',
      title: 'Stock Request',
      body: `${r.item_name} (${r.quantity} units)`,
      createdAt: r.created_at,
      read: r.status === 'approved'
    }))
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ notifications });
}
