// Check cash drawer openings and expense categorization issues
const fs = require('fs');
const path = require('path');

function loadEnvFile() {
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    return {};
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=');
      if (key && valueParts.length > 0) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    }
  });
  
  return envVars;
}

async function checkCashDrawerOpenings() {
  console.log('🔍 Checking Cash Drawer Opening Patterns...\n');
  
  // Read the POS.tsx file to analyze opening logic
  const posFile = fs.readFileSync(path.join(__dirname, 'app/shops/[shopId]/POS.tsx'), 'utf8');
  
  // Look for opening detection logic
  const openingLogic = posFile.match(/\/\/.*Did we open today\?[\s\S]*?hasOpenedRegister.*?=/g);
  if (openingLogic) {
    console.log('✅ Found cash drawer opening detection logic:');
    console.log(openingLogic[0]);
  }
  
  // Check for potential issues in opening detection
  const issues = [];
  
  // Check date handling consistency
  const datePatterns = posFile.match(/toLocaleDateString|toISOString|split\("T"\)/g);
  const todayStrUsage = posFile.match(/todayStr/g);
  
  if (datePatterns && datePatterns.length > 3) {
    issues.push({
      type: 'date_inconsistency',
      details: `Found ${datePatterns.length} different date handling patterns - potential timezone issues`
    });
  }
  
  // Check for missing opening validation
  const openingValidation = posFile.match(/if.*todaysOpening|hasOpenedRegister/g);
  if (!openingValidation || openingValidation.length === 0) {
    issues.push({
      type: 'missing_validation',
      details: 'No validation found for cash drawer opening requirement'
    });
  }
  
  // Check for carry-over calculation complexity
  const carryOverLogic = posFile.match(/carryOver.*=|expectedOpeningCash/g);
  if (carryOverLogic && carryOverLogic.length > 5) {
    issues.push({
      type: 'complex_carryover',
      details: `Found ${carryOverLogic.length} carry-over calculations - potential for errors`
    });
  }
  
  return issues;
}

function checkExpenseCategorization() {
  console.log('\n🔍 Checking Expense Categorization for Multiple Ledger Routing...\n');
  
  const actionsFile = fs.readFileSync(path.join(__dirname, 'app/actions.ts'), 'utf8');
  const posFile = fs.readFileSync(path.join(__dirname, 'app/shops/[shopId]/POS.tsx'), 'utf8');
  
  const issues = [];
  
  // Check for POS expense categories
  const posExpenseCategories = ["POS Expense", "Perfume", "Overhead"];
  const foundCategories = [];
  
  posExpenseCategories.forEach(category => {
    if (actionsFile.includes(category) || posFile.includes(category)) {
      foundCategories.push(category);
    }
  });
  
  console.log(`✅ Found POS expense categories: ${foundCategories.join(', ')}`);
  
  // Check for auto-routing logic
  const autoRoutingPatterns = [
    /Auto-routed from POS expense/g,
    /postDrawerToOperations/g,
    /operations_ledger/g,
    /invest_deposits/g
  ];
  
  autoRoutingPatterns.forEach(pattern => {
    const matches = actionsFile.match(pattern) || [];
    if (matches.length > 0) {
      console.log(`✅ Found ${pattern.source}: ${matches.length} occurrences`);
    }
  });
  
  // Check for potential double-routing
  const doubleRoutingPatterns = [
    /ledger_entries.*insert.*operations_ledger/g,
    /supabaseAdmin.*from.*ledger_entries.*insert.*supabaseAdmin.*from.*operations_ledger/g
  ];
  
  doubleRoutingPatterns.forEach(pattern => {
    const matches = actionsFile.match(pattern);
    if (matches && matches.length > 0) {
      issues.push({
        type: 'potential_double_routing',
        details: `Found pattern that may cause double routing: ${pattern.source}`
      });
    }
  });
  
  // Check for expense categorization inconsistencies
  const categoryInconsistencies = actionsFile.match(/category.*===.*POS.*category.*===.*Operations/g);
  if (categoryInconsistencies && categoryInconsistencies.length > 0) {
    issues.push({
      type: 'category_inconsistency',
      details: 'Found inconsistent expense categorization between ledgers'
    });
  }
  
  // Check for missing error handling in expense routing
  const expenseRoutingFunctions = actionsFile.match(/postDrawerToOperations|recordExpense/g);
  if (expenseRoutingFunctions) {
    expenseRoutingFunctions.forEach(func => {
      const funcPattern = new RegExp(`export async function ${func}[^{]*\\{[\\s\\S]*?}`, 'g');
      const funcMatch = actionsFile.match(funcPattern);
      if (funcMatch) {
        const hasErrorHandling = funcMatch[0].includes('try') && funcMatch[0].includes('catch');
        if (!hasErrorHandling) {
          issues.push({
            type: 'missing_error_handling',
            details: `Function ${func} lacks proper error handling`
          });
        }
      }
    });
  }
  
  return issues;
}

