const test=require('node:test');
const assert=require('node:assert/strict');
// Unit-test pure commerce services without requiring external credentials or npm packages.
const envFile=require.resolve('../src/config/env');
require.cache[envFile]={id:envFile,filename:envFile,loaded:true,exports:{geminiApiKey:'',geminiModel:'gemini-2.5-flash'}};
const {extractIntent,searchCatalog,compareProducts,providers,answerShopping,identifyImage}=require('../src/services/commerceService');
const {calculate}=require('../src/services/decisionService');

test('natural language shopping intent extracts category and INR budget',()=>{
 const x=extractIntent('Need a laptop for coding under ₹60,000 with strong battery');
 assert.equal(x.budget,60000);assert.equal(x.category,'Laptops');assert.ok(x.importantNeeds.includes('coding'));
});
test('ranking stays within the correct category and sample results never claim retailer availability',()=>{
 const data=searchCatalog({query:'phone under ₹15,000 for camera'});
 assert.ok(data.items.length>0);assert.ok(data.items.every(p=>p.category==='Phones'&&p.demo===true&&p.productUrl===null));
 assert.equal(data.sourceInfo.mode,'DEMO_ONLY');
 assert.ok(data.items.every(p=>p.score>=0&&p.score<=100));
});
test('provider adapters do not misrepresent Amazon or Flipkart as connected',()=>{
 const all=providers();assert.equal(all[0].status,'demo_available');assert.ok(all.filter(p=>p.live).length===0);
});
test('comparison respects IDs, de-duplicates and ignores unknown products',()=>{
 const a=compareProducts(['phone-1','phone-1','no-item','laptop-1']);assert.equal(a.items.length,2);
});
test('the assistant fallback is explicit about demo data and never claims PayPal completion',async()=>{
 const x=searchCatalog({query:'monitor for coding'});const a=await answerShopping('monitor',x.items,x.intent);
 assert.equal(a.provider,'RULES');assert.ok(a.caveats[0].includes('Demo'));
});
test('image recognition fails clearly with no Gemini credentials',async()=>{
 const r=await identifyImage({base64:'',mimeType:'image/jpeg'});assert.equal(r.status,'NOT_CONNECTED');
});
test('ownership cost includes maintenance and subtracts hypothetical resale',()=>{
 const x=calculate('total-cost',{purchase:10000,shipping:1000,tax:0,maintenance:100,years:3,resale:2000});assert.equal(x.value,9300);
});
test('decision calculators reject unknown tools and do not invent sustainability emissions',()=>{
 assert.throws(()=>calculate('unknown',{}),/Unknown decision tool/);
 const result=calculate('eco-impact',{replaceYears:2,repairYears:3});assert.equal(result.value,3);assert.ok(result.assumptions.includes('not a quantified carbon'));
});

test('USD budgets are not silently compared to fictional INR catalogue prices',()=>{const x=searchCatalog({query:'laptop under $500'});assert.equal(x.intent.budget,null);assert.equal(x.intent.unconvertedBudget.currency,'USD');});
