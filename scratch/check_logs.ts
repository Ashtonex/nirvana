import { supabaseAdmin } from "./lib/supabase";

async function checkAuditLogs() {
    const today = new Date().toISOString().split('T')[0];
    console.log(`Checking audit logs for ${today}...`);
    
    const { data: logs, error } = await supabaseAdmin
        .from('audit_log')
        .select('*')
        .gte('timestamp', `${today}T00:00:00`)
        .order('timestamp', { ascending: false });
        
    if (error) {
        console.error('Error fetching logs:', error);
        return;
    }
    
    console.log(`Found ${logs?.length} logs for today.`);
    logs?.forEach(log => {
        console.log(`[${log.timestamp}] ${log.action}: ${log.details}`);
    });
}

// In a real environment I would run this, but here I can't run it easily without a wrapper.
// I'll just check if I can find any existing tools or routes that show this.
