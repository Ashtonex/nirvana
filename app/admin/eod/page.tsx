export const dynamic = 'force-dynamic';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { 
  ArrowLeft, 
  FileText, 
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui';
import { getDashboardData } from '../../actions';

async function getShopId() {
  const cookieStore = await cookies();
  const shopId = cookieStore.get('nirvana_staff')?.value || cookieStore.get('nirvana_owner')?.value;
  return shopId;
}

export default async function HistoricalEODPage() {
  const shopId = await getShopId();
  
  if (!shopId) {
    redirect('/login');
  }

  const db = await getDashboardData();
  const shops = db.shops || [];

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/admin">
            <Button variant="outline" size="icon" className="border-slate-700">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-black uppercase italic">Historical EOD Reports</h1>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <p className="text-slate-400 mb-6">
            Download end-of-day reports as PDFs for any past date. Select a shop and date below.
          </p>

          <form action="/api/eod/pdf" method="GET" className="space-y-6">
            <div>
              <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                Select Shop
              </label>
              <select 
                name="shopId" 
                required
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white font-bold"
              >
                {shops.map((shop: any) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-black uppercase text-slate-500 mb-2">
                Select Date
              </label>
              <input 
                type="date" 
                name="date"
                required
                max={new Date().toISOString().split('T')[0]}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-white font-bold"
              />
            </div>

            <div className="flex gap-4">
              <Button 
                type="submit"
                className="flex-1 bg-emerald-600 hover:bg-emerald-500"
              >
                <FileText className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
