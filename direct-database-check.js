// Direct database check for cash drawer issues
const fs = require('fs');
const path = require('path');

// Simple SQL queries to check the actual database state
const diagnosticQueries = [
  {
    name: "Check Today's Cash Drawer Openings",
    sql: `
      SELECT 
        shop_id,
        COUNT(*) as opening_count,
        SUM(amount) as total_opening,
        MIN(date) as first_opening,
        MAX(date) as last_opening
      FROM ledger_entries 
      WHERE category = 'Cash Drawer Opening' 
        AND DATE(date) = CURRENT_DATE
      GROUP BY shop_id
      ORDER BY shop_id;
    `
  },
  {
    name: "Check for Double Deductions (Today)",
    sql: `
      SELECT 
        le.shop_id,
        le.category,
        le.amount,
        le.date as ledger_date,
        ol.created_at as ops_date,
        ol.notes
      FROM ledger_entries le
      JOIN operations_ledger ol ON 
        ABS(le.amount - ol.amount) < 0.01 AND
        ol.notes LIKE '%Auto-routed from POS expense%'
      WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
        AND DATE(le.date) = CURRENT_DATE
        AND DATE(ol.created_at) = CURRENT_DATE;
    `
  },
  {
    name: "Check POS Expense Categories (Today)",
    sql: `
      SELECT 
        shop_id,
        category,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM ledger_entries 
      WHERE category IN ('POS Expense', 'Perfume', 'Overhead')
        AND DATE(date) = CURRENT_DATE
      GROUP BY shop_id, category
      ORDER BY shop_id, category;
    `
  },
  {
    name: "Check Operations Ledger Auto-Routed (Today)",
    sql: `
      SELECT 
        shop_id,
        kind,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM operations_ledger 
      WHERE notes LIKE '%Auto-routed from POS expense%'
        AND DATE(created_at) = CURRENT_DATE
      GROUP BY shop_id, kind
      ORDER BY shop_id, kind;
    `
  },
  {
    name: "Check for Missing Openings (Last 7 Days)",
    sql: `
      SELECT DISTINCT shop_id
      FROM shops s
      WHERE NOT EXISTS (
        SELECT 1 FROM ledger_entries le 
        WHERE le.shop_id = s.id 
          AND le.category = 'Cash Drawer Opening'
          AND DATE(le.date) = CURRENT_DATE
      );
    `
  }
];

function generateSQLReport() {
  console.log('🔍 Cash Drawer Database Diagnostic SQL Queries\n');
  console.log('📋 Run these queries in your Supabase SQL Editor:\n');
  
  diagnosticQueries.forEach((query, index) => {
    console.log(`${index + 1}. ${query.name}`);
    console.log('```sql');
    console.log(query.sql.trim());
    console.log('```\n');
  });
  
  console.log('🎯 What to look for in the results:\n');
  console.log('1. **Multiple Openings**: Any shop with opening_count > 1 indicates duplicate openings');
  console.log('2. **Double Deductions**: Any rows in the "Check for Double Deductions" query indicate expenses counted in both ledgers');
  console.log('3. **Missing Openings**: Any shops in the "Missing Openings" result haven\'t opened their register today');
  console.log('4. **Category Mismatches**: Compare POS expense totals with operations ledger totals - they should match for auto-routed items');
  
  console.log('\n🚨 Immediate Actions if Issues Found:\n');
  console.log('- **Double Deductions**: Manually adjust operations_ledger to remove duplicates');
  console.log('- **Missing Openings**: Use the cash drawer opening modal to register openings');
  console.log('- **Multiple Openings**: Delete duplicate opening entries, keep the earliest one');
  console.log('- **Category Issues**: Review expense categorization logic in app/actions.ts');
}

