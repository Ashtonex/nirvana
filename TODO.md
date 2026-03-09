# TODO: Make Nirvana Work Offline

## Plan Overview
The app already has PWA infrastructure (manifest, service worker, offline sales queue). The main gap is that all data operations rely on Supabase (cloud), which doesn't work offline. We need to add a local-first data layer using IndexedDB.

## Current State Analysis
- ✅ PWA manifest exists (`public/manifest.json`)
- ✅ Service worker exists (`public/sw.js`)
- ✅ Service worker registration component exists
- ✅ Offline sales queue with IndexedDB exists (`useOfflineSales.ts`)
- ✅ Offline sales API route exists
- ❌ No local data storage for inventory, shops, employees, etc.
- ❌ All data fetched from Supabase (cloud)

## Implementation Steps

### Step 1: Add IndexedDB Library ✅
- [x] Install `dexie` (lightweight IndexedDB wrapper)

### Step 2: Create Local Database Schema ✅
- [x] Create `lib/local-db.ts` with Dexie schema for:
  - shops
  - inventory  
  - employees
  - sales
  - settings
  - pendingSync queue

### Step 3: Create Local-First Data Hooks ✅
- [x] Create `hooks/useLocalData.ts` that:
  - Serves data from IndexedDB when offline
  - Syncs from Supabase when online
  - Writes to both IndexedDB and Supabase when online

### Step 4: Update Offline Sales Hook ✅
- [x] Fix `isOnline` state access bug in `useOfflineSales.ts`
- [x] Add sync status indicators

### Step 5: Enhance Service Worker ✅
- [x] Cache all app pages/routes
- [x] Cache Next.js static assets

### Step 6: Add Offline UI Indicator ✅
- [x] Create `components/OfflineIndicator.tsx`
- [x] Add to app layout

### Step 7: Update App Layout ✅
- [x] Add ServiceWorkerRegistration
- [x] Add OfflineIndicator

## Completed Files
1. ✅ `package.json` - dexie added
2. ✅ `lib/local-db.ts` - created
3. ✅ `hooks/useLocalData.ts` - created  
4. ✅ `components/useOfflineSales.ts` - fixed bugs
5. ✅ `components/OfflineIndicator.tsx` - created
6. ✅ `app/layout.tsx` - updated
7. ✅ `public/sw.js` - enhanced caching

## Remaining Steps (Optional/Advanced)
- Make individual pages use the local-first hooks
- Add initial data seeding to IndexedDB
- Consider adding a "download for offline" button to explicitly cache data

## New Feature: Offline Login ✅
- Created `hooks/useOfflineAuth.ts` - handles offline PIN-based login
- Added local auth storage in IndexedDB (`nirvana-auth` database)
- Updated staff login page to:
  - Detect online/offline status
  - Show offline mode indicator
  - Skip email field when offline
  - Authenticate using saved PIN from local storage
  - Sync auth credentials when online

