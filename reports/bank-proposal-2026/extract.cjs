const fs=require('fs');
const {createClient}=require('../../node_modules/@supabase/supabase-js');
const env={};
for(const line of fs.readFileSync('.env.local','utf8').split(/\r?\n/)){let i=line.indexOf('=');if(i>0&&!line.trim().startsWith('#'))env[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');}
const db=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
async function main(){const out={extractedAt:new Date().toISOString(),scope:['kipasa','dubdub']};for(const table of ['shops','sales','ledger_entries']){let rows=[];for(let start=0;;start+=1000){let q=db.from(table).select('*').in(table==='shops'?'id':'shop_id',['kipasa','dubdub']);if(table!=='shops')q=q.gte('date','2025-09-01').lt('date','2026-09-16');q=q.order('id').range(start,start+999);const {data,error}=await q;if(error)throw Error(table+': '+error.message);rows.push(...data);if(data.length<1000)break;}out[table]=rows;console.log(table,rows.length);}
fs.writeFileSync('reports/bank-proposal-2026/source_extract.json',JSON.stringify(out));
const monthly={};for(const r of out.sales){if(r.deleted_at)continue;let k=r.shop_id+' '+r.date.slice(0,7);let m=monthly[k]??={count:0,gross:0,net:0,tax:0};m.count++;m.gross+=Number(r.total_with_tax??r.total_before_tax??0);m.net+=Number(r.total_before_tax??0);m.tax+=Number(r.tax??0);}console.log(JSON.stringify({shops:out.shops,monthly},null,2));}
main().catch(e=>{console.error(e.message);process.exitCode=1});
