export const dynamic = 'force-dynamic';

import { getDashboardData, updateEmployee, deleteEmployee } from "../actions";
import QuickRecruitmentForm from "./QuickRecruitmentForm";
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription,
    Badge,
    Button,
    Input
} from "@/components/ui";
import {
    Users,
    UserPlus,
    UserMinus,
    ArrowRightLeft,
    ShieldCheck,
    Calendar,
    MapPin,
    Briefcase,
    Phone,
    Mail
} from "lucide-react";

export default async function EmployeesPage() {
    const db = await getDashboardData();
    const employees = db.employees || [];
    const shops = db.shops || [];

    return (
        <div className="space-y-8 pb-20">
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-end">
                <div className="space-y-1">
                    <h1 className="text-3xl sm:text-4xl font-black tracking-tighter uppercase italic">Employee Registry</h1>
                    <p className="text-slate-400 font-medium tracking-tight">Central command for human resources across all locations.</p>
                </div>
                <div className="flex gap-4 w-full sm:w-auto">
                    <div className="text-right bg-slate-900/40 p-3 rounded-lg border border-slate-800 w-full sm:w-auto">
                        <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest">Active Force</p>
                        <p className="text-2xl font-black text-violet-400 font-mono">{employees.filter((e: any) => e.active).length} Members</p>
                    </div>
                </div>
            </div>

            {/* Quick Recruitment Form */}
            <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                <CardHeader>
                    <CardTitle className="text-xl font-black uppercase italic flex items-center gap-2 text-emerald-400">
                        <UserPlus className="h-5 w-5" /> Quick Recruitment
                    </CardTitle>
                    <CardDescription className="text-xs font-bold text-slate-500 uppercase">
                        Onboard a new member to the NIRVANA network.
                    </CardDescription>
                </CardHeader>
                <QuickRecruitmentForm shops={shops} />
            </Card>

            <div className="grid gap-6">
                <Card className="bg-slate-900/40 border-slate-800 backdrop-blur-md">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-black uppercase italic flex items-center gap-2">
                                <Users className="h-5 w-5 text-violet-500" /> Active Personnel
                            </CardTitle>
                            <CardDescription className="text-xs font-bold text-slate-500 uppercase mt-1">
                                Current active deployment across all nodes.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-slate-800 text-[10px] font-black text-slate-500 uppercase tracking-widest">
                                        <th className="text-left pb-4">Member Profile</th>
                                        <th className="text-left pb-4">Classification</th>
                                        <th className="text-left pb-4">Active Station</th>
                                        <th className="text-left pb-4">Deployment Date</th>
                                        <th className="text-left pb-4 text-right">Operations</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                    {employees.map((emp: any) => {
                                        const shop = shops.find((s: any) => s.id === emp.shopId);
                                        return (
                                            <tr key={emp.id} className="group hover:bg-slate-800/30 transition-colors">
                                                <td className="py-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-xs font-black text-white border-2 border-slate-900 shadow-lg shadow-indigo-500/10">
                                                            {(emp.name?.[0] || '') + (emp.surname?.[0] || '')}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-black text-white">{emp.name} {emp.surname}</p>
                                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tight flex items-center gap-2">
                                                                <Mail className="h-3 w-3" /> {emp.email}
                                                            </p>
                                                            {emp.mobile && (
                                                                <p className="text-[10px] font-bold text-slate-600 flex items-center gap-2">
                                                                    <Phone className="h-3 w-3" /> {emp.mobile}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="py-4">
                                                    <Badge className={`uppercase text-[9px] font-black px-2 py-0.5 border shadow-sm ${emp.role === 'owner' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                                        emp.role === 'manager' ? 'bg-sky-500/10 text-sky-500 border-sky-500/20' :
                                                            'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                                        }`}>
                                                        {emp.role}
                                                    </Badge>
                                                </td>
                                                <td className="py-4">
                                                    <div className="flex items-center gap-2">
                                                        <MapPin className="h-3 w-3 text-slate-500" />
                                                        <span className="text-xs font-bold text-slate-300">{shop?.name || 'Unassigned'}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4">
                                                    <div className="flex items-center gap-2 text-slate-400">
                                                        <Calendar className="h-3 w-3" />
                                                        <span className="text-xs font-bold">{new Date(emp.hireDate).toLocaleDateString()}</span>
                                                    </div>
                                                </td>
                                                <td className="py-4 text-right">
                                                    <div className="flex justify-end gap-3">
                                                        <form action={async () => {
                                                            "use server";
                                                            const nextShop = shops.find((s: any) => s.id !== emp.shopId)?.id || emp.shopId;
                                                            await updateEmployee(emp.id, { shopId: nextShop });
                                                        }}>
                                                            <Button size="sm" variant="outline" className="h-8 text-[10px] font-black uppercase tracking-widest border-slate-800 hover:border-violet-500/50 hover:bg-violet-500/5 transition-all">
                                                                <ArrowRightLeft className="h-3 w-3 mr-1" /> Cycle Station
                                                            </Button>
                                                        </form>
                                                        <form action={async () => {
                                                            "use server";
                                                            await deleteEmployee(emp.id);
                                                        }}>
                                                            <Button type="submit" size="sm" variant="outline" className="h-8 w-8 p-0 border-slate-800 hover:border-rose-500/50 hover:text-rose-500 hover:bg-rose-500/5 transition-all">
                                                                <UserMinus className="h-4 w-4" />
                                                            </Button>
                                                        </form>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

