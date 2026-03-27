-- Migration: Add missing columns for chat_messages and stock_requests
-- Run this in your Supabase SQL Editor

-- =============================================
-- CHAT_MESSAGES TABLE COLUMNS
-- =============================================

-- Add content column to chat_messages if it doesn't exist
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS content TEXT;

-- Add message column to chat_messages (some code uses message instead of content)
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message TEXT;

-- Add metadata column to chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- Add message_type column to chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'chat';

-- Add sender_id column to chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS sender_id TEXT;

-- Add shop_id column to chat_messages
ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS shop_id TEXT;

-- =============================================
-- STOCK_REQUESTS TABLE COLUMNS
-- =============================================

-- Add source_shop_id / from_shop_id column to stock_requests
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS source_shop_id TEXT;
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS from_shop_id TEXT;

-- Add item_id column to stock_requests
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS item_id TEXT;

-- Add item_name column to stock_requests
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS item_name TEXT;

-- Add to_shop_id column to stock_requests
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS to_shop_id TEXT;

-- Add quantity column to stock_requests
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS quantity INTEGER DEFAULT 0;

-- Add requested_by column to stock_requests
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS requested_by TEXT;

-- Add status column to stock_requests
ALTER TABLE stock_requests ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- =============================================
-- VERIFY COLUMNS
-- =============================================

SELECT 'chat_messages columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'chat_messages'
ORDER BY ordinal_position;

SELECT 'stock_requests columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'stock_requests'
ORDER BY ordinal_position;
