-- Migration: Add missing columns for chat_messages and stock_requests
-- Run this in your Supabase SQL Editor

-- =============================================
-- CHAT_MESSAGES TABLE COLUMNS
-- =============================================

ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'chat';
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_id TEXT;
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS shop_id TEXT;

-- =============================================
-- STOCK_REQUESTS TABLE COLUMNS
-- =============================================

ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS source_shop_id TEXT;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS from_shop_id TEXT;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS target_shop_id TEXT;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS item_id TEXT;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS item_name TEXT;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS to_shop_id TEXT;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS requested_by TEXT;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
