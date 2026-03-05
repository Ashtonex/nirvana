import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (id.startsWith('msg_')) {
    const messageId = id.replace('msg_', '');
    await supabaseAdmin
      .from('chat_messages')
      .update({ read: true })
      .eq('id', messageId);
  }

  return NextResponse.json({ success: true });
}
