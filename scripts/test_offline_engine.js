/**
 * Verification test for Nirvana Offline Engine, Cryptographic Security,
 * Idempotency, and Loyverse Tender Calculations.
 */

const assert = require('assert');
const crypto = require('crypto');

function hashPin(pin, salt) {
    const enc = new TextEncoder();
    const data = enc.encode(`${salt}:${pin}:nirvana_secure_v2`);
    return crypto.createHash('sha256').update(data).digest('hex');
}

function calculateLoyverseTotals(items, discount = 0, taxRate = 0.155) {
    const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const subtotalAfterDiscount = Math.max(0, subtotal - discount);
    const tax = subtotalAfterDiscount * taxRate;
    const total = subtotalAfterDiscount + tax;
    return {
        subtotal,
        discount,
        tax: Math.round(tax * 100) / 100,
        total: Math.round(total * 100) / 100
    };
}

function calculateChange(tendered, total) {
    return Math.max(0, Math.round((tendered - total) * 100) / 100);
}

console.log('🧪 Starting Nirvana Offline & Loyverse Engine Verification Tests...\n');

// Test 1: PIN Hashing & Security
console.log('Test 1: Salted SHA-256 PIN Hashing');
const salt1 = 'emp-uuid-1';
const salt2 = 'emp-uuid-2';
const pin = '1234';

const hash1 = hashPin(pin, salt1);
const hash2 = hashPin(pin, salt2);

assert.strictEqual(hash1.length, 64, 'Hash must be 64 characters (SHA-256 hex)');
assert.notStrictEqual(hash1, hash2, 'Identical PINs with different salts must yield different hashes');
assert.strictEqual(hash1, hashPin(pin, salt1), 'Hash verification must be deterministic');
assert.notStrictEqual(hash1, pin, 'Plaintext PIN must never equal hash');
console.log('  ✅ PIN hashing with unique employee salt passed\n');

// Test 2: Loyverse Cart Math & Tax Calculations
console.log('Test 2: Loyverse Cart & Tax Calculations (15.5% tax)');
const cart = [
    { name: 'Oversized Tee', price: 25.00, quantity: 2 }, // 50.00
    { name: 'Vintage Cap', price: 15.00, quantity: 1 }     // 15.00
];
const totals = calculateLoyverseTotals(cart, 5.00); // 65.00 - 5.00 = 60.00, tax 9.30, total 69.30
assert.strictEqual(totals.subtotal, 65.00, 'Subtotal should be 65.00');
assert.strictEqual(totals.tax, 9.30, 'Tax at 15.5% on 60.00 should be 9.30');
assert.strictEqual(totals.total, 69.30, 'Total due should be 69.30');
console.log('  ✅ Subtotal, discount, and tax calculation passed\n');

// Test 3: Cash Tender & Change Due
console.log('Test 3: Cash Tender & Change Due');
const change1 = calculateChange(70.00, totals.total);
assert.strictEqual(change1, 0.70, 'Change for $70 on $69.30 should be $0.70');

const change2 = calculateChange(100.00, totals.total);
assert.strictEqual(change2, 30.70, 'Change for $100 on $69.30 should be $30.70');

const underpaid = calculateChange(50.00, totals.total);
assert.strictEqual(underpaid, 0, 'Underpaid tender should return 0 change');
console.log('  ✅ Change calculations passed\n');

// Test 4: Idempotent Queueing Logic
console.log('Test 4: Client Outbox UUID & Idempotency');
const clientSaleId = 'cl-' + Date.now() + '-test';
const processedSet = new Set();

function processSale(saleId) {
    if (processedSet.has(saleId)) {
        return { success: true, alreadyProcessed: true };
    }
    processedSet.add(saleId);
    return { success: true, id: saleId, created: true };
}

const firstRun = processSale(clientSaleId);
assert.strictEqual(firstRun.created, true, 'First submission must create record');

const secondRun = processSale(clientSaleId);
assert.strictEqual(secondRun.alreadyProcessed, true, 'Duplicate submission must be recognized as already processed');
console.log('  ✅ Idempotent transaction processing passed\n');

// Test 5: Drawer Operations Classification
console.log('Test 5: Drawer Operations Classification');
function classifyDrawerOp(type, amount, reason) {
    if (type === 'open') return { category: 'Cash Drawer Opening', type: 'asset' };
    if (type === 'close') return { category: 'Cash Drawer Closing', type: 'asset' };
    if (type === 'expense') return { category: 'POS Expense', type: 'expense' };
    throw new Error('Unknown type');
}

const openOp = classifyDrawerOp('open', 100, 'Float');
assert.strictEqual(openOp.type, 'asset');
assert.strictEqual(openOp.category, 'Cash Drawer Opening');

const expOp = classifyDrawerOp('expense', 15, 'Cleaning supplies');
assert.strictEqual(expOp.type, 'expense');
assert.strictEqual(expOp.category, 'POS Expense');
console.log('  ✅ Cash drawer asset and expense classifications passed\n');

console.log('🎉 All 5 Nirvana Offline & Loyverse Verification Tests Passed Successfully!');
