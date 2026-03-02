import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'lib', 'db.json');
const BACKUP_COUNT = 5;

export interface ShopExpenses {
  rent: number;
  salaries: number;
  utilities: number;
  misc: number;
}

export interface Employee {
  id: string;
  name: string;
  role: 'sales' | 'manager' | 'owner';
  shopId: string;
  hireDate: string;
  active: boolean;
}

export interface Shop {
  id: string;
  name: string;
  expenses: ShopExpenses;
}

export interface InventoryItem {
  id: string;
  shipmentId: string;
  category: string;
  name: string;
  acquisitionPrice: number; // Raw unit price from supplier
  landedCost: number;       // inclusion of shipping/duty per piece
  overheadContribution: number; // inclusion of rent/salary/etc per piece
  quantity: number;
  dateAdded: string;
  allocations: {
    shopId: string;
    quantity: number;
  }[];
}

export interface Sale {
  id: string;
  shopId: string;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  totalBeforeTax: number;
  tax: number; // 15.5%
  totalWithTax: number;
  date: string;
  employeeId: string;
  clientName?: string;
}

export interface Shipment {
  id: string;
  date: string;
  supplier: string;
  shipmentNumber: string;
  purchasePrice: number;
  shippingCost: number;
  dutyCost: number;
  miscCost: number;
  manifestPieces: number; // Added this
  items: string[]; // item IDs
  totalQuantity: number;
}

export interface FinancialEntry {
  id: string;
  type: 'income' | 'expense' | 'asset' | 'liability';
  category: string;
  amount: number;
  date: string;
  description: string;
  shopId?: string; // Global if null
}

export interface Quotation {
  id: string;
  shopId: string;
  clientName: string;
  items: {
    itemId: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  totalBeforeTax: number;
  tax: number;
  totalWithTax: number;
  date: string;
  expiryDate: string;
  status: 'pending' | 'converted' | 'expired';
  employeeId: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  employeeId: string;
  action: string; // e.g., 'RECORD_SALE', 'SHIPMENT_PROCESSED', 'INV_TRANSFER'
  details: string;
  changes?: { field: string; old: any; new: any }[];
}

export interface OracleEmail {
  id: string;
  timestamp: string;
  to: string;
  subject: string;
  body: string;
  type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'alert';
}

export interface GlobalSettings {
  taxRate: number;
  taxThreshold: number; // Only charge tax if price >= threshold
  taxMode: 'above_threshold' | 'all' | 'none';
  zombieDays: number;
  currencySymbol: string;
}

export interface Database {
  shops: Shop[];
  globalExpenses: Record<string, number>;
  shipments: Shipment[];
  inventory: InventoryItem[];
  sales: Sale[];
  transfers: any[];
  ledger: FinancialEntry[];
  quotations: Quotation[];
  employees: Employee[];
  auditLog: AuditEntry[];
  oracleEmails: OracleEmail[];
  settings: GlobalSettings;
}

export async function readDb(): Promise<Database> {
  try {
    const data = await fs.readFile(DB_PATH, 'utf-8');
    const db = JSON.parse(data);

    // Robustness: Ensure all required arrays exist
    return {
      ...db,
      shipments: db.shipments || [],
      inventory: db.inventory || [],
      sales: db.sales || [],
      transfers: db.transfers || [],
      ledger: db.ledger || [],
      quotations: db.quotations || [],
      employees: db.employees || [],
      auditLog: db.auditLog || [],
      oracleEmails: db.oracleEmails || [],
      settings: db.settings || {
        taxRate: 0.155,
        taxThreshold: 0,
        taxMode: 'all',
        zombieDays: 60,
        currencySymbol: '$'
      }
    };
  } catch (error) {
    // If file doesn't exist or is corrupt, return empty structure (or handle recovery)
    console.error("Database read error:", error);
    // Return a default empty DB structure if read fails to prevent app crash
    return {
      shops: [],
      globalExpenses: {},
      shipments: [],
      inventory: [],
      sales: [],
      transfers: [],
      ledger: [],
      quotations: [],
      employees: [],
      auditLog: [],
      oracleEmails: [],
      settings: {
        taxRate: 0.155,
        taxThreshold: 0,
        taxMode: 'all',
        zombieDays: 60,
        currencySymbol: '$'
      }
    };
  }
}

export async function writeDb(data: Database): Promise<void> {
  const lockPath = `${DB_PATH}.lock`;

  // 1. Simple Retry-based Locking
  let retries = 5;
  while (retries > 0) {
    try {
      // exclusive 'x' flag creates file or fails if exists
      const handle = await fs.open(lockPath, 'wx');
      await handle.close();
      break;
    } catch (e) {
      retries--;
      if (retries === 0) throw new Error("Database is busy (Lock timeout)");
      await new Promise(resolve => setTimeout(resolve, 100)); // wait 100ms
    }
  }

  try {
    // 2. Backup logic
    try {
      const currentContent = await fs.readFile(DB_PATH, 'utf-8');
      for (let i = BACKUP_COUNT - 1; i >= 1; i--) {
        const source = `${DB_PATH}.bak.${i}`;
        const dest = `${DB_PATH}.bak.${i + 1}`;
        try { await fs.access(source); await fs.rename(source, dest); } catch (e) { }
      }
      await fs.writeFile(`${DB_PATH}.bak.1`, currentContent, 'utf-8');
    } catch (error) {
      if ((error as any).code !== 'ENOENT') throw error;
    }

    // 3. Atomic Write
    const tempPath = `${DB_PATH}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    await fs.rename(tempPath, DB_PATH);

  } finally {
    // 4. Always release lock
    try { await fs.unlink(lockPath); } catch (e) { }
  }
}
