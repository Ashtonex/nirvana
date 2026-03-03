"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStaff } from "@/components/StaffProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input } from "@/components/ui";
import { MessageSquare, Send, Loader2, ArrowLeft } from "lucide-react";

type Msg = {
  id: string;
  shop_id: string;
  sender_name: string;
  message: string;
  created_at: string;
};

export default function StaffChatPage() {
  const { staff, loading: staffLoading } = useStaff();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const shopId = staff?.shop_id;

  const fetchMessages = async () => {
    const res = await fetch("/api/staff/chat", { cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessages(data.messages || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!staffLoading) {
      fetchMessages();
      const t = setInterval(fetchMessages, 2000);
      return () => clearInterval(t);
    }
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffLoading]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    try {
      const res = await fetch("/api/staff/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      if (res.ok) {
        setText("");
        await fetchMessages();
      }
    } finally {
      setSending(false);
    }
  };

  const backHref = shopId ? `/shops/${shopId}` : "/staff-login";

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-violet-400" /> Shop Chat
          </h1>
          <p className="text-slate-400 text-sm">Internal chat for your store.</p>
        </div>
        <Link href={backHref} className="inline-flex items-center gap-2 text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back to POS
        </Link>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="border-b border-slate-800">
          <CardTitle className="text-white text-lg font-black uppercase italic">{shopId ? shopId.toUpperCase() : "CHAT"}</CardTitle>
          <CardDescription className="text-slate-500">Messages auto-refresh every 2 seconds.</CardDescription>
        </CardHeader>
        <CardContent className="p-4">
          <div className="h-[55svh] overflow-y-auto space-y-3 pr-1">
            {loading ? (
              <div className="flex items-center justify-center py-10 text-slate-500">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className="bg-slate-950/40 border border-slate-800 rounded-xl p-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-black text-slate-300 uppercase">{m.sender_name}</div>
                    <div className="text-[10px] text-slate-600">{new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                  </div>
                  <div className="text-slate-200 mt-2 text-sm whitespace-pre-wrap">{m.message}</div>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>

          <div className="mt-4 flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="bg-slate-950 border-slate-800"
              placeholder="Type message..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button onClick={send} disabled={sending || !text.trim()} className="shrink-0">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