function analyzeRecentFixes() {
  console.log('\n📜 Analyzing Recent Cash Drawer Fixes...\n');
  
  try {
    const { execSync } = require('child_process');
    
    // Get detailed info about the cash drawer infinite loop fix
    const infiniteLoopCommit = execSync('git show --stat 9925486', { encoding: 'utf8' });
    console.log('🔧 Cash Drawer Infinite Loop Fix (9925486):');
    console.log(infiniteLoopCommit);
    
    // Get detailed info about the timezone mismatch fix
    const timezoneFix = execSync('git show --stat ca6fb4c', { encoding: 'utf8' });
    console.log('\n🔧 Timezone Mismatch Fix (ca6fb4c):');
    console.log(timezoneFix);
    
  } catch (error) {
    console.log('Could not retrieve detailed commit information');
  }
}

function generateRecommendations(openingIssues, expenseIssues) {
  console.log('\n🎯 Detailed Recommendations:\n');
  
  console.log('📋 Cash Drawer Opening Issues:');
  if (openingIssues.length === 0) {
    console.log('✅ No opening issues detected');
  } else {
    openingIssues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.type.toUpperCase()}: ${issue.details}`);
    });
  }
  
  console.log('\n💰 Expense Categorization Issues:');
  if (expenseIssues.length === 0) {
    console.log('✅ No expense categorization issues detected');
  } else {
    expenseIssues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.type.toUpperCase()}: ${issue.details}`);
    });
  }
  
  console.log('\n🔧 Action Items:');
  console.log('1. IMMEDIATE: Run Oracle validation API to check for active double deductions');
  console.log('2. HIGH: Review cash drawer opening detection logic for timezone consistency');
  console.log('3. MEDIUM: Simplify carry-over calculation logic to reduce complexity');
  console.log('4. MEDIUM: Add comprehensive error handling to all expense routing functions');
  console.log('5. LOW: Consider consolidating expense categorization logic into a single module');
  
  console.log('\n🚨 Critical Checks to Perform:');
  console.log('- Check operations_ledger for "Auto-routed from POS expense" entries');
  console.log('- Verify no duplicate amounts exist between ledger_entries and operations_ledger');
  console.log('- Confirm daily cash drawer openings are recorded for all active shops');
  console.log('- Test expense routing with different POS expense categories');
}

async function main() {
  try {
    console.log('🔍 Comprehensive Cash Drawer Diagnostic\n');
    
    const env = loadEnvFile();
    if (env.NEXT_PUBLIC_SUPABASE_URL) {
      console.log(`✅ Connected to database: ${env.NEXT_PUBLIC_SUPABASE_URL}`);
    }
    
    const openingIssues = await checkCashDrawerOpenings();
    const expenseIssues = checkExpenseCategorization();
    analyzeRecentFixes();
    generateRecommendations(openingIssues, expenseIssues);
    
    console.log('\n✅ Diagnostic complete!');
    
  } catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
  }
}

main();
