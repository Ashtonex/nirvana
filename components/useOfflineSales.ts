'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

interface PendingSale {
    id: string;
    shopId: string;
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalBeforeTax: number;
    employeeId: string;
    clientName: string;
    paymentMethod: string;
    discount?: number;
    date: string;
}

const DB_NAME = 'nirvana-offline';
const STORE_NAME = 'pending-sales';

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
    });
}

async function getPendingCountFromDB(): Promise<number> {
    try {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const request = tx.objectStore(STORE_NAME).count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch {
        return 0;
    }
}

async function syncPendingSalesFromDB(onSync?: () => void) {
    if (!navigator.onLine) return;
    
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const getAllRequest = store.getAll();
        
        getAllRequest.onsuccess = async () => {
            const sales = getAllRequest.result as PendingSale[];
            
            for (const sale of sales) {
                try {
                    const response = await fetch('/api/sales/offline', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(sale),
                        credentials: 'include'
                    });
                    
                    if (response.ok) {
                        const deleteTx = db.transaction(STORE_NAME, 'readwrite');
                        deleteTx.objectStore(STORE_NAME).delete(sale.id);
                    }
                } catch (e) {
                    console.error('Failed to sync sale:', sale.id, e);
                }
            }
            onSync?.();
        };
    } catch (e) {
        console.error('Failed to open DB for sync:', e);
    }
}

export function useOfflineSales() {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const isOnlineRef = useRef(true);
    const syncPendingSalesRef = useRef<() => Promise<void>>(() => Promise.resolve());
    const getPendingCountRef = useRef<() => Promise<number>>(() => Promise.resolve(0));

    useEffect(() => {
        isOnlineRef.current = navigator.onLine;
        setIsOnline(navigator.onLine);
        
        const handleOnline = () => {
            isOnlineRef.current = true;
            setIsOnline(true);
            syncPendingSalesRef.current();
        };
        
        const handleOffline = () => {
            isOnlineRef.current = false;
            setIsOnline(false);
        };
        
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        // Try to sync on mount
        syncPendingSalesRef.current();
        
        // Get initial pending count
        getPendingCountRef.current().then(setPendingCount);
        
        // Register background sync
        if ('serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then((registration) => {
                (registration as any).sync.register('sync-sales').catch(console.error);
            });
        }
        
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const saveSaleOffline = useCallback(async (sale: Omit<PendingSale, 'id' | 'date'>): Promise<string> => {
        const db = await openDB();
        const id = `offline-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        const pendingSale: PendingSale = {
            ...sale,
            id,
            date: new Date().toISOString()
        };
        
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.add(pendingSale);
            
            request.onsuccess = async () => {
                const count = await getPendingCountFromDB();
                setPendingCount(count);
                if (isOnlineRef.current) {
                    syncPendingSalesFromDB(async () => {
                        const newCount = await getPendingCountFromDB();
                        setPendingCount(newCount);
                    });
                }
                resolve(id);
            };
            
            request.onerror = () => reject(request.error);
        });
    }, []);

    const syncPendingSales = useCallback(async () => {
        await syncPendingSalesFromDB(async () => {
            const count = await getPendingCountFromDB();
            setPendingCount(count);
        });
    }, []);

    const getPendingCount = useCallback(async (): Promise<number> => {
        return getPendingCountFromDB();
    }, []);

    syncPendingSalesRef.current = syncPendingSales;
    getPendingCountRef.current = getPendingCount;

    return {
        saveSaleOffline,
        syncPendingSales,
        getPendingCount,
        isOnline,
        pendingCount
    };
}
