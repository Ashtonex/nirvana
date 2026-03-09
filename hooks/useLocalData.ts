'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { 
    localDb, 
    initLocalDB,
    isOnline,
    getAllLocalShops,
    getAllLocalEmployees,
    getAllLocalInventory,
    getAllLocalSales,
    getLocalSettings,
    saveLocalShops,
    saveLocalEmployees,
    saveLocalInventory,
    saveLocalSales,
    saveLocalSettings,
    getPendingSyncCount,
    clearSyncedItems,
    type LocalShop,
    type LocalEmployee,
    type LocalInventoryItem,
    type LocalSale,
    type LocalSettings
} from '@/lib/local-db';

interface UseLocalDataResult<T> {
    data: T | null;
    isLoading: boolean;
    isOnline: boolean;
    pendingSyncCount: number;
    lastSynced: string | null;
    error: string | null;
    refresh: () => Promise<void>;
    save: (data: T) => Promise<void>;
}

export function useLocalShops(): UseLocalDataResult<LocalShop[]> {
    return useLocalData('shops', getAllLocalShops, saveLocalShops);
}

export function useLocalEmployees(): UseLocalDataResult<LocalEmployee[]> {
    return useLocalData('employees', getAllLocalEmployees, saveLocalEmployees);
}

export function useLocalInventory(): UseLocalDataResult<LocalInventoryItem[]> {
    return useLocalData('inventory', getAllLocalInventory, saveLocalInventory);
}

export function useLocalSales(): UseLocalDataResult<LocalSale[]> {
    return useLocalData('sales', getAllLocalSales, saveLocalSales);
}

export function useLocalSettings(): UseLocalDataResult<LocalSettings> {
    const [data, setData] = useState<LocalSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOnlineState, setIsOnlineState] = useState(true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [lastSynced, setLastSynced] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const initialized = useRef(false);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const online = await isOnline();
            setIsOnlineState(online);
            
            // Get local data first
            const localSettings = await getLocalSettings();
            if (localSettings) {
                setData(localSettings);
                setLastSynced(localSettings.lastSynced || null);
            }
            
            // If online, try to sync from cloud
            if (online && typeof window !== 'undefined') {
                try {
                    const { supabase } = await import('@/lib/supabase');
                    const { data: cloudSettings, error: cloudError } = await supabase
                        .from('oracle_settings')
                        .select('*')
                        .single();
                    
                    if (!cloudError && cloudSettings) {
                        const settings: LocalSettings = {
                            id: 'global',
                            taxRate: cloudSettings.tax_rate || 0.155,
                            taxThreshold: cloudSettings.tax_threshold || 0,
                            taxMode: cloudSettings.tax_mode || 'all',
                            zombieDays: cloudSettings.zombie_days || 60,
                            currencySymbol: cloudSettings.currency_symbol || '$',
                            lastSynced: new Date().toISOString()
                        };
                        await saveLocalSettings(settings);
                        setData(settings);
                        setLastSynced(settings.lastSynced || null);
                    }
                } catch (e) {
                    console.error('Failed to sync from cloud:', e);
                }
            }
            
            const count = await getPendingSyncCount();
            setPendingSyncCount(count);
            setError(null);
        } catch (e) {
            setError(String(e));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        
        initLocalDB().then(() => refresh());
        
        // Listen for online/offline events
        const handleOnline = () => setIsOnlineState(true);
        const handleOffline = () => setIsOnlineState(false);
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [refresh]);

    const save = useCallback(async (newData: LocalSettings) => {
        try {
            await saveLocalSettings({
                ...newData,
                lastSynced: new Date().toISOString(),
                pendingSync: !isOnlineState
            });
            setData(newData);
            const count = await getPendingSyncCount();
            setPendingSyncCount(count);
        } catch (e) {
            setError(String(e));
            throw e;
        }
    }, [isOnlineState]);

    return { data, isLoading, isOnline: isOnlineState, pendingSyncCount, lastSynced, error, refresh, save };
}

