import Dexie, { type Table } from 'dexie';
import { ensureConnectivityMonitor, getConnectivity } from './connectivity';

// Types matching the server database
export interface LocalShop {
    id: string;
    name: string;
    expenses: {
        rent: number;
        salaries: number;
        utilities: number;
        misc: number;
    };
    lastSynced?: string;
    pendingSync?: boolean;
}

export interface LocalEmployee {
    id: string;
    name: string;
    role: 'sales' | 'manager' | 'owner';
    shopId: string;
    hireDate: string;
    active: boolean;
    lastSynced?: string;
    pendingSync?: boolean;
}

export interface LocalInventoryItem {
    id: string;
    shipmentId: string;
    category: string;
    name: string;
    acquisitionPrice: number;
    landedCost: number;
    overheadContribution: number;
    quantity: number;
    dateAdded: string;
    allocations: {
        shopId: string;
        quantity: number;
    }[];
    lastSynced?: string;
    pendingSync?: boolean;
}

export interface LocalCatalogItem {
    id: string;
    name: string;
    category: string;
    price: number;
    shopQuantity: number;
    shopId: string;
    landedCost?: number;
    sku?: string;
    updatedAt: string;
}

export interface LocalSale {
    id: string;
    shopId: string;
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    totalBeforeTax: number;
    tax: number;
    totalWithTax: number;
    date: string;
    employeeId: string;
    clientName?: string;
    paymentMethod?: string;
    discount?: number;
    lastSynced?: string;
    pendingSync?: boolean;
}

export interface LocalQueuedSale {
    id: string;
    shopId: string;
    employeeId: string;
    clientName?: string;
    clientPhone?: string;
    clientEmail?: string;
    paymentMethod: string;
    discount?: number;
    date: string;
    items: {
        itemId: string;
        itemName: string;
        quantity: number;
        unitPrice: number;
        discount?: number;
        tax?: number;
    }[];
    totalBeforeTax: number;
    tax: number;
    totalWithTax: number;
    syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
    syncAttempts: number;
    lastError?: string;
    createdAt: string;
    syncedAt?: string;
}

export interface LocalQueuedDrawerOp {
    id: string;
    shopId: string;
    employeeId: string;
    type: 'open' | 'close' | 'expense' | 'drop';
    amount: number;
    reason?: string;
    date: string;
    syncStatus: 'pending' | 'syncing' | 'synced' | 'failed';
    syncAttempts: number;
    lastError?: string;
    createdAt: string;
    syncedAt?: string;
}

export interface LocalSettings {
    id: string;
    taxRate: number;
    taxThreshold: number;
    taxMode: 'above_threshold' | 'all' | 'none';
    zombieDays: number;
    currencySymbol: string;
    lastSynced?: string;
    pendingSync?: boolean;
}

export interface PendingSyncItem {
    id?: number;
    type: 'shop' | 'employee' | 'inventory' | 'sale' | 'settings' | 'drawer' | 'queued_sale';
    action: 'create' | 'update' | 'delete';
    data: any;
    timestamp: string;
    retries: number;
}

export interface LocalAuthSession {
    id: string;
    employeeId: string;
    employeeName: string;
    role: 'sales' | 'manager' | 'owner';
    shopId: string;
    shopName: string;
    pinHash?: string;
    salt?: string;
    pin?: string; // Legacy plaintext PIN (migrated to pinHash on next login)
    createdAt: string;
    lastUsed: string;
    expiresAt?: string;
}

// SHA-256 PIN hashing using Web Crypto API
export async function hashPin(pin: string, salt: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
        const enc = new TextEncoder();
        const data = enc.encode(`${salt}:${pin}:nirvana_secure_v2`);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Fallback for non-browser/SSR test environments
    return `hash_${pin}_${salt}`;
}

