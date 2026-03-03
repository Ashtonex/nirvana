# NIRVANA
## Unified Retail Management System

---

# Executive Summary

**Nirvana** is a comprehensive, cloud-based retail management platform designed for multi-location businesses. It consolidates inventory management, point-of-sale operations, financial tracking, employee management, and business intelligence into a single, intuitive interface.

Built with modern web technologies (Next.js), Nirvana provides real-time insights across all retail locations, enabling owners and managers to make data-driven decisions instantly.

---

# Key Features

## 1. Centralized Command Center
The dashboard provides a consolidated view of your entire retail operation:

- **Real-time KPIs**: Total sales, active inventory, expenses, and revenue at a glance
- **Shop Performance**: Side-by-side comparison of all 3 locations (Kipasa, Dubdub, Tradecenter)
- **Quick Stats Cards**: Inventory value, total employees, expense breakdown
- **Operational Status**: Live status indicators for each location

## 2. Multi-Location Inventory Management

### Stock Tracking
- **Landed Cost Calculation**: Automatically calculates true cost per item including:
  - Acquisition price from suppliers
  - Shipping/import costs
  - Duty and customs fees
  - Overhead allocation (rent, salaries, utilities)

### Inventory Operations
- **Bulk Shipments**: Import inventory with full shipment details (supplier, costs, manifest)
- **Shop Allocations**: Distribute inventory across multiple locations
- **Stock Transfers**: Move inventory between stores with full tracking
- **Stock Alerts**: Low stock and reorder suggestions
- **Zombie Stock Detection**: Identify slow-moving items (60+ days without sale)

### Categories & Organization
- Product categorization (Hoodies, T-Shirts, Accessories, etc.)
- SKU management
- Historical tracking of all inventory movements

## 3. Point of Sale (POS) System

Each shop location has a dedicated POS interface:

- **Quick Product Search**: Find items by name or category
- **Real-time Pricing**: Automatic tax calculation (15.5%)
- **Client Management**: Optional customer name recording
- **Employee Attribution**: Every sale linked to the serving staff member
- **Digital Receipts**: Instant transaction recording

## 4. Financial Management

### Revenue & Profitability
- **Sales Tracking**: All transactions with full details
- **Tax Reporting**: Automated 15.5% tax calculations and reporting
- **Income Statements**: Revenue, COGS, and operating expenses
- **Balance Sheet**: Asset tracking (inventory value) and cash flow

### Expense Management
- **Global Expenses**: Central overhead costs (rent, salaries, utilities)
- **Shop-specific Expenses**: Individual location costs
- **Financial Categories**: Inventory Acquisition, Operating Expenses, etc.

### Oracle Financial Dashboard
Advanced financial intelligence:
- **Gross Profit Analysis**: Revenue minus cost of goods sold
- **Net Income Calculation**: Complete profit/loss overview
- **Monthly Burn Rate**: Track operational costs
- **Profit Margin %**: Calculate profitability per sale
- **Runway Analysis**: Estimate business sustainability
- **Expansion Readiness Score**: Financial health indicator

## 5. Employee Management

### Staff Registry
- **Employee Profiles**: Name, role, assignment, hire date
- **Role Classification**: Sales Associate, Lead Manager, Strategic Owner
- **Active/Inactive Status**: Track current workforce

### Performance Tracking
- **Sales Leaderboard**: Rank employees by sales performance
- **Shop Assignment**: Track which employee works at which location
- **Quick Recruitment**: Add new employees directly from the dashboard
- **Station Cycling**: Easy employee transfers between locations

## 6. Business Intelligence & Analytics

### Intelligence Dashboard
- **Best Sellers**: Top-performing products across all locations
- **Performance Trends**: Sales patterns over time
- **Reorder Suggestions**: Automated inventory replenishment alerts
- **Dead Stock Report**: Identify slow-moving inventory

### Revenue Forecasting
- **Sales Predictions**: AI-powered future revenue estimates
- **Historical Analysis**: Compare performance across time periods
- **Trend Visualization**: Interactive charts and graphs

## 7. Inventory Transfers

### Inter-Shop Transfers
- **Request Transfers**: Move stock between Kipasa, Dubdub, and Tradecenter
- **Transfer Tracking**: Full audit trail of all movements
- **Quantity Management**: Specify exact quantities to transfer
- **Transfer History**: Complete log of all transfer requests

## 8. Quotations System

### Quote Management
- **Create Quotations**: Generate custom quotes for customers
- **Pending Quotes**: Track awaiting customer decisions
- **Quote Finalization**: Convert accepted quotes to sales
- **Quote History**: All quotation records preserved

## 9. Tax Administration

### Automated Tax Handling
- **Theoretical Tax**: Calculate expected tax (15.5% of pre-tax sales)
- **Reported Tax**: Track actual tax collected
- **Tax Mode**: Support for flat rate and threshold-based calculations
- **Tax Saving Report**: Identify over/under-taxation
- **Fiscal Records**: Complete audit trail for tax filing

## 10. Audit & Compliance

### Audit Trail
- **Action Logging**: Track all system activities
- **User Actions**: Record who did what and when
- **Category Filtering**: Filter by action type (Sales, Inventory, etc.)
- **Search Functionality**: Find specific audit entries
- **Export Capability**: Download audit logs for external review

## 11. System Administration

### Settings Management
- **Oracle Configuration**: System-wide settings
- **Tax Configuration**: Tax rates and thresholds
- **Email Notifications**: Automated reporting to administrators

### Backup & Restore
- **Automated Backups**: Regular database snapshots
- **Manual Backup**: On-demand backup creation
- **Restore Function**: Recover from previous backup states
- **Backup History**: View and manage backup files

---

# Technical Architecture

## Technology Stack
- **Frontend**: Next.js 16 (React)
- **Database**: Supabase (PostgreSQL)
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Deployment**: Vercel

## Database Schema

### Core Tables
- **inventory_items**: Product catalog
- **inventory_allocations**: Per-shop stock levels
- **sales**: Transaction records
- **shops**: Location definitions
- **employees**: Staff records
- **shipments**: Import/arrival records
- **transfers**: Inter-shop movements
- **quotations**: Customer quotes
- **ledger_entries**: Financial records
- **audit_log**: System activity
- **oracle_settings**: Configuration

---

# User Experience

## Interface Design
- **Dark Theme**: Modern, eye-friendly design
- **Responsive**: Works on desktop and mobile
- **Quick Actions**: Streamlined workflows
- **Real-time Updates**: Data refreshes automatically

## Navigation Structure
```
Nirvana Command Center
├── Dashboard (Home)
├── Shops
│   ├── Kipasa
│   ├── Dubdub
│   └── Tradecenter
├── Inventory
│   ├── Stock Overview
│   ├── History
│   └── Stocktake
├── Finance
│   ├── Financial Dashboard
│   └── Oracle (Advanced)
├── Employees
│   └── Leaderboard
├── Reports
├── Quotations
├── Transfers
├── Intelligence
└── Admin
    ├── Audit Log
    ├── Tax Settings
    ├── Backups
    └── Settings
```

---

# Benefits Summary

| Category | Benefit |
|----------|---------|
| **Time Savings** | Single system replaces multiple manual processes |
| **Accuracy** | Automated calculations eliminate human error |
| **Visibility** | Real-time insights across all locations |
| **Control** | Complete audit trail of all operations |
| **Growth** | Scalable architecture supports business expansion |
| **Compliance** | Built-in tax calculations and audit logs |

---

# Contact & Support

For questions about Nirvana, contact your system administrator.

---

*Document Version: 1.0*
*System Name: Nirvana*
*Generated: March 2026*
