import fs from 'fs/promises';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'lib', 'db.json');

export interface ShopExpenses {
  rent: number;
  salaries: number;
  utilities: number;
  misc: number;
}

export interface Shop {
  id: string;
  name: string;
  expenses: ShopExpenses;
}

export interface InventoryItem {
  id: string;
  category: string;
  name: string;
  acquisitionPrice: number;
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
}

export interface Database {
  shops: Shop[];
  globalExpenses: {
    rent: number;
    salaries: number;
    utilities: number;
    shipping: number;
    duty: number;
    misc: number;
  };
  inventory: InventoryItem[];
  sales: Sale[];
  transfers: any[];
}

export async function readDb(): Promise<Database> {
  const data = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(data);
}

export async function writeDb(data: Database): Promise<void> {
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
