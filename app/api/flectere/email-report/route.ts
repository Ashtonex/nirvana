import { NextResponse } from "next/server";
import { resend } from "@/lib/resend";
import { ORACLE_RECIPIENT } from "@/lib/resend";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { to, subject, html } = await request.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing required fields: to, subject, html" }, { status: 400 });
    }

    const result = await resend.emails.send({
      from: "Nirvana Intelligence <intelligence@nirvana.one>",
      to: [to],
      subject,
      html,
    });

    return NextResponse.json({ success: true, id: (result as any)?.data?.id });
  } catch (err: any) {
    console.error("[Flectere Email Report] Error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Failed to send email" }, { status: 500 });
  }
}
