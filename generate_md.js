const fs = require('fs');

const rawData = JSON.parse(fs.readFileSync('june_sales_report.json', 'utf8'));

function getCategory(productName) {
  const name = productName.toLowerCase();
  if (name.includes('watch') && !name.includes('box') && !name.includes('battery')) return 'Watches';
  if (name.includes('perfume') || name.includes('diffuser')) return 'Perfume & Fragrance';
  if (name.includes('taser') || name.includes('pepper') || name.includes('baton') || name.includes('cuffs') || name.includes('shock')) return 'Self Defense';
  if (name.includes('ring') || name.includes('necklace') || name.includes('bracelet') || name.includes('wallet') || name.includes('hat') || name.includes('cap') || name.includes('bag') || name.includes('sunglasses')) return 'Accessories';
  if (name.includes('vape') || name.includes('rizla') || name.includes('lighter') || name.includes('crusher') || name.includes('pipe') || name.includes('smoke')) return 'Vapes & Smoking';
  if (name.includes('gun') || name.includes('pellet') || name.includes('holster')) return 'Weapons';
  if (name.includes('guitar') || name.includes('melodica') || name.includes('tambourine') || name.includes('drum')) return 'Musical Instruments';
  return 'Miscellaneous';
}

const shops = ['kipasa', 'dubdub', 'tradecenter'];
let totalAcross3Shops = 0;
let shopData = {};

for (const shop of shops) {
  shopData[shop] = {
    total: 0,
    categories: {},
    products: {}
  };
  
  if (rawData.byShop[shop] && rawData.byShop[shop].byProduct) {
    for (const [product, data] of Object.entries(rawData.byShop[shop].byProduct)) {
      if (data.revenue > 0) {
        shopData[shop].total += data.revenue;
        totalAcross3Shops += data.revenue;
        shopData[shop].products[product] = { revenue: data.revenue, quantity: data.quantity };
        
        const cat = getCategory(product);
        if (!shopData[shop].categories[cat]) {
          shopData[shop].categories[cat] = [];
        }
        shopData[shop].categories[cat].push({ product, revenue: data.revenue, quantity: data.quantity });
      }
    }
  }
}

let md = `# June Sales Comprehensive Report\n\n`;
md += `> [!TIP]\n> Total Sales Across All 3 Shops: **$${totalAcross3Shops.toFixed(2)}**\n\n`;

for (const shop of shops) {
  if (shopData[shop].total === 0) continue;
  
  md += `## Shop: ${shop.toUpperCase()} (Total: $${shopData[shop].total.toFixed(2)})\n\n`;
  
  // Sort categories by total revenue
  const sortedCats = Object.keys(shopData[shop].categories).sort((a, b) => {
    const revA = shopData[shop].categories[a].reduce((sum, item) => sum + item.revenue, 0);
    const revB = shopData[shop].categories[b].reduce((sum, item) => sum + item.revenue, 0);
    return revB - revA;
  });
  
  for (const cat of sortedCats) {
    const catTotal = shopData[shop].categories[cat].reduce((sum, item) => sum + item.revenue, 0);
    const catQty = shopData[shop].categories[cat].reduce((sum, item) => sum + item.quantity, 0);
    md += `### ${cat} - $${catTotal.toFixed(2)} (${catQty} items sold)\n\n`;
    
    // Sort products in category by revenue
    const sortedProds = shopData[shop].categories[cat].sort((a, b) => b.revenue - a.revenue);
    
    md += `| Product | Quantity Sold | Revenue |\n`;
    md += `| :--- | :--- | :--- |\n`;
    for (const p of sortedProds) {
      md += `| ${p.product} | ${p.quantity} | $${p.revenue.toFixed(2)} |\n`;
    }
    md += `\n`;
  }
  md += `---\n\n`;
}

const outputPath = 'C:\\\\Users\\\\ashjx\\\\.gemini\\\\antigravity\\\\brain\\\\4a6fd670-8842-4181-af70-334a6cbd4e7b\\\\June_Sales_Report.md';
fs.writeFileSync(outputPath, md);
console.log("Markdown saved successfully.");
