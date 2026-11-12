const test=require('node:test');const assert=require('node:assert/strict');
const envFile=require.resolve('../src/config/env');require.cache[envFile]={id:envFile,filename:envFile,loaded:true,exports:{serpapiKey:'test-key',ebayClientId:'',ebayClientSecret:'',shoppingCountry:'IN',geminiApiKey:''}};
const {liveSearch}=require('../src/services/liveCommerceService');
test('upstream shopping result is normalized with a real link, source, image and currency', async()=>{
 const old=global.fetch;global.fetch=async(url)=>{assert.ok(String(url).includes('engine=google_shopping'));return {ok:true,json:async()=>({shopping_results:[{title:'Notebook 16 GB',extracted_price:52999,price:'₹52,999',source:'Store A',product_link:'https://www.google.com/shopping/product/987',thumbnail:'https://cdn.example.test/photo.jpg',rating:4.4,reviews:325,snippet:'16 GB RAM for coding',extensions:['16 GB RAM']} ]})}};
 try{const r=await liveSearch('laptop coding under ₹60,000',{country:'IN'});assert.equal(r.sourceInfo.mode,'LIVE');assert.equal(r.items[0].demo,false);assert.equal(r.items[0].price,52999);assert.equal(r.items[0].currency,'INR');assert.equal(r.items[0].store,'Store A');assert.ok(r.items[0].url.startsWith('https://'));assert.equal(r.items[0].budgetDelta,-7001)}finally{global.fetch=old}
});
test('provider errors never fall back to fabricated retailer listings',async()=>{
 const old=global.fetch;global.fetch=async()=>({ok:false,status:429,json:async()=>({error:'rate limit exceeded'})});
 try{const r=await liveSearch('headphones for travel',{country:'GB'});assert.equal(r.items.length,0);assert.equal(r.sourceInfo.mode,'PROVIDER_ERROR');assert.ok(r.errors.length>0)}finally{global.fetch=old}
});
