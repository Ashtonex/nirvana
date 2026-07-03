const fs = require('fs');
const { jsPDF } = require('jspdf');
const autoTable = require('jspdf-autotable').default || require('jspdf-autotable');

const rawData = JSON.parse(fs.readFileSync('june_sales_report.json', 'utf8'));

// Helper to categorize
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
    for (const [product, revenue] of Object.entries(rawData.byShop[shop].byProduct)) {
      if (revenue > 0) {
        shopData[shop].total += revenue;
        totalAcross3Shops += revenue;
        
        // Product
        shopData[shop].products[product] = revenue;
        
        // Category
        const cat = getCategory(product);
        if (!shopData[shop].categories[cat]) {
          shopData[shop].categories[cat] = 0;
        }
        shopData[shop].categories[cat] += revenue;
      }
    }
  }
}

const doc = new jsPDF();
let startY = 20;

doc.setFontSize(18);
doc.text("June Sales Report: All Shops", 14, startY);
startY += 10;
doc.setFontSize(12);
doc.text(`Total Sales Across All 3 Shops (Kipasa, Dubdub, Tradecenter): $${totalAcross3Shops.toFixed(2)}`, 14, startY);
startY += 15;

for (const shop of shops) {
  doc.setFontSize(16);
  doc.text(`Shop: ${shop.toUpperCase()} (Total: $${shopData[shop].total.toFixed(2)})`, 14, startY);
  startY += 5;
  
  // Category Breakdown
  const catBody = Object.entries(shopData[shop].categories)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, rev]) => [cat, `$${rev.toFixed(2)}`]);
    
  autoTable(doc, {
    startY: startY,
    head: [['Category', 'Revenue']],
    body: catBody,
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 185] }
  });
  
  startY = doc.lastAutoTable.finalY + 10;
  
  // Product Breakdown
  const prodBody = Object.entries(shopData[shop].products)
    .sort((a, b) => b[1] - a[1])
    .map(([prod, rev]) => [prod, `$${rev.toFixed(2)}`]);
    
  autoTable(doc, {
    startY: startY,
    head: [['Product', 'Revenue']],
    body: prodBody,
    theme: 'striped',
    headStyles: { fillColor: [39, 174, 96] }
  });
  
  startY = doc.lastAutoTable.finalY + 20;
  
  // Add new page if close to bottom
  if (startY > 250) {
    doc.addPage();
    startY = 20;
  }
}

const pdfPath = 'C:\\\\Users\\\\ashjx\\\\.gemini\\\\antigravity\\\\brain\\\\4a6fd670-8842-4181-af70-334a6cbd4e7b\\\\June_Sales_Report_Comprehensive.pdf';
fs.writeFileSync(pdfPath, Buffer.from(doc.output('arraybuffer')));
console.log("PDF saved to", pdfPath);
