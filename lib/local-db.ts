import Dexie, { type Table } from 'dexie';

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
    type: 'shop' | 'employee' | 'inventory' | 'sale' | 'settings';
    action: 'create' | 'update' | 'delete';
    data: any;
    timestamp: string;
    retries: number;
}

// Dexie database class
export class NirvanaLocalDB extends Dexie {
    shops!: Table<LocalShop>;
    employees!: Table<LocalEmployee>;
    inventory!: Table<LocalInventoryItem>;
    sales!: Table<LocalSale>;
    settings!: Table<LocalSettings>;
    pendingSync!: Table<PendingSyncItem>;

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
    }
}

// Singleton instance
export const localDb = new NirvanaLocalDB();

// Helper functions
export async function isOnline(): Promise<boolean> {
    if (typeof navigator !== 'undefined') {
        return navigator.onLine;
    }
    return false;
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

export async function getPendingSyncCount(): Promise<number> {
    return await localDb.pendingSync.count();
}

export async function clearSyncedItems(): Promise<void> {
    await localDb.transaction('rw', [localDb.shops, localDb.employees, localDb.inventory, localDb.sales, localDb.settings], async () => {
        // Clear pendingSync flags from all tables
        await localDb.shops.toCollection().modify({ pendingSync: false });
        await localDb.employees.toCollection().modify({ pendingSync: false });
        await localDb.inventory.toCollection().modify({ pendingSync: false });
        await localDb.sales.toCollection().modify({ pendingSync: false });
        
        // Clear pending sync queue
        await localDb.pendingSync.clear();
    });
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

// Local Authentication for Offline Login
export interface LocalAuthSession {
    id: string;
    employeeId: string;
    employeeName: string;
    role: 'sales' | 'manager' | 'owner';
    shopId: string;
    shopName: string;
    pin: string;
    createdAt: string;
    lastUsed: string;
}

const AUTH_STORE = 'auth-sessions';

export async function saveLocalAuth(session: Omit<LocalAuthSession, 'createdAt' | 'lastUsed'>): Promise<void> {
    const db = await openAuthDB();
    const now = new Date().toISOString();
    const tx = db.transaction(AUTH_STORE, 'readwrite');
    const store = tx.objectStore(AUTH_STORE);
    
    return new Promise((resolve, reject) => {
        const request = store.put({
            ...session,
            createdAt: now,
            lastUsed: now
        });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getLocalAuthSessions(): Promise<LocalAuthSession[]> {
    const db = await openAuthDB();
    const tx = db.transaction(AUTH_STORE, 'readonly');
    const store = tx.objectStore(AUTH_STORE);
    
    return new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function getLocalAuthByPin(pin: string): Promise<LocalAuthSession | undefined> {
    const sessions = await getLocalAuthSessions();
    return sessions.find(s => s.pin === pin);
}

export async function updateLocalAuthLastUsed(employeeId: string): Promise<void> {
    const sessions = await getLocalAuthSessions();
    const session = sessions.find(s => s.employeeId === employeeId);
    if (session) {
        session.lastUsed = new Date().toISOString();
        await saveLocalAuth(session);
    }
}

export async function deleteLocalAuth(employeeId: string): Promise<void> {
    const db = await openAuthDB();
    const tx = db.transaction(AUTH_STORE, 'readwrite');
    const store = tx.objectStore(AUTH_STORE);
    const index = store.index('employeeId');
    
    return new Promise((resolve, reject) => {
        const request = index.openCursor(IDBKeyRange.only(employeeId));
        request.onsuccess = () => {
            const cursor = request.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

export async function clearAllLocalAuth(): Promise<void> {
    const db = await openAuthDB();
    const tx = db.transaction(AUTH_STORE, 'readwrite');
    const store = tx.objectStore(AUTH_STORE);
    
    return new Promise((resolve, reject) => {
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function openAuthDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('nirvana-auth', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(AUTH_STORE)) {
                const store = db.createObjectStore(AUTH_STORE, { keyPath: 'id' });
                store.createIndex('employeeId', 'employeeId', { unique: false });
            }
        };
    });
}

