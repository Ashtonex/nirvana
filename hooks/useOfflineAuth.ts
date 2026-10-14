'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
    getLocalAuthByPin, 
    saveLocalAuth, 
    getLocalAuthSessions,
    updateLocalAuthLastUsed,
    type LocalAuthSession 
} from '@/lib/local-db';
import { isOnline } from '@/lib/local-db';
import { ensureConnectivityMonitor, getConnectivity, subscribeConnectivity } from '@/lib/connectivity';

interface OfflineAuthResult {
    login: (pin: string) => Promise<{ success: boolean; session?: LocalAuthSession; error?: string }>;
    logout: () => Promise<void>;
    currentSession: LocalAuthSession | null;
    isLoading: boolean;
    availableSessions: LocalAuthSession[];
    syncAuth: () => Promise<void>;
    failedAttempts: number;
    isLockedOut: boolean;
}

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 30000; // 30 second cooldown after 5 failed attempts

export function useOfflineAuth(): OfflineAuthResult {
    const [currentSession, setCurrentSession] = useState<LocalAuthSession | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [availableSessions, setAvailableSessions] = useState<LocalAuthSession[]>([]);
    const [failedAttempts, setFailedAttempts] = useState(0);
    const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
    const [isLockedOut, setIsLockedOut] = useState(false);

    // Track lockout timer
    useEffect(() => {
        if (!lockoutUntil) {
            setIsLockedOut(false);
            return;
        }

        const remaining = lockoutUntil - Date.now();
        if (remaining <= 0) {
            setLockoutUntil(null);
            setIsLockedOut(false);
            setFailedAttempts(0);
            return;
        }

        setIsLockedOut(true);
        const timer = setTimeout(() => {
            setLockoutUntil(null);
            setIsLockedOut(false);
            setFailedAttempts(0);
        }, remaining);

        return () => clearTimeout(timer);
    }, [lockoutUntil]);

    // Load session from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem('nirvana-auth-session');
        if (stored) {
            try {
                const session = JSON.parse(stored) as LocalAuthSession;
                // Check if offline lease has expired
                if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
                    localStorage.removeItem('nirvana-auth-session');
                    setCurrentSession(null);
                } else {
                    setCurrentSession(session);
                }
            } catch (e) {
                localStorage.removeItem('nirvana-auth-session');
            }
        }
        
        // Load available sessions
        getLocalAuthSessions().then(setAvailableSessions);
    }, []);

    const login = useCallback(async (pin: string) => {
        if (isLockedOut) {
            const secondsLeft = Math.ceil(Math.max(0, (lockoutUntil || 0) - Date.now()) / 1000);
            return { success: false, error: `Too many failed attempts. Locked out for ${secondsLeft}s.` };
        }

        setIsLoading(true);
        try {
            // Try local auth with salted SHA-256 verification
            const session = await getLocalAuthByPin(pin);
            
            if (session) {
                // Check lease expiration
                if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
                    return { success: false, error: 'Offline credentials have expired (7-day lease). Connect to internet to refresh.' };
                }

                // Reset failed attempts
                setFailedAttempts(0);
                setLockoutUntil(null);

                // Update last used
                await updateLocalAuthLastUsed(session.employeeId);
                
                // Sanitize session for state (remove security hashes)
                const safeSession: LocalAuthSession = {
                    id: session.id,
                    employeeId: session.employeeId,
                    employeeName: session.employeeName,
                    role: session.role,
                    shopId: session.shopId,
                    shopName: session.shopName,
                    createdAt: session.createdAt,
                    lastUsed: new Date().toISOString(),
                    expiresAt: session.expiresAt
                };

                // Save to localStorage for persistence
                localStorage.setItem('nirvana-auth-session', JSON.stringify(safeSession));
                setCurrentSession(safeSession);
                
                return { success: true, session: safeSession };
            }
            
            // Record failed attempt
            const nextAttempts = failedAttempts + 1;
            setFailedAttempts(nextAttempts);
            if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
                setLockoutUntil(Date.now() + LOCKOUT_MS);
                return { success: false, error: 'Too many failed attempts. Temporary 30s lockout initiated.' };
            }

            // If offline and no local session found
            if (!(await isOnline())) {
                return { success: false, error: `Invalid PIN (${MAX_FAILED_ATTEMPTS - nextAttempts} attempts remaining).` };
            }
            
            return { success: false, error: 'INVALID_PIN' };
            
        } catch (e) {
            return { success: false, error: String(e) };
        } finally {
            setIsLoading(false);
        }
    }, [failedAttempts, isLockedOut, lockoutUntil]);

    const logout = useCallback(async () => {
        localStorage.removeItem('nirvana-auth-session');
        setCurrentSession(null);
    }, []);

    // Sync auth data from cloud when online
    const syncAuth = useCallback(async () => {
        if (!(await isOnline())) return;
        
        try {
            const { supabase } = await import('@/lib/supabase');
            
            const { data: employees, error: empError } = await supabase
                .from('employees')
                .select('id, name, role, shop_id, pin, shops(id, name)')
                .eq('active', true);
            
            if (empError || !employees) return;
            
            for (const emp of employees) {
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
        syncAuth,
        failedAttempts,
        isLockedOut
    };
}

// Hook to auto-sync auth when online
export function useAuthSync() {
    const [isOnlineState, setIsOnlineState] = useState(true);
    
    useEffect(() => {
        ensureConnectivityMonitor();
        setIsOnlineState(getConnectivity());

        const unsubscribe = subscribeConnectivity(async (online) => {
            setIsOnlineState(online);
            if (!online) return;

            const { getLocalAuthSessions } = await import('@/lib/local-db');
            const sessions = await getLocalAuthSessions();
            if (sessions.length === 0) {
                console.log('[Auth Sync] No offline credentials, syncing...');
            }
        });

        return unsubscribe;
    }, []);
    
    return { isOnline: isOnlineState };
}