export function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return `cl-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// Dexie database class
export class NirvanaLocalDB extends Dexie {
    shops!: Table<LocalShop>;
    employees!: Table<LocalEmployee>;
    inventory!: Table<LocalInventoryItem>;
    catalog!: Table<LocalCatalogItem>;
    sales!: Table<LocalSale>;
    queuedSales!: Table<LocalQueuedSale>;
    queuedDrawerOps!: Table<LocalQueuedDrawerOp>;
    settings!: Table<LocalSettings>;
    pendingSync!: Table<PendingSyncItem>;
    authSessions!: Table<LocalAuthSession>;

    constructor() {
        super('nirvana-local');
        
        this.version(1).stores({
            shops: 'id, name, lastSynced',
            employees: 'id, shopId, role, lastSynced',
            inventory: 'id, category, shipmentId, lastSynced',
            sales: 'id, shopId, employeeId, date, lastSynced',
            settings: 'id',
            pendingSync: '++id, type, timestamp'
        });

        // Version 2: Unified offline retail engine
        this.version(2).stores({
            shops: 'id, name, lastSynced',
            employees: 'id, shopId, role, lastSynced',
            inventory: 'id, category, shipmentId, lastSynced',
            catalog: 'id, shopId, category, name',
            sales: 'id, shopId, employeeId, date, lastSynced',
            queuedSales: 'id, shopId, employeeId, syncStatus, date',
            queuedDrawerOps: 'id, shopId, employeeId, syncStatus, date',
            settings: 'id',
            pendingSync: '++id, type, timestamp',
            authSessions: 'id, employeeId, shopId'
        });
    }
}

// Singleton instance
export const localDb = new NirvanaLocalDB();

// Helper functions
export async function isOnline(): Promise<boolean> {
    if (typeof navigator === 'undefined') return false;
    ensureConnectivityMonitor();
    return getConnectivity();
}

// Safe one-time legacy migration from 'nirvana-offline' and 'nirvana-auth'
let legacyMigrationDone = false;
export async function migrateLegacyDatabasesIfNeeded(): Promise<void> {
    if (legacyMigrationDone || typeof indexedDB === 'undefined') return;
    legacyMigrationDone = true;

    try {
        // 1. Check if 'nirvana-offline' has un-synced sales
        const dbs = await indexedDB.databases?.() || [];
        const hasOldOfflineDB = dbs.some(d => d.name === 'nirvana-offline');

        if (hasOldOfflineDB) {
            const req = indexedDB.open('nirvana-offline', 1);
            req.onsuccess = async () => {
                const oldDb = req.result;
                if (oldDb.objectStoreNames.contains('pending-sales')) {
                    const tx = oldDb.transaction('pending-sales', 'readonly');
                    const store = tx.objectStore('pending-sales');
                    const getAllReq = store.getAll();
                    getAllReq.onsuccess = async () => {
                        const oldSales = getAllReq.result || [];
                        if (oldSales.length > 0) {
                            console.log(`[Offline Migration] Found ${oldSales.length} legacy sales in nirvana-offline. Migrating...`);
                            for (const s of oldSales) {
                                const exists = await localDb.queuedSales.get(s.id);
                                if (!exists) {
                                    await localDb.queuedSales.put({
                                        id: s.id,
                                        shopId: s.shopId,
                                        employeeId: s.employeeId,
                                        clientName: s.clientName,
                                        paymentMethod: s.paymentMethod || 'cash',
                                        discount: s.discount || 0,
                                        date: s.date || new Date().toISOString(),
                                        items: [{
                                            itemId: s.itemId,
                                            itemName: s.itemName,
                                            quantity: Number(s.quantity || 1),
                                            unitPrice: Number(s.unitPrice || 0),
                                            discount: Number(s.discount || 0),
                                            tax: Number(s.tax || 0)
                                        }],
                                        totalBeforeTax: Number(s.totalBeforeTax || s.unitPrice || 0),
                                        tax: Number(s.tax || 0),
                                        totalWithTax: Number(s.totalWithTax || s.totalBeforeTax || 0),
                                        syncStatus: 'pending',
                                        syncAttempts: 0,
                                        createdAt: s.date || new Date().toISOString()
                                    });
                                }
                            }
                        }
                    };
                }
            };
        }

        // 2. Check if 'nirvana-auth' has saved auth sessions
        const hasOldAuthDB = dbs.some(d => d.name === 'nirvana-auth');
        if (hasOldAuthDB) {
            const reqAuth = indexedDB.open('nirvana-auth', 1);
            reqAuth.onsuccess = async () => {
                const oldAuthDb = reqAuth.result;
                if (oldAuthDb.objectStoreNames.contains('auth-sessions')) {
                    const tx = oldAuthDb.transaction('auth-sessions', 'readonly');
                    const store = tx.objectStore('auth-sessions');
                    const getAllReq = store.getAll();
                    getAllReq.onsuccess = async () => {
                        const oldSessions = getAllReq.result || [];
                        for (const session of oldSessions) {
                            const exists = await localDb.authSessions.get(session.id);
                            if (!exists) {
                                const salt = generateUUID();
                                const pinHash = session.pin ? await hashPin(session.pin, salt) : undefined;
                                await localDb.authSessions.put({
                                    ...session,
                                    salt,
                                    pinHash
                                });
                            }
                        }
                    };
                }
            };
        }
    } catch (e) {
        console.warn('[Offline Migration] Non-fatal migration check error:', e);
    }
}

// Auto-run migration check on browser load
if (typeof window !== 'undefined') {
    setTimeout(() => {
        migrateLegacyDatabasesIfNeeded();
    }, 100);
}

export async function saveToLocalAndQueue<T>(
    table: 'shops' | 'employees' | 'inventory' | 'sales' | 'settings',
    data: T & { id: string },
    syncType: 'create' | 'update' | 'delete'
): Promise<void> {
    const db = localDb;
    
    // Save to local database
    await db[table].put({
        ...data,
        lastSynced: new Date().toISOString(),
        pendingSync: true
    } as any);
    
    // Queue for sync if offline
    if (!(await isOnline())) {
        await db.pendingSync.add({
            type: table as any,
            action: syncType,
            data,
            timestamp: new Date().toISOString(),
            retries: 0
        });
    }
}

// Queue an offline sale
export async function queueOfflineSale(sale: Omit<LocalQueuedSale, 'id' | 'syncStatus' | 'syncAttempts' | 'createdAt'> & { id?: string }): Promise<string> {
    const id = sale.id || generateUUID();
    const queuedSale: LocalQueuedSale = {
        ...sale,
        id,
        syncStatus: 'pending',
        syncAttempts: 0,
        createdAt: new Date().toISOString()
    };

    await localDb.queuedSales.put(queuedSale);

    // Also update local catalog quantity optimistically if item is found in local catalog
    try {
        for (const line of sale.items) {
            const catItem = await localDb.catalog.get(line.itemId);
            if (catItem) {
                catItem.shopQuantity = Math.max(0, catItem.shopQuantity - line.quantity);
                await localDb.catalog.put(catItem);
            }
        }
    } catch (e) {
        console.warn('[Offline Sale] Could not decrement local catalog item:', e);
    }

    return id;
}

// Queue an offline cash drawer operation (open, close, expense, drop)
export async function queueOfflineDrawerOp(op: Omit<LocalQueuedDrawerOp, 'id' | 'syncStatus' | 'syncAttempts' | 'createdAt'> & { id?: string }): Promise<string> {
    const id = op.id || generateUUID();
    const queuedOp: LocalQueuedDrawerOp = {
        ...op,
        id,
        syncStatus: 'pending',
        syncAttempts: 0,
        createdAt: new Date().toISOString()
    };

    await localDb.queuedDrawerOps.put(queuedOp);
    return id;
}

export async function getPendingSyncCount(): Promise<number> {
    const pendingSales = await localDb.queuedSales.where('syncStatus').equals('pending').count();
    const pendingDrawer = await localDb.queuedDrawerOps.where('syncStatus').equals('pending').count();
    const legacyPending = await localDb.pendingSync.count();
    return pendingSales + pendingDrawer + legacyPending;
}

export async function clearSyncedItems(): Promise<void> {
    await localDb.transaction('rw', [localDb.shops, localDb.employees, localDb.inventory, localDb.sales, localDb.settings, localDb.queuedSales, localDb.queuedDrawerOps, localDb.pendingSync], async () => {
        await localDb.shops.toCollection().modify({ pendingSync: false });
        await localDb.employees.toCollection().modify({ pendingSync: false });
        await localDb.inventory.toCollection().modify({ pendingSync: false });
        await localDb.sales.toCollection().modify({ pendingSync: false });
        await localDb.pendingSync.clear();
        await localDb.queuedSales.where('syncStatus').equals('synced').delete();
        await localDb.queuedDrawerOps.where('syncStatus').equals('synced').delete();
    });
}

// Catalog caching for 0ms POS startup
export async function cacheCatalogForShop(shopId: string, items: LocalCatalogItem[]): Promise<void> {
    await localDb.catalog.bulkPut(items);
}

export async function getLocalCatalogForShop(shopId: string): Promise<LocalCatalogItem[]> {
    return await localDb.catalog.where('shopId').equals(shopId).toArray();
}

export async function getAllLocalShops(): Promise<LocalShop[]> {
    return await localDb.shops.toArray();
}

export async function getAllLocalEmployees(): Promise<LocalEmployee[]> {
    return await localDb.employees.toArray();
}

export async function getAllLocalInventory(): Promise<LocalInventoryItem[]> {
    return await localDb.inventory.toArray();
}

export async function getAllLocalSales(): Promise<LocalSale[]> {
    return await localDb.sales.orderBy('date').reverse().toArray();
}

export async function getLocalSettings(): Promise<LocalSettings | undefined> {
    return await localDb.settings.get('global');
}

export async function saveLocalShops(shops: LocalShop[]): Promise<void> {
    await localDb.shops.bulkPut(shops);
}

export async function saveLocalEmployees(employees: LocalEmployee[]): Promise<void> {
    await localDb.employees.bulkPut(employees);
}

export async function saveLocalInventory(items: LocalInventoryItem[]): Promise<void> {
    await localDb.inventory.bulkPut(items);
}

export async function saveLocalSales(sales: LocalSale[]): Promise<void> {
    await localDb.sales.bulkPut(sales);
}

export async function saveLocalSettings(settings: LocalSettings): Promise<void> {
    await localDb.settings.put(settings);
}

// Initialize with default settings if empty
export async function initLocalDB(): Promise<void> {
    const settings = await getLocalSettings();
    if (!settings) {
        await saveLocalSettings({
            id: 'global',
            taxRate: 0.155,
            taxThreshold: 0,
            taxMode: 'all',
            zombieDays: 60,
            currencySymbol: '$'
        });
    }
}

// Secure Local Authentication for Offline Operator Login
export async function saveLocalAuth(session: {
    id: string;
    employeeId: string;
    employeeName: string;
    role: 'sales' | 'manager' | 'owner';
    shopId: string;
    shopName: string;
    pin?: string;
    pinHash?: string;
    salt?: string;
    expiresAt?: string;
}): Promise<void> {
    const now = new Date().toISOString();
    let salt = session.salt || generateUUID();
    let pinHash = session.pinHash;

    if (session.pin && !pinHash) {
        pinHash = await hashPin(session.pin, salt);
    }

    const authSession: LocalAuthSession = {
        id: session.id,
        employeeId: session.employeeId,
        employeeName: session.employeeName,
        role: session.role,
        shopId: session.shopId,
        shopName: session.shopName,
        pinHash,
        salt,
        createdAt: now,
        lastUsed: now,
        expiresAt: session.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    };

    await localDb.authSessions.put(authSession);
}

export async function getLocalAuthSessions(): Promise<LocalAuthSession[]> {
    return await localDb.authSessions.toArray();
}

export async function getLocalAuthByPin(pin: string): Promise<LocalAuthSession | undefined> {
    const sessions = await getLocalAuthSessions();
    for (const session of sessions) {
        // If modern salted hash is present:
        if (session.pinHash && session.salt) {
            const computed = await hashPin(pin, session.salt);
            if (computed === session.pinHash) {
                return session;
            }
        }
        // Backward compatibility: legacy unhashed PIN migration
        if (session.pin && session.pin === pin) {
            // Upgrade to salted hash immediately
            const salt = generateUUID();
            const pinHash = await hashPin(pin, salt);
            session.pinHash = pinHash;
            session.salt = salt;
            delete session.pin;
            await localDb.authSessions.put(session);
            return session;
        }
    }
    return undefined;
}

export async function updateLocalAuthLastUsed(employeeId: string): Promise<void> {
    const session = await localDb.authSessions.where('employeeId').equals(employeeId).first();
    if (session) {
        session.lastUsed = new Date().toISOString();
        await localDb.authSessions.put(session);
    }
}

export async function deleteLocalAuth(employeeId: string): Promise<void> {
    await localDb.authSessions.where('employeeId').equals(employeeId).delete();
}

export async function clearAllLocalAuth(): Promise<void> {
    await localDb.authSessions.clear();
}
