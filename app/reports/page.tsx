export const dynamic = 'force-dynamic';

import { getDashboardData } from "../actions";
import { ReportsFiltered } from "./ReportsFiltered";

export default async function ReportsPage() {
    const db = await getDashboardData();
    const sales = db.sales;

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-3">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
                    <p className="text-slate-400">Detailed breakdown of daily sales and shop performance.</p>
                </div>
            </div>

            <ReportsFiltered sales={sales || []} />
        </div>
    );
}


