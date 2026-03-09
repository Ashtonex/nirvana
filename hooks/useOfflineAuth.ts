'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
    getLocalAuthByPin, 
    saveLocalAuth, 
    getLocalAuthSessions,
    updateLocalAuthLastUsed,
    getAllLocalEmployees,
    getAllLocalShops,
    type LocalAuthSession 
} from '@/lib/local-db';
import { isOnline } from '@/lib/local-db';

interface OfflineAuthResult {
    login: (pin: string) => Promise<{ success: boolean; session?: LocalAuthSession; error?: string }>;
    logout: () => Promise<void>;
    currentSession: LocalAuthSession | null;
    isLoading: boolean;
    availableSessions: LocalAuthSession[];
    syncAuth: () => Promise<void>;
}

export function useOfflineAuth(): OfflineAuthResult {
    const [currentSession, setCurrentSession] = useState<LocalAuthSession | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [availableSessions, setAvailableSessions] = useState<LocalAuthSession[]>([]);

    // Load session from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('nirvana-auth-session');
        if (stored) {
            try {
                const session = JSON.parse(stored) as LocalAuthSession;
                setCurrentSession(session);
            } catch (e) {
                localStorage.removeItem('nirvana-auth-session');
            }
        }
        
        // Load available sessions
        getLocalAuthSessions().then(setAvailableSessions);
    }, []);

    const login = useCallback(async (pin: string) => {
        setIsLoading(true);
        try {
            // Try local auth first
            const session = await getLocalAuthByPin(pin);
            
            if (session) {
                // Update last used
                await updateLocalAuthLastUsed(session.employeeId);
                
                // Save to localStorage for persistence
                localStorage.setItem('nirvana-auth-session', JSON.stringify(session));
                setCurrentSession(session);
                
                return { success: true, session };
            }
            
            // If offline and no local session, check if we have any cached employees
            if (!(await isOnline())) {
                return { success: false, error: 'Invalid PIN. No offline credentials found.' };
            }
            
            // If online, try to authenticate via API (will be handled by the page)
            return { success: false, error: 'INVALID_PIN' };
            
        } catch (e) {
            return { success: false, error: String(e) };
        } finally {
            setIsLoading(false);
        }
    }, []);

    const logout = useCallback(async () => {
        localStorage.removeItem('nirvana-auth-session');
        setCurrentSession(null);
    }, []);

    // Sync auth data from cloud when online
    const syncAuth = useCallback(async () => {
        if (!(await isOnline())) return;
        
        try {
            const { supabase } = await import('@/lib/supabase');
            
            // Fetch employees with their shops
            const { data: employees, error: empError } = await supabase
                .from('employees')
                .select('id, name, role, shop_id, pin, shops(id, name)')
                .eq('active', true);
            
            if (empError || !employees) return;
            
            // Get existing sessions to preserve PINs if available
            const existingSessions = await getLocalAuthSessions();
            
            for (const emp of employees) {
                // Use PIN from cloud or generate a fallback
                const pin = emp.pin || '';
                
                if (pin) {
                    await saveLocalAuth({
                        id: emp.id,
                        employeeId: emp.id,
                        employeeName: emp.name,
                        role: emp.role as 'sales' | 'manager' | 'owner',
                        shopId: emp.shop_id,
                        shopName: (emp.shops as any)?.name || 'Unknown Shop',
                        pin: pin
                    });
                }
            }
            
            // Refresh available sessions
            const sessions = await getLocalAuthSessions();
            setAvailableSessions(sessions);
            
        } catch (e) {
            console.error('Failed to sync auth:', e);
        }
    }, []);

    return {
        login,
        logout,
        currentSession,
        isLoading,
        availableSessions,
        syncAuth
    };
}

// Hook to auto-sync auth when online
export function useAuthSync() {
    const [isOnlineState, setIsOnlineState] = useState(true);
    
    useEffect(() => {
        setIsOnlineState(navigator.onLine);
        
        const handleOnline = async () => {
            setIsOnlineState(true);
            // Trigger auth sync
            const { getLocalAuthSessions } = await import('@/lib/local-db');
            const sessions = await getLocalAuthSessions();
            if (sessions.length === 0) {
                // No cached credentials, need to sync
                console.log('No offline credentials, sync needed on next login');
            }
        };
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', () => setIsOnlineState(false));
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', () => setIsOnlineState(false));
        };
    }, []);
    
    return { isOnline: isOnlineState };
}