function useLocalData<T>(
    _key: string,
    getLocal: () => Promise<T>,
    saveLocal: (data: T) => Promise<void>
): UseLocalDataResult<T> {
    const [data, setData] = useState<T | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isOnlineState, setIsOnlineState] = useState(true);
    const [pendingSyncCount, setPendingSyncCount] = useState(0);
    const [lastSynced, setLastSynced] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const initialized = useRef(false);

    const refresh = useCallback(async () => {
        setIsLoading(true);
        try {
            const online = await isOnline();
            setIsOnlineState(online);
            
            // Always get local data first (instant)
            const localData = await getLocal();
            setData(localData);
            
            // Get sync status from any item
            if (localData && Array.isArray(localData) && localData.length > 0) {
                const anyItem = localData[0] as any;
                setLastSynced(anyItem.lastSynced || null);
            }
            
            // If online, sync from cloud in background
            if (online && typeof window !== 'undefined') {
                try {
                    // This will be implemented per-entity type
                    await syncFromCloud(_key as any, getLocal, saveLocal);
                } catch (e) {
                    console.error('Cloud sync failed:', e);
                }
            }
            
            const count = await getPendingSyncCount();
            setPendingSyncCount(count);
            setError(null);
        } catch (e) {
            setError(String(e));
        } finally {
            setIsLoading(false);
        }
    }, [_key, getLocal, saveLocal]);

    useEffect(() => {
        if (initialized.current) return;
        initialized.current = true;
        
        initLocalDB().then(() => refresh());
        
        // Listen for online/offline
        const handleOnline = () => setIsOnlineState(true);
        const handleOffline = () => setIsOnlineState(false);
        
        if (typeof window !== 'undefined') {
            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);
        }
        
        return () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            }
        };
    }, [refresh]);

    const save = useCallback(async (newData: T) => {
        try {
            await saveLocal(newData);
            setData(newData);
            const count = await getPendingSyncCount();
            setPendingSyncCount(count);
        } catch (e) {
            setError(String(e));
            throw e;
        }
    }, [saveLocal]);

    return { data, isLoading, isOnline: isOnlineState, pendingSyncCount, lastSynced, error, refresh, save };
}

// Helper to sync from cloud - implemented per entity type
async function syncFromCloud(
    entity: 'shops' | 'employees' | 'inventory' | 'sales',
    getLocal: () => Promise<any>,
    saveLocal: (data: any) => Promise<void>
): Promise<void> {
    const { supabase } = await import('@/lib/supabase');
    
    let query = supabase.from(entity).select('*');
    const { data: cloudData, error } = await query;
    
    if (error || !cloudData) {
        console.error(`Failed to sync ${entity} from cloud:`, error);
        return;
    }
    
    // Transform cloud data to local format and save
    const localData = transformToLocal(entity, cloudData);
    await saveLocal(localData);
}

function transformToLocal(entity: string, cloudData: any[]): any {
    const now = new Date().toISOString();
    
    switch (entity) {
        case 'shops':
            return cloudData.map((shop: any) => ({
                id: shop.id,
                name: shop.name,
                expenses: shop.expenses || { rent: 0, salaries: 0, utilities: 0, misc: 0 },
                lastSynced: now,
                pendingSync: false
            }));
        
        case 'employees':
            return cloudData.map((emp: any) => ({
                id: emp.id,
                name: emp.name,
                role: emp.role,
                shopId: emp.shop_id,
                hireDate: emp.hire_date,
                active: emp.active,
                lastSynced: now,
                pendingSync: false
            }));
        
        case 'inventory':
            return cloudData.map((item: any) => ({
                id: item.id,
                shipmentId: item.shipment_id,
                category: item.category,
                name: item.name,
                acquisitionPrice: item.acquisition_price,
                landedCost: item.landed_cost,
                overheadContribution: item.overhead_contribution,
                quantity: item.quantity,
                dateAdded: item.date_added,
                allocations: item.allocations || [],
                lastSynced: now,
                pendingSync: false
            }));
        
        case 'sales':
            return cloudData.map((sale: any) => ({
                id: sale.id,
                shopId: sale.shop_id,
                itemId: sale.item_id,
                itemName: sale.item_name,
                quantity: sale.quantity,
                unitPrice: sale.unit_price,
                totalBeforeTax: sale.total_before_tax,
                tax: sale.tax,
                totalWithTax: sale.total_with_tax,
                date: sale.date,
                employeeId: sale.employee_id,
                clientName: sale.client_name,
                paymentMethod: sale.payment_method,
                discount: sale.discount_applied,
                lastSynced: now,
                pendingSync: false
            }));
        
        default:
            return cloudData;
    }
}

// Hook to sync all pending changes when back online
export function useSyncOnConnect() {
    const [isSyncing, setIsSyncing] = useState(false);

    useEffect(() => {
        const handleOnline = async () => {
            console.log('Back online! Syncing pending changes...');
            setIsSyncing(true);
            
            try {
                // Sync pending sales (already implemented)
                // Additional sync logic can be added here
                await clearSyncedItems();
                console.log('Sync complete!');
            } catch (e) {
                console.error('Sync failed:', e);
            } finally {
                setIsSyncing(false);
            }
        };

        window.addEventListener('online', handleOnline);
        return () => window.removeEventListener('online', handleOnline);
    }, []);

    return { isSyncing };
}

// Combined hook for app-wide offline status
export function useAppOfflineStatus() {
    const [isOnlineState, setIsOnlineState] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);

    useEffect(() => {
        setIsOnlineState(navigator.onLine);
        
        const updateStatus = async () => {
            setIsOnlineState(navigator.onLine);
            if (navigator.onLine) {
                const count = await getPendingSyncCount();
                setPendingCount(count);
            }
        };
        
        window.addEventListener('online', updateStatus);
        window.addEventListener('offline', updateStatus);
        
        // Initial count
        getPendingSyncCount().then(setPendingCount);
        
        return () => {
            window.removeEventListener('online', updateStatus);
            window.removeEventListener('offline', updateStatus);
        };
    }, []);

    return { isOnline: isOnlineState, pendingCount };
}

