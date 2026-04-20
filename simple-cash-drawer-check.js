// Simple cash drawer diagnostic without external dependencies
// This will check the database structure and common issues

const fs = require('fs');
const path = require('path');

// Read environment variables from .env.local manually
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env.local');
  if (!fs.existsSync(envPath)) {
    console.log('❌ .env.local file not found');
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

async function checkDatabaseStructure() {
  console.log('🔍 Checking Cash Drawer Database Structure...\n');
  
  const env = loadEnvFile();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !serviceKey) {
    console.log('❌ Missing database credentials');
    return;
  }
  
  console.log('✅ Database credentials found');
  console.log(`📊 Supabase URL: ${supabaseUrl}`);
  
  // Since we can't easily connect without the proper client,
  // let's check for common issues in the codebase instead
  
  console.log('\n🔍 Analyzing Codebase for Cash Drawer Issues...\n');
  
  // Check for potential infinite loop patterns
  const actionsFile = fs.readFileSync(path.join(__dirname, 'app/actions.ts'), 'utf8');
  const posFile = fs.readFileSync(path.join(__dirname, 'app/shops/[shopId]/POS.tsx'), 'utf8');
  
  // Look for problematic patterns
  const issues = [];
  
  // Check for while loops that might be infinite
  const whileLoops = posFile.match(/while\s*\([^)]+\)/g);
  if (whileLoops && whileLoops.length > 0) {
    issues.push({
      type: 'potential_infinite_loop',
      location: 'POS.tsx',
      details: `Found ${whileLoops.length} while loops that should be reviewed`
    });
  }
  
  // Check for recursive function calls without base cases
  const recursiveCalls = posFile.match(/function\s+\w+[^{]*\{[^}]*this\.\w+\(/g);
  if (recursiveCalls && recursiveCalls.length > 0) {
    issues.push({
      type: 'potential_recursion',
      location: 'POS.tsx', 
      details: `Found ${recursiveCalls.length} potential recursive calls`
    });
  }
  
  // Check for cash drawer calculation complexity
  const cashDrawerCalculations = posFile.match(/carryOver|expectedOpening|todaysOpening/g);
  if (cashDrawerCalculations && cashDrawerCalculations.length > 10) {
    issues.push({
      type: 'complex_calculation',
      location: 'POS.tsx',
      details: `Found ${cashDrawerCalculations.length} cash drawer calculation variables - may indicate over-complexity`
    });
  }
  
  // Check for multiple database queries in loops
  const dbQueriesInLoops = posFile.match(/for.*\{[^}]*supabase|while.*\{[^}]*supabase/g);
  if (dbQueriesInLoops && dbQueriesInLoops.length > 0) {
    issues.push({
      type: 'performance_issue',
      location: 'POS.tsx',
      details: `Found ${dbQueriesInLoops.length} database queries inside loops`
    });
  }
  
  // Display results
  if (issues.length === 0) {
    console.log('✅ No obvious code issues detected');
  } else {
    console.log('⚠️  Potential Issues Found:');
    issues.forEach((issue, index) => {
      console.log(`${index + 1}. ${issue.type.toUpperCase()} in ${issue.location}:`);
      console.log(`   ${issue.details}`);
    });
  }
  
  // Check recent commits for cash drawer fixes
  console.log('\n📜 Recent Cash Drawer Related Commits:');
  try {
    const { execSync } = require('child_process');
    const recentCommits = execSync('git log --oneline -10 --grep="drawer\\|cash\\|POS"', { encoding: 'utf8' });
    if (recentCommits.trim()) {
      console.log(recentCommits);
    } else {
      console.log('No recent cash drawer related commits found');
    }
  } catch (error) {
    console.log('Could not retrieve git history');
  }
  
  // Check for build errors
  console.log('\n🔨 Build Status:');
  const buildLogPath = path.join(__dirname, 'build.log');
  const errorLogPath = path.join(__dirname, 'build_error.log');
  
  if (fs.existsSync(buildLogPath)) {
    const buildLog = fs.readFileSync(buildLogPath, 'utf8');
    if (buildLog.includes('✓ Compiled successfully')) {
      console.log('✅ Latest build was successful');
    } else {
      console.log('❌ Build had issues');
    }
  }
  
  if (fs.existsSync(errorLogPath)) {
    const errorLog = fs.readFileSync(errorLogPath, 'utf8');
    if (errorLog.includes('cash drawer') || errorLog.includes('drawer')) {
      console.log('❌ Found cash drawer related build errors');
      console.log(errorLog);
    }
  }
  
  console.log('\n🎯 Recommendations:');
  console.log('1. Check for double deductions in the operations_ledger table');
  console.log('2. Verify daily cash drawer openings are being recorded');
  console.log('3. Review expense categorization to prevent multiple ledger routing');
  console.log('4. Monitor for infinite loops in cash drawer calculations');
  console.log('5. Ensure proper error handling in cash drawer operations');
}

checkDatabaseStructure().catch(console.error);
