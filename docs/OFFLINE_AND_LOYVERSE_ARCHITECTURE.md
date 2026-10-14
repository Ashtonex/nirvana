# Nirvana POS — Offline-First & Loyverse UI/UX Architecture

This document outlines the architectural enhancements implemented to give Nirvana a Loyverse-inspired cashier experience and dependable offline operation.

---

## 1. Offline Capability Matrix

| Workflow | Offline Status | Storage & Mechanism | Reconnection Behavior |
|---|---|---|---|
| **Browse Product Catalog** | ✅ **Available Offline** | Local Dexie catalog snapshot (`localDb.catalog`) cached on launch | Incremental refresh when connected |
| **Search & Filter by Category** | ✅ **Available Offline** | Client-side indexed search with category pills (`ALL`, `T-Shirts`, etc.) | Fully local, 0ms latency |
| **Cart & Ticket Stepper** | ✅ **Available Offline** | Local React state & Dexie active ticket persistence | No server round-trip |
| **Cash Checkout** | ✅ **Available Offline** | Saved to Dexie outbox (`queuedSales`) with client UUID | Automatic sync via `syncEngine` |
| **Loyverse Tender & Change Calc** | ✅ **Available Offline** | Client-side currency denomination arithmetic | Instant change calculation |
| **Register Shift Open/Close** | ✅ **Available Offline** | Saved to Dexie outbox (`queuedDrawerOps`) | Reconciled into `ledger_entries` on sync |
| **Petty Cash Outflow** | ✅ **Available Offline** | Saved to Dexie outbox (`queuedDrawerOps`) | Reconciled into `ledger_entries` on sync |
| **Fast Cashier Switch** | ✅ **Available Offline** | Local salted SHA-256 PIN hash verification (7-day lease) | Lease refreshed upon reconnection |
| **Receipt Generation** | ✅ **Available Offline** | ESC/POS Bluetooth / USB thermal print or local window.print | Printed immediately at checkout |
| **Lay-by Agreement** | ⚠️ **Offline with Restrictions** | Local ticket capture; full cloud layby conversion on sync | Synced when online |
| **Manager Administrative Tools** | 🔒 **Requires Connectivity** | Database audits, staff management, financial reports | Server-only capabilities |

---

## 2. Key Architecture Components

### A. Unified Local-First Storage (`lib/local-db.ts`)
- Consolidates previous fragmented databases into a unified **Dexie v2 schema** (`nirvana-local`):
  - `catalog`: shop-specific inventory snapshot (name, category, price, stock).
  - `queuedSales`: offline transactions with stable client-generated UUIDs, tax math, cashier ID, and line details.
  - `queuedDrawerOps`: shift openings, shift closures, and petty cash expenses.
  - `authSessions`: authorized operators with **SHA-256 salted PIN hashes** (plaintext PINs eliminated).
  - Automated one-time migration safely imports any pending transactions from older legacy databases.

### B. Durable Synchronization Engine (`lib/sync-engine.ts`)
- Background coordinator with:
  - **Triggers**: Network online events, tab focus, app launch, 30s heartbeat.
  - **Dependency Ordering**: Cash drawer opening ops sync before sales; sales sync before drawer closures.
  - **Cross-Tab Safety**: BroadcastChannel prevents concurrent duplicate sync runs across browser tabs.
  - **Idempotency**: API endpoints (`/api/sales/offline` and `/api/drawer/offline`) check operation UUIDs before inserting.

### C. Loyverse-Inspired Ergonomic UI (`components/pos/*`)
- **`CategoryBar`**: Touch-friendly horizontal category filter with live item counts.
- **`ProductGrid`**: Responsive tiles with visual stock pills (`In Stock`, `Low: X`, `Out`) and 1-tap cart addition.
- **`TicketSidebar`**: Clean right-hand ticket pane with quantity steppers (`-` / `+`), discount pill, and clear total.
- **`TenderModal`**: Loyverse payment modal with preset bill denominations (`Exact`, `$5`, `$10`, `$20`, `$50`, `$100`), auto change calculator, and double-tap protected checkout.
- **`CashierSwitchModal`**: 1-second PIN switch numpad for seamless shift handover without full page reload.
- **`RegisterDrawerModal`**: Offline-capable modal for opening float, petty cash expenses, and closing reconciliation.

---

## 3. Operator Quick Guide

1. **Making a Sale**:
   - Tap category pill (e.g. `T-Shirts`) or type in the search bar.
   - Tap item tile to add to ticket.
   - Tap `+` or `-` to adjust quantity on the right ticket.
   - Tap **CHARGE $XX.XX**.
   - Tap cash bill button (e.g. `$50`) or enter tendered cash. Note change due.
   - Tap **Complete Payment**. Receipt prints immediately.
2. **Switching Cashiers**:
   - Tap the **Cashier** pill in the top header.
   - Type your 4-digit PIN on the keypad. Station switches in 0.5 seconds.
3. **Recording Petty Cash / Drawer Float**:
   - Tap the **Drawer** pill in the top header.
   - Select **Open Shift**, **Petty Cash Out**, or **Close Shift**.
   - Enter amount and note, then tap confirm.

---

## 4. Verification Evidence

- ✅ TypeScript compilation check: `tsc --noEmit` exited with **0 errors**.
- ✅ Automated offline engine test suite: `node scripts/test_offline_engine.js` passed all 5 verification tests (PIN security, Loyverse tax math, change calculations, idempotency, drawer classifications).
