"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useStaff } from "@/components/StaffProvider";
import { useAuth, supabaseAuth } from "@/components/AuthProvider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, Button, Input } from "@/components/ui";
import { MessageSquare, Send, Loader2, ArrowLeft, Globe, Store } from "lucide-react";

type Msg = {
  id: string;
  shop_id: string;
  sender_name: string;
  message: string;
  created_at: string;
};

export default function StaffChatPage() {
  const { staff, loading: staffLoading } = useStaff();
  const { user: ownerUser, loading: ownerLoading } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [room, setRoom] = useState<"shop" | "universal">("shop");
  const [shopIdOverride, setShopIdOverride] = useState("kipasa");

  // Stock request (universal room)
  const [srItem, setSrItem] = useState("");
  const [srQty, setSrQty] = useState("1");
  const [srFrom, setSrFrom] = useState("dubdub");
  const [srTo, setSrTo] = useState("kipasa");
  const [srSubmitting, setSrSubmitting] = useState(false);
  const [srStatus, setSrStatus] = useState<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  const isOwner = Boolean(ownerUser);
  const isStaff = Boolean(staff);

  const shopId = isStaff ? staff?.shop_id : shopIdOverride;

  useEffect(() => {
    if (isStaff && staff?.shop_id) {
      setShopIdOverride(staff.shop_id);
      setSrTo(staff.shop_id);
    }
  }, [isStaff, staff?.shop_id]);

  const getOwnerToken = async () => {
    if (!isOwner) return "";
    const { data } = await supabaseAuth.auth.getSession();
    return data.session?.access_token || "";
  };

  const fetchMessages = async () => {
    const qs = new URLSearchParams();
    qs.set("room", room);
    if (room === "shop" && isOwner) qs.set("shopId", shopIdOverride);

    const token = await getOwnerToken();
    const res = await fetch(`/api/staff/chat?${qs.toString()}`,
      {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      }
    );
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setMessages(data.messages || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!staffLoading && !ownerLoading) {
      fetchMessages();
      const t = setInterval(fetchMessages, 2000);
      return () => clearInterval(t);
    }
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffLoading, ownerLoading, room, shopIdOverride]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = async () => {
    const msg = text.trim();
    if (!msg) return;
    setSending(true);
    try {
      const token = await getOwnerToken();
      const res = await fetch("/api/staff/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg, room, shopId: room === "shop" && isOwner ? shopIdOverride : "" }),
      });
      if (res.ok) {
        setText("");
        await fetchMessages();
      }
    } finally {
      setSending(false);
    }
  };

  const submitStockRequest = async () => {
    if (!srItem.trim()) return;
    const qty = Math.max(1, Number(srQty || 1));
    setSrSubmitting(true);
    setSrStatus("");
    try {
      const token = await getOwnerToken();
      const res = await fetch("/api/stock-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          itemName: srItem,
          quantity: qty,
          fromShopId: srFrom,
          toShopId: srTo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSrStatus(data?.error || "Failed to create stock request");
        return;
      }
      setSrStatus("Stock request created.");
      setSrItem("");
      setSrQty("1");
    } finally {
      setSrSubmitting(false);
    }
  };

  const backHref = isStaff && shopId ? `/shops/${shopId}` : isOwner ? "/" : "/staff-login";

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-2">
            <MessageSquare className="h-7 w-7 text-violet-400" /> Staff Chat
          </h1>
          <p className="text-slate-400 text-sm">Store room + universal network room.</p>
        </div>
        <Link href={backHref} className="inline-flex items-center gap-2 text-slate-300 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> {isStaff ? "Back to POS" : "Back"}
        </Link>
      </div>

      <Card className="bg-slate-900/40 border-slate-800">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant={room === "shop" ? "default" : "outline"}
              onClick={() => setRoom("shop")}
              className="h-9"
            >
              <Store className="h-4 w-4 mr-2" /> Store Room
            </Button>
            <Button
              type="button"
              variant={room === "universal" ? "default" : "outline"}
              onClick={() => setRoom("universal")}
              className="h-9"
            >
              <Globe className="h-4 w-4 mr-2" /> Universal Room
            </Button>

            {isOwner && room === "shop" && (
              <div className="flex items-center gap-2 ml-auto">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Shop</div>
                <select
                  value={shopIdOverride}
                  onChange={(e) => setShopIdOverride(e.target.value)}
                  className="h-9 bg-slate-950/50 border border-slate-800 rounded-md text-xs font-bold text-slate-200 px-3 outline-none"
                >
                  <option value="kipasa">kipasa</option>
                  <option value="dubdub">dubdub</option>
                  <option value="tradecenter">tradecenter</option>
                </select>
              </div>
            )}
          </div>

          <div className="text-xs text-slate-300 bg-slate-950/40 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">How to request stock</div>
            <div className="mt-2 space-y-1">
              <div>Use the Universal Room for stock requests so all stores + owners see it.</div>
              <div>Include: item name, quantity, from shop, to shop, urgency, and customer context if relevant.</div>
              <div>Recommended: use the Stock Request form (Universal Room) to create a tracked request.</div>
            </div>
          </div>

          {room === "universal" && (
            <div className="bg-slate-950/30 border border-slate-800 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Stock Request</div>
                {srStatus ? <div className="text-[10px] font-bold text-slate-400">{srStatus}</div> : null}
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-5 gap-2">
                <Input
                  value={srItem}
                  onChange={(e) => setSrItem(e.target.value)}
                  className="bg-slate-950 border-slate-800 sm:col-span-2"
                  placeholder="Item name"
                />
                <Input
                  value={srQty}
                  onChange={(e) => setSrQty(e.target.value)}
                  className="bg-slate-950 border-slate-800"
                  placeholder="Qty"
                  inputMode="numeric"
                />
                <select
                  value={srFrom}
                  onChange={(e) => setSrFrom(e.target.value)}
                  className="h-10 bg-slate-950 border border-slate-800 rounded-md text-xs font-bold text-slate-200 px-3 outline-none"
                >
                  <option value="kipasa">from: kipasa</option>
                  <option value="dubdub">from: dubdub</option>
                  <option value="tradecenter">from: tradecenter</option>
                </select>
                <select
                  value={srTo}
                  onChange={(e) => setSrTo(e.target.value)}
                  disabled={isStaff && !isOwner}
                  className="h-10 bg-slate-950 border border-slate-800 rounded-md text-xs font-bold text-slate-200 px-3 outline-none"
                >
                  <option value="kipasa">to: kipasa</option>
                  <option value="dubdub">to: dubdub</option>
                  <option value="tradecenter">to: tradecenter</option>
                </select>
              </div>
              <div className="mt-3 flex justify-end">
                <Button onClick={submitStockRequest} disabled={srSubmitting || !srItem.trim()} className="h-9">
                  {srSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Request"}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader className="border-b border-slate-800">
          <CardTitle className="text-white text-lg font-black uppercase italic">
            {room === "universal" ? "UNIVERSAL" : (shopId ? shopId.toUpperCase() : "SHOP")}
          </CardTitle>
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
