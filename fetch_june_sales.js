const fs = require('fs');

async function getJuneSales() {
  const url = "https://tpbiqsazcmglxmzbmhxb.supabase.co/rest/v1/sales?date=gte.2026-06-01T00:00:00Z&date=lt.2026-07-01T00:00:00Z&select=*";
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
  
  if (allData.length > 0) {
      console.log("Keys available in sales record:", Object.keys(allData[0]));
  }

  // Aggregate Data
  let totalSales = 0;
  let byShop = {};
  
  for (const sale of allData) {
    const shop = sale.shop_id || 'Unknown';
    const category = sale.category || sale.category_name || sale.item_category || 'Uncategorized';
    const product = sale.item_name || 'Unknown Product';
    const revenue = sale.total_with_tax || 0;
    
    const qty = sale.quantity || 1;
    totalSales += revenue;
    
    if (!byShop[shop]) {
      byShop[shop] = { total: 0, byCategory: {}, byProduct: {} };
    }
    
    byShop[shop].total += revenue;
    
    // By Category
    if (!byShop[shop].byCategory[category]) {
      byShop[shop].byCategory[category] = { revenue: 0, quantity: 0 };
    }
    byShop[shop].byCategory[category].revenue += revenue;
    byShop[shop].byCategory[category].quantity += qty;
    
    // By Product
    if (!byShop[shop].byProduct[product]) {
      byShop[shop].byProduct[product] = { revenue: 0, quantity: 0 };
    }
    byShop[shop].byProduct[product].revenue += revenue;
    byShop[shop].byProduct[product].quantity += qty;
  }
  
  // Sort by product revenue descending to keep it readable
  for (const shop in byShop) {
      const sortedProducts = Object.entries(byShop[shop].byProduct)
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .reduce((obj, [key, value]) => {
              obj[key] = value;
              return obj;
          }, {});
      byShop[shop].byProduct = sortedProducts;
      
      const sortedCategories = Object.entries(byShop[shop].byCategory)
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .reduce((obj, [key, value]) => {
              obj[key] = value;
              return obj;
          }, {});
      byShop[shop].byCategory = sortedCategories;
  }

  const output = {
    totalSales,
    byShop
  };

  fs.writeFileSync('june_sales_report.json', JSON.stringify(output, null, 2));
  console.log("Report generated successfully. Total Sales:", totalSales);
}

getJuneSales();
