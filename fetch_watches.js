const fs = require('fs');

async function getWatchesData() {
  const url = "https://tpbiqsazcmglxmzbmhxb.supabase.co/rest/v1/sales?item_name=ilike.*watch*&select=id,item_name,quantity,total_with_tax,shop_id,date";
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
      console.error("Error fetching data", await res.text());
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

  // Aggregate Data
  let totalWatches = 0;
  let byShop = {};
  let byShopByMonth = {};
  let juneReport = {
    totalSales: 0,
    totalQuantity: 0,
    salesByShop: {},
    itemsSold: []
  };

  for (const sale of allData) {
    const qty = sale.quantity || 1; // Assuming quantity is 1 if null, based on some POS systems, but we'll use sale.quantity
    totalWatches += qty;
    
    const shop = sale.shop_id || 'Unknown';
    byShop[shop] = (byShop[shop] || 0) + qty;
    
    const d = new Date(sale.date);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    
    if (!byShopByMonth[shop]) {
      byShopByMonth[shop] = {};
    }
    byShopByMonth[shop][month] = (byShopByMonth[shop][month] || 0) + qty;
    
    // June report (assuming month 6, we'll collect for June 2026 or any June)
    if (d.getMonth() === 5) { // 0-indexed, so 5 is June
      juneReport.totalQuantity += qty;
      juneReport.totalSales += (sale.total_with_tax || 0);
      
      if (!juneReport.salesByShop[shop]) {
        juneReport.salesByShop[shop] = { quantity: 0, revenue: 0 };
      }
      juneReport.salesByShop[shop].quantity += qty;
      juneReport.salesByShop[shop].revenue += (sale.total_with_tax || 0);
      
      juneReport.itemsSold.push({
        date: sale.date,
        item: sale.item_name,
        shop: shop,
        quantity: qty,
        revenue: sale.total_with_tax
      });
    }
  }

  const output = {
    totalWatches,
    byShop,
    byShopByMonth,
    juneReport
  };

  fs.writeFileSync('watches_report.json', JSON.stringify(output, null, 2));
  console.log("Report generated successfully");
}

getWatchesData();
