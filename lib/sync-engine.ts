import { localDb, type LocalQueuedSale, type LocalQueuedDrawerOp, getPendingSyncCount } from './local-db';
import { getConnectivity, subscribeConnectivity, ensureConnectivityMonitor } from './connectivity';

export interface SyncStatus {
    isSyncing: boolean;
    pendingCount: number;
    failedCount: number;
    lastSyncTime: string | null;
    lastError: string | null;
}

type SyncListener = (status: SyncStatus) => void;

class SyncEngine {
    private isSyncing = false;
    private listeners = new Set<SyncListener>();
    private timer: ReturnType<typeof setInterval> | null = null;
    private channel: BroadcastChannel | null = null;
    private status: SyncStatus = {
        isSyncing: false,
        pendingCount: 0,
        failedCount: 0,
        lastSyncTime: null,
        lastError: null,
    };

    constructor() {
        if (typeof window !== 'undefined') {
            ensureConnectivityMonitor();
            if ('BroadcastChannel' in window) {
                this.channel = new BroadcastChannel('nirvana-sync-engine');
                this.channel.onmessage = (event) => {
                    if (event.data?.type === 'SYNC_STATUS_UPDATE') {
                        this.updateStatus(event.data.status, false);
                    }
                };
            }

            // Trigger sync on reconnection
            subscribeConnectivity((online) => {
                if (online) {
                    this.syncNow();
                }
            });

            // Trigger sync on tab focus or visibility change
            window.addEventListener('focus', () => {
                if (getConnectivity()) this.syncNow();
            });

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && getConnectivity()) {
                    this.syncNow();
                }
            });

            // Start periodic background sync check (every 30 seconds)
            this.timer = setInterval(() => {
                if (getConnectivity() && !this.isSyncing) {
                    this.syncNow();
                }
            }, 30000);

            // Initial count check
            this.refreshPendingCount();
        }
    }

    public subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener);
        listener(this.status);
        return () => {
            this.listeners.delete(listener);
        };
    }

    public getStatus(): SyncStatus {
        return { ...this.status };
    }

    public async refreshPendingCount(): Promise<number> {
        try {
            const count = await getPendingSyncCount();
            const failedSales = await localDb.queuedSales.where('syncStatus').equals('failed').count();
            const failedDrawer = await localDb.queuedDrawerOps.where('syncStatus').equals('failed').count();
            
            this.updateStatus({
                pendingCount: count,
                failedCount: failedSales + failedDrawer,
            });
            return count;
        } catch {
            return 0;
        }
    }

    private updateStatus(partial: Partial<SyncStatus>, broadcast = true) {
        this.status = { ...this.status, ...partial };
        this.listeners.forEach((cb) => cb(this.status));

        if (broadcast && this.channel) {
            try {
                this.channel.postMessage({ type: 'SYNC_STATUS_UPDATE', status: this.status });
            } catch {}
        }
    }

    public async syncNow(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
        if (this.isSyncing || !getConnectivity()) {
            return { success: false, syncedCount: 0, errors: ['Already syncing or offline'] };
        }

        this.isSyncing = true;
        this.updateStatus({ isSyncing: true, lastError: null });

        let syncedCount = 0;
        const errors: string[] = [];

        try {
            // 1. Sync Cash Drawer Operations (Dependencies first: register openings)
            const pendingDrawerOps = await localDb.queuedDrawerOps
                .where('syncStatus')
                .equals('pending')
                .or('syncStatus')
                .equals('failed')
                .toArray();

            for (const op of pendingDrawerOps) {
                try {
                    await localDb.queuedDrawerOps.update(op.id, { syncStatus: 'syncing' });
                    const res = await fetch('/api/drawer/offline', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(op),
                        credentials: 'include'
                    });

                    if (res.ok) {
                        await localDb.queuedDrawerOps.update(op.id, {
                            syncStatus: 'synced',
                            syncedAt: new Date().toISOString()
                        });
                        syncedCount++;
                    } else {
                        const data = await res.json().catch(() => ({}));
                        const errMsg = data.error || `HTTP ${res.status}`;
                        await localDb.queuedDrawerOps.update(op.id, {
                            syncStatus: 'failed',
                            syncAttempts: (op.syncAttempts || 0) + 1,
                            lastError: errMsg
                        });
                        errors.push(`Drawer op ${op.id}: ${errMsg}`);
                    }
                } catch (e: any) {
                    await localDb.queuedDrawerOps.update(op.id, {
                        syncStatus: 'failed',
                        syncAttempts: (op.syncAttempts || 0) + 1,
                        lastError: e?.message || 'Network error'
                    });
                    errors.push(`Drawer op ${op.id}: Network error`);
                }
            }

            // 2. Sync Queued Sales
            const pendingSales = await localDb.queuedSales
                .where('syncStatus')
                .equals('pending')
                .or('syncStatus')
                .equals('failed')
                .toArray();

            for (const sale of pendingSales) {
                try {
                    await localDb.queuedSales.update(sale.id, { syncStatus: 'syncing' });

                    // A queued sale can have multiple items; sync each item
                    let allItemsSynced = true;
                    for (let idx = 0; idx < sale.items.length; idx++) {
                        const line = sale.items[idx];
                        const lineId = sale.items.length === 1 ? sale.id : `${sale.id}_item_${idx + 1}`;

                        const payload = {
                            id: lineId,
                            shopId: sale.shopId,
                            employeeId: sale.employeeId,
                            clientName: sale.clientName || 'General Walk-in',
                            paymentMethod: sale.paymentMethod || 'cash',
                            discount: line.discount || 0,
                            itemId: line.itemId,
                            itemName: line.itemName,
                            quantity: line.quantity,
                            unitPrice: line.unitPrice,
                            totalBeforeTax: line.unitPrice * line.quantity,
                            date: sale.date
                        };

                        const res = await fetch('/api/sales/offline', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                            credentials: 'include'
                        });

                        if (!res.ok) {
                            allItemsSynced = false;
                            const data = await res.json().catch(() => ({}));
                            errors.push(`Sale ${sale.id} line ${line.itemName}: ${data.error || res.status}`);
                            break;
                        }
                    }

                    if (allItemsSynced) {
                        await localDb.queuedSales.update(sale.id, {
                            syncStatus: 'synced',
                            syncedAt: new Date().toISOString()
                        });
                        syncedCount++;
                    } else {
                        await localDb.queuedSales.update(sale.id, {
                            syncStatus: 'failed',
                            syncAttempts: (sale.syncAttempts || 0) + 1,
                            lastError: errors[errors.length - 1] || 'Sync failed'
                        });
                    }
                } catch (e: any) {
                    await localDb.queuedSales.update(sale.id, {
                        syncStatus: 'failed',
                        syncAttempts: (sale.syncAttempts || 0) + 1,
                        lastError: e?.message || 'Network error'
                    });
                    errors.push(`Sale ${sale.id}: Network failure`);
                }
            }

            // Refresh counts
            await this.refreshPendingCount();

            this.updateStatus({
                isSyncing: false,
                lastSyncTime: new Date().toISOString(),
                lastError: errors.length > 0 ? errors[0] : null
            });

            return {
                success: errors.length === 0,
                syncedCount,
                errors
            };

        } catch (globalErr: any) {
            this.updateStatus({
                isSyncing: false,
                lastError: globalErr?.message || 'Sync error'
            });
            return {
                success: false,
                syncedCount,
                errors: [globalErr?.message || 'Global sync failure']
            };
        } finally {
            this.isSyncing = false;
        }
    }
}

export const syncEngine = new SyncEngine();

export function useSyncEngine() {
    return syncEngine;
}
