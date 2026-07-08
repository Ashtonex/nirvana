const fs = require('fs');

async function fetchTable(tableName) {
  const url = `https://tpbiqsazcmglxmzbmhxb.supabase.co/rest/v1/${tableName}?select=*`;
  const apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYmlxc2F6Y21nbHhtemJtaHhiIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjQ0ODg0MiwiZXhwIjoyMDg4MDI0ODQyfQ.N7OlwIcW90sWlgwxBsPx7N2HBba5vwGLtPyhyZ7P82A";
  
  let allData = [];
  let limit = 1000;
  let offset = 0;
  let hasMore = true;
  
  while (hasMore) {
    const res = await fetch(`${url}&limit=${limit}&offset=${offset}`, {
      headers: {
        'apikey': apikey,
        'Authorization': `Bearer ${apikey}`
      }
    });
    
    if (!res.ok) {
      console.error(`Error fetching ${tableName}`, await res.text());
      break;
    }
    
    const data = await res.json();
    if (data.length === 0) {
      hasMore = false;
    } else {
      allData = allData.concat(data);
      offset += limit;
      if (data.length < limit) {
        hasMore = false;
      }
    }
  }
  return allData;
}

async function main() {
  const sales = await fetchTable('sales');
  const ledger = await fetchTable('operations_ledger');
  const drifts = await fetchTable('operations_drifts');
  const handshakes = await fetchTable('operations_handshakes');
  const deposits = await fetchTable('invest_deposits');
  
  const data = {
    sales,
    ledger,
    drifts,
    handshakes,
    deposits
  };
  
  fs.writeFileSync('dossier_data.json', JSON.stringify(data, null, 2));
  console.log('Fetched all data!');
}

main();
