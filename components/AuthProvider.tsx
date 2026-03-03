"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabaseAuth: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

interface AuthContextType {
    user: User | null;
    employee: any | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    employee: null,
    loading: true,
    signIn: async () => ({ error: null }),
    signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [employee, setEmployee] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        supabaseAuth.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchEmployee(session.user.id);
            }
            setLoading(false);
        });

        const { data: { subscription } } = supabaseAuth.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            if (session?.user) {
                fetchEmployee(session.user.id);
            } else {
                setEmployee(null);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    const fetchEmployee = async (userId: string) => {
        const { data } = await supabaseAuth
            .from('employees')
            .select('*')
            .eq('id', userId)
            .single();
        setEmployee(data);
    };

    const signIn = async (email: string, password: string) => {
        const { error } = await supabaseAuth.auth.signInWithPassword({
            email,
            password,
        });
        return { error };
    };

    const signOut = async () => {
        await supabaseAuth.auth.signOut();
        setUser(null);
        setEmployee(null);
    };

    return (
        <AuthContext.Provider value={{ user, employee, loading, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
