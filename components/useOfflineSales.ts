'use client';

import { useEffect, useCallback, useState } from 'react';
import { ensureConnectivityMonitor, getConnectivity, subscribeConnectivity } from '@/lib/connectivity';
import { queueOfflineSale, getPendingSyncCount } from '@/lib/local-db';
import { syncEngine, type SyncStatus } from '@/lib/sync-engine';

export interface PendingSale {
    id?: string;
    shopId: string;
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalBeforeTax?: number;
    employeeId: string;
    clientName?: string;
    paymentMethod?: string;
    discount?: number;
    date?: string;
}

export function useOfflineSales() {
    const [isOnline, setIsOnline] = useState(true);
    const [pendingCount, setPendingCount] = useState(0);
    const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncEngine.getStatus());

    useEffect(() => {
        ensureConnectivityMonitor();
        setIsOnline(getConnectivity());

        const unsubConnectivity = subscribeConnectivity((online) => {
            setIsOnline(online);
        });

        const unsubSync = syncEngine.subscribe((status) => {
            setSyncStatus(status);
            setPendingCount(status.pendingCount);
        });

        // Background sync registration if supported
        if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'SyncManager' in window) {
            navigator.serviceWorker.ready.then((registration) => {
                (registration as any).sync?.register('sync-sales').catch(() => {});
            }).catch(() => {});
        }

        return () => {
            unsubConnectivity();
            unsubSync();
        };
    }, []);

    const saveSaleOffline = useCallback(async (sale: PendingSale): Promise<string> => {
        const date = sale.date || new Date().toISOString();
        const unitPrice = Number(sale.unitPrice || 0);
        const quantity = Number(sale.quantity || 1);
        const discount = Number(sale.discount || 0);
        const subtotal = Math.max(0, (unitPrice * quantity) - discount);
        const taxRate = 0.155;
        const tax = subtotal * taxRate;
        const totalWithTax = subtotal + tax;

        const id = await queueOfflineSale({
            id: sale.id,
            shopId: sale.shopId,
            employeeId: sale.employeeId,
            clientName: sale.clientName || 'General Walk-in',
            paymentMethod: sale.paymentMethod || 'cash',
            discount,
            date,
            items: [{
                itemId: sale.itemId,
                itemName: sale.itemName,
                quantity,
                unitPrice,
                discount,
                tax
            }],
            totalBeforeTax: subtotal,
            tax,
            totalWithTax
        });

        await syncEngine.refreshPendingCount();

        // If online, immediately try to flush
        if (getConnectivity()) {
            syncEngine.syncNow().catch(() => {});
        }

        return id;
    }, []);

    const syncPendingSales = useCallback(async () => {
        await syncEngine.syncNow();
    }, []);

    const getPendingCount = useCallback(async (): Promise<number> => {
        return await getPendingSyncCount();
    }, []);

    return {
        saveSaleOffline,
        syncPendingSales,
        getPendingCount,
        isOnline,
        pendingCount,
        isSyncing: syncStatus.isSyncing,
        failedCount: syncStatus.failedCount,
        lastSyncTime: syncStatus.lastSyncTime
    };
}
