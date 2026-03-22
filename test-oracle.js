const http = require('http');

async function testAuditRun() {
  console.log('Testing /api/pos-audit/run...');
  const data = JSON.stringify({ shopId: 'global' });
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/pos-audit/run',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        console.log(`Audit Status: ${res.statusCode}`);
        console.log(`Audit Response: ${body.substring(0, 100)}...`);
        resolve(res.statusCode === 200);
      });
    });
    req.on('error', (e) => {
      console.error('Audit Test Error (Server might be down):', e.message);
      resolve(false);
    });
    req.write(data);
    req.end();
  });
}

async function testOracleAnalyze() {
  console.log('Testing /api/oracle/analyze...');
  const data = JSON.stringify({ ledger: [], audit_stats: {}, shops: [] });
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/oracle/analyze',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        console.log(`Oracle Status: ${res.statusCode}`);
        console.log(`Oracle Response: ${body.substring(0, 100)}...`);
        resolve(res.statusCode === 200);
      });
    });
    req.on('error', (e) => {
      console.error('Oracle Test Error (Server might be down):', e.message);
      resolve(false);
    });
    req.write(data);
    req.end();
  });
}

async function runTests() {
  // Since the server needs to be running, we might just verify the Python script directly if the server isn't up.
  console.log('Verifying Python script directly...');
  const { exec } = require('child_process');
  exec('python scripts/oracle_brain.py "{\\"ledger\\":[]}"', (err, stdout, stderr) => {
    if (err) {
      console.log('Trying "py" command...');
      exec('py scripts/oracle_brain.py "{\\"ledger\\":[]}"', (err2, stdout2, stderr2) => {
          if (err2) console.error('Python Script Failed:', stderr2);
          else console.log('Python Script Success (py):', stdout2);
      });
    } else {
      console.log('Python Script Success (python):', stdout);
    }
  });
}

runTests();
