import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function createMockSupabaseClient(label: string) {
    const message = `[Supabase:${label}] Environment variables are not configured. This client is a no-op placeholder used to allow builds to succeed.`;

    return {
        from() {
            throw new Error(message);
        },
        auth: {
            async getUser() {
                throw new Error(message);
            }
        }
    } as any;
}

export const supabase =
    supabaseUrl && supabaseAnonKey
        ? createClient(supabaseUrl, supabaseAnonKey)
        : createMockSupabaseClient('anon');

/**
 * Service role client for bypass RLS in server actions/route handlers.
 * Use with caution.
 */
export const supabaseAdmin =
    supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        })
        : createMockSupabaseClient('admin');
