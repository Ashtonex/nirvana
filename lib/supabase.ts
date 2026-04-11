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
 *
 * The `global.fetch` override with `cache: 'no-store'` is critical in Next.js
 * App Router — without it, Next.js caches all fetch() calls (including internal
 * Supabase requests) even when the page uses `force-dynamic`. This causes the
 * dashboard to serve stale sales data until the cache expires.
 */
export const supabaseAdmin =
    supabaseUrl && serviceRoleKey
        ? createClient(supabaseUrl, serviceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            },
            global: {
                fetch: (url, options = {}) =>
                    fetch(url, { ...options, cache: 'no-store' })
            }
        })
        : createMockSupabaseClient('admin');