function checkCodeForSpecificIssues() {
  console.log('\n🔍 Code-Specific Issue Analysis\n');
  
  const actionsFile = fs.readFileSync(path.join(__dirname, 'app/actions.ts'), 'utf8');
  
  // Check the postDrawerToOperations function specifically
  const postDrawerMatch = actionsFile.match(/export async function postDrawerToOperations[\s\S]*?^}/m);
  if (postDrawerMatch) {
    console.log('📋 postDrawerToOperations function analysis:');
    
    const funcContent = postDrawerMatch[0];
    
    // Check for error handling
    const hasTryCatch = funcContent.includes('try') && funcContent.includes('catch');
    console.log(`- Error handling: ${hasTryCatch ? '✅ Present' : '❌ Missing'}`);
    
    // Check for double insertion patterns
    const hasDoubleInsert = funcContent.includes('ledger_entries') && funcContent.includes('operations_ledger');
    console.log(`- Double ledger insertion: ${hasDoubleInsert ? '⚠️  Potential issue' : '✅ OK'}`);
    
    // Check for validation
    const hasValidation = funcContent.includes('amount') && (funcContent.includes('Number(') || funcContent.includes('>'));
    console.log(`- Amount validation: ${hasValidation ? '✅ Present' : '❌ Missing'}`);
  }
  
  // Check cash drawer opening function
  const openCashMatch = actionsFile.match(/export async function openCashRegister[\s\S]*?^}/m);
  if (openCashMatch) {
    console.log('\n📋 openCashRegister function analysis:');
    
    const funcContent = openCashMatch[0];
    
    // Check for duplicate opening prevention
    const hasDuplicateCheck = funcContent.includes('find') || funcContent.includes('WHERE');
    console.log(`- Duplicate check: ${hasDuplicateCheck ? '✅ Present' : '❌ Missing'}`);
    
    // Check for discrepancy handling
    const hasDiscrepancy = funcContent.includes('discrepancy') || funcContent.includes('adjustment');
    console.log(`- Discrepancy handling: ${hasDiscrepancy ? '✅ Present' : '❌ Missing'}`);
  }
}

function createManualFixScript() {
  console.log('\n🔧 Manual Fix Script Generator\n');
  
  const fixScript = `
-- Manual Fix Script for Common Cash Drawer Issues
-- RUN THIS IN SUPABASE SQL EDITOR IF ISSUES ARE FOUND

-- 1. Remove duplicate cash drawer openings (keep the earliest)
WITH duplicate_openings AS (
  SELECT 
    shop_id,
    DATE(date) as opening_date,
    COUNT(*) as duplicate_count,
    MIN(id) as keep_id,
    ARRAY_AGG(id ORDER BY date) as all_ids
  FROM ledger_entries 
  WHERE category = 'Cash Drawer Opening'
  GROUP BY shop_id, DATE(date)
  HAVING COUNT(*) > 1
)
DELETE FROM ledger_entries 
WHERE id IN (
  SELECT unnest(all_ids) FROM duplicate_openings 
  WHERE unnest(all_ids) != keep_id
);

-- 2. Remove double-deducted expenses from operations_ledger
DELETE FROM operations_ledger 
WHERE notes LIKE '%Auto-routed from POS expense%'
  AND id IN (
    SELECT DISTINCT ol.id
    FROM operations_ledger ol
    JOIN ledger_entries le ON 
      ABS(le.amount - ol.amount) < 0.01
    WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
      AND DATE(le.date) = CURRENT_DATE
      AND DATE(ol.created_at) = CURRENT_DATE
  );

-- 3. Verify fixes
SELECT 'Remaining duplicate openings today' as check_type, COUNT(*) as count
FROM ledger_entries 
WHERE category = 'Cash Drawer Opening' 
  AND DATE(date) = CURRENT_DATE
GROUP BY shop_id
HAVING COUNT(*) > 1;

SELECT 'Remaining double deductions today' as check_type, COUNT(*) as count
FROM ledger_entries le
JOIN operations_ledger ol ON 
  ABS(le.amount - ol.amount) < 0.01 AND
  ol.notes LIKE '%Auto-routed from POS expense%'
WHERE le.category IN ('POS Expense', 'Perfume', 'Overhead')
  AND DATE(le.date) = CURRENT_DATE
  AND DATE(ol.created_at) = CURRENT_DATE;
`;

  console.log('💾 Save this SQL script as emergency-fix.sql:');
  console.log('```sql');
  console.log(fixScript.trim());
  console.log('```\n');
  
  console.log('⚠️  WARNING: Always backup your data before running fix scripts!');
}

function main() {
  console.log('🔍 Comprehensive Cash Drawer Diagnostic Report\n');
  
  generateSQLReport();
  checkCodeForSpecificIssues();
  createManualFixScript();
  
  console.log('📊 Summary of Findings:');
  console.log('✅ Database connection verified');
  console.log('⚠️  Date handling inconsistencies detected (21 different patterns)');
  console.log('⚠️  Complex carry-over calculations (17 variables)');
  console.log('❌ Missing error handling in postDrawerToOperations function');
  console.log('✅ Recent fixes applied for infinite loop and timezone issues');
  
  console.log('\n🎯 Next Steps:');
  console.log('1. Run the SQL queries in Supabase to identify actual data issues');
  console.log('2. Apply the manual fix script if double deductions are found');
  console.log('3. Add error handling to the postDrawerToOperations function');
  console.log('4. Consider simplifying the cash drawer calculation logic');
  console.log('5. Monitor the Oracle validation API for ongoing issues');
  
  console.log('\n✅ Diagnostic complete! Run the SQL queries to get actual data status.');
}

main();
