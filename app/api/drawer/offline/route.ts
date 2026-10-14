import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { getStaffSessionEmployeeId, requireOwnerAccess } from '@/lib/api-auth';

export async function POST(request: Request) {
    if (!supabaseAdmin) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    try {
        const body = await request.json();
        const { id, shopId, employeeId, type, amount, reason, date } = body;

        if (!shopId || !type || amount === undefined) {
            return NextResponse.json({ error: 'Missing required drawer operation fields' }, { status: 400 });
        }

        // Verify active employee
        const staffEmployeeId = await getStaffSessionEmployeeId();
        const ownerAccess = await requireOwnerAccess(request);

        let authorizedEmpId = staffEmployeeId;
        if (!authorizedEmpId && !ownerAccess.ok) {
            if (employeeId) {
                const { data: validEmp } = await supabaseAdmin
                    .from('employees')
                    .select('id, active')
                    .eq('id', employeeId)
                    .maybeSingle();
                if (validEmp && validEmp.active) {
                    authorizedEmpId = validEmp.id;
                }
            }
        }

        if (!authorizedEmpId && !ownerAccess.ok) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const entryId = id || Math.random().toString(36).substring(2, 9);
        const timestamp = date || new Date().toISOString();

        // Check idempotency (prevent duplicate insert if already synced)
        const { data: existing } = await supabaseAdmin
            .from('ledger_entries')
            .select('id')
            .eq('id', entryId)
            .maybeSingle();

        if (existing) {
            return NextResponse.json({ success: true, id: entryId, alreadyProcessed: true });
        }

        let category = 'POS Expense';
        let entryType: 'asset' | 'expense' = 'expense';
        let description = reason || 'POS Drawer Operation';

        if (type === 'open') {
            category = 'Cash Drawer Opening';
            entryType = 'asset';
            description = reason || `Register Opened with $${Number(amount).toFixed(2)}`;
        } else if (type === 'close') {
            category = 'Cash Drawer Closing';
            entryType = 'asset';
            description = reason || `Register Closed with $${Number(amount).toFixed(2)}`;
        } else if (type === 'expense') {
            category = 'POS Expense';
            entryType = 'expense';
            description = reason || `Petty Cash Out: $${Number(amount).toFixed(2)}`;
        }

        const { error: insertError } = await supabaseAdmin.from('ledger_entries').insert([{
            id: entryId,
            shop_id: shopId,
            type: entryType,
            category,
            amount: Number(amount),
            date: timestamp,
            description,
            employee_id: authorizedEmpId || employeeId || 'SYSTEM'
        }]);

        if (insertError) {
            console.error('[Offline Drawer Sync] Insert error:', insertError);
            return NextResponse.json({ error: insertError.message }, { status: 500 });
        }

        return NextResponse.json({ success: true, id: entryId });
    } catch (e: any) {
        console.error('[Offline Drawer Sync] Error:', e);
        return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
    }
}
