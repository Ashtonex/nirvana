"use client";

import { useMemo, useState, useTransition } from "react";
import { registerNewEmployee } from "@/app/actions";
import { Button, CardContent, Input } from "@/components/ui";
import { Loader2, MessageSquareLock } from "lucide-react";

const SHOP_PINS: Record<string, string> = {
  kipasa: "1234",
  dubdub: "5678",
  tradecenter: "0000",
};

const SHOP_NAMES: Record<string, string> = {
  kipasa: "Kipasa",
  dubdub: "Dubdub",
  tradecenter: "Tradecenter",
};

function normalizeForWaMe(raw: string) {
  let s = String(raw || "").trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith("whatsapp:")) s = s.slice("whatsapp:".length);

  // remove spaces and punctuation
  const cleaned = s.replace(/[\s\-()]/g, "");
  if (!cleaned) return null;

  // +2637... -> 2637...
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1).replace(/\D/g, "");
    return digits.length >= 8 ? digits : null;
  }

  // 00263... -> 263...
  if (cleaned.startsWith("00")) {
    const digits = cleaned.slice(2).replace(/\D/g, "");
    return digits.length >= 8 ? digits : null;
  }

  // ZW-friendly: 07xxxxxxxx -> 2637xxxxxxxx
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length === 10 && digitsOnly.startsWith("0")) {
    return `263${digitsOnly.slice(1)}`;
  }

  return digitsOnly.length >= 8 ? digitsOnly : null;
}

function buildCredentialMessage(params: {
  name: string;
  surname: string;
  role: string;
  shopId: string;
  workEmail: string;
  pin: string;
}) {
  const fullName = `${params.name} ${params.surname}`.trim();
  const shopName = SHOP_NAMES[params.shopId] || params.shopId;
  const roleLabel = params.role === "sales" ? "Sales Associate" : params.role === "manager" ? "Lead Manager" : "Owner";
  const stamp = new Date().toLocaleString();

  return [
    "NIRVANA NETWORK // ENLISTMENT ORDERS",
    `Timestamp: ${stamp}`,
    "",
    `Operative: ${fullName}`,
    `Unit: ${shopName.toUpperCase()}`,
    `Role: ${roleLabel.toUpperCase()}`,
    "",
    "ACCESS PACKET (CONFIDENTIAL)",
    `Work Email: ${params.workEmail}`,
    `Device PIN: ${params.pin}`,
    "",
    "MISSION BRIEF",
    "1) Open Nirvana",
    "2) Tap: Staff Login",
    "3) Enter Work Email + Device PIN",
    "",
    "RULES OF ENGAGEMENT",
    "- Do not share credentials",
    "- If access fails, report to Command (Store Manager/Owner)",
    "",
    "NIRVANA ONLINE // POS READY",
  ].join("\n");
}

export default function QuickRecruitmentForm({ shops }: { shops: Array<{ id: string; name: string }> }) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string>("");

  const [name, setName] = useState("");
  const [surname, setSurname] = useState("");
  const [personalEmail, setPersonalEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [role, setRole] = useState("sales");
  const [shopId, setShopId] = useState(shops?.[0]?.id || "kipasa");

  const pin = useMemo(() => SHOP_PINS[shopId] || "0000", [shopId]);

  const submit = () => {
    setStatus("");
    const pop = window.open("about:blank", "_blank");

    startTransition(async () => {
      try {
        const res = await registerNewEmployee({
          name,
          surname,
          personalEmail,
          mobile,
          role,
          shopId,
          hireDate: new Date().toISOString().split("T")[0],
        });

        if (!res?.success) {
          if (pop) pop.close();
          setStatus(`ERROR: ${res?.error || "Failed to create employee"}`);
          return;
        }

        const workEmail = String((res as any)?.email || "").trim();
        const message = buildCredentialMessage({ name, surname, role, shopId, workEmail, pin });

        const to = normalizeForWaMe(mobile);
        const waUrl = to
          ? `https://wa.me/${to}?text=${encodeURIComponent(message)}`
          : `https://wa.me/?text=${encodeURIComponent(message)}`;

        if (pop) {
          try {
            pop.location.href = waUrl;
          } catch {
            window.open(waUrl, "_blank", "noopener,noreferrer");
          }
        } else {
          window.open(waUrl, "_blank", "noopener,noreferrer");
        }

        setStatus("Account created. WhatsApp dispatch window opened.");
        // Refresh registry so the new employee appears.
        setTimeout(() => {
          try {
            window.location.reload();
          } catch {
            // ignore
          }
        }, 800);
      } catch (e: any) {
        if (pop) pop.close();
        setStatus(`ERROR: ${e?.message || "Failed to create employee"}`);
      }
    });
  };

  return (
    <CardContent>
      <div className="text-xs text-amber-400 mb-4 font-bold">
        Note: Staff login uses Work Email + Device PIN. This will open WhatsApp so you can send credentials to the employee.
      </div>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="w-40 space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">First Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John" required className="h-10 bg-slate-950/50 border-slate-800 text-sm font-bold" />
        </div>
        <div className="w-40 space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Surname</label>
          <Input value={surname} onChange={(e) => setSurname(e.target.value)} placeholder="Doe" required className="h-10 bg-slate-950/50 border-slate-800 text-sm font-bold" />
        </div>
        <div className="w-48 space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Personal Email</label>
          <Input value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} name="personalEmail" type="email" placeholder="employee@gmail.com" required className="h-10 bg-slate-950/50 border-slate-800 text-sm font-bold" />
        </div>
        <div className="w-48 space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Mobile Number</label>
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+2637..." required className="h-10 bg-slate-950/50 border-slate-800 text-sm font-bold" />
        </div>
        <div className="w-56 space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Device PIN</label>
          <Input value={pin} readOnly className="h-10 bg-slate-950/50 border-slate-800 text-sm font-bold text-slate-300 font-mono tracking-[0.35em] text-center" />
        </div>
        <div className="w-40 space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Assignment Role</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full h-10 bg-slate-950/50 border-slate-800 rounded-md text-xs font-bold text-slate-200 px-3 outline-none focus:border-emerald-500 transition-all border cursor-pointer">
            <option value="sales">Sales Associate</option>
            <option value="manager">Lead Manager</option>
            <option value="owner">Strategic Owner</option>
          </select>
        </div>
        <div className="w-48 space-y-1.5">
          <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Station Assignment</label>
          <select value={shopId} onChange={(e) => setShopId(e.target.value)} className="w-full h-10 bg-slate-950/50 border-slate-800 rounded-md text-xs font-bold text-slate-200 px-3 outline-none focus:border-emerald-500 transition-all border cursor-pointer">
            {shops.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <Button
          type="button"
          onClick={submit}
          disabled={pending || !name || !surname || !personalEmail || !mobile}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase h-10 px-8 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><MessageSquareLock className="h-4 w-4 mr-2" /> Create Account</>}
        </Button>
      </div>

      {status ? (
        <div className="mt-4 text-xs font-bold text-slate-300 bg-slate-950/40 border border-slate-800 rounded-lg p-3 whitespace-pre-wrap">
          {status}
        </div>
      ) : null}
    </CardContent>
  );
}
