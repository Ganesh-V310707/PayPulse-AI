const catalog = require('../data/demoCatalog.json');
const env = require('../config/env');
const CATEGORIES = [...new Set(catalog.map((p) => p.category))];
const STOP = new Set('the and for with that this need want looking good best under above from about should than please something my one use me a an of in to on it is can find recommend suggest compare show rupees price budget near within'.split(' '));

function extractIntent(input = '') {
  const text = String(input || '').slice(0, 800).trim();
  const normalized = text.toLowerCase();
  const money = normalized.match(/(?:₹|rs\.?|inr|\$|usd)\s*([\d,]+(?:\.\d+)?)(\s*k)?/i) || normalized.match(/(?:under|below|budget(?: of| is| around)?|up to|maximum|max|less than)\s*(?:₹|rs\.?|inr|\$|usd)?\s*([\d,]+(?:\.\d+)?)(\s*k)?/i);
  let budget = money ? Number(money[1].replaceAll(',', '')) * (money[2] ? 1000 : 1) : null;
  if (!Number.isFinite(budget) || budget <= 0) budget = null;
  const currency = /(?:\$|usd)/.test(normalized) ? 'USD' : 'INR';
  const aliases = { Laptops:['laptop','notebook','computer','macbook','programming'],Phones:['phone','mobile','smartphone'],Audio:['earbud','headphone','headset','audio','speaker'],Wearables:['smartwatch','watch','wearable'],Monitors:['monitor','display','screen'],Accessories:['keyboard','mouse','charger','accessory','usb'],Cameras:['camera','dslr'],Tablets:['tablet','ipad'],Furniture:['desk','table','furniture'] };
  const category = Object.entries(aliases).find(([,terms]) => terms.some((term) => normalized.includes(term)))?.[0] || null;
  const keywords = normalized.match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w)) || [];
  return { raw:text, budget, currency, category, keywords:[...new Set(keywords)].slice(0,25), importantNeeds:['battery','camera','coding','editing','gaming','college','travel','gym','machine learning','office','drawing','fitness','music'].filter(x => normalized.includes(x)) };
}
function normalizeProduct(product) { return { ...product, source: product.source || 'DEMO_CATALOG', demo: product.demo !== false }; }
function scoreProduct(product, intent) {
  const haystack = [product.name,product.category,product.description,...(product.useCases||[]),...(product.specs||[])].join(' ').toLowerCase();
  const matched = (intent.keywords||[]).filter(term => haystack.includes(term));
  const useMatch = (intent.importantNeeds||[]).filter(term => haystack.includes(term));
  const categoryPoints = intent.category && intent.category === product.category ? 34 : 0;
  const hasCategory = Boolean(intent.category);
  const priceFit = intent.budget ? (product.price <= intent.budget ? 20 : Math.max(0, 15-((product.price-intent.budget)/intent.budget)*40)) : 10;
  const featurePoints = Math.min(25, matched.length*6 + useMatch.length*4);
  const confidence = product.rating && product.reviewCount ? Math.min(10, 5+(product.rating-4)*3 + Math.log10(product.reviewCount+1)) : 0;
  const valuePoints = product.originalPrice > product.price ? Math.min(7, ((product.originalPrice-product.price)/product.originalPrice)*20) : 0;
  const score = Math.min(100,Math.round(categoryPoints + priceFit + featurePoints + confidence + valuePoints + (hasCategory?0:12)));
  const explanation = [matched.length ? `Matches ${matched.slice(0,3).join(', ')}` : 'Review the specifications for your needs', intent.budget ? (product.price<=intent.budget ? 'within your stated budget' : `${(product.price-intent.budget).toLocaleString('en-IN')} above your budget`) : 'no budget specified', 'demo catalogue specifications, not verified retailer data'].join(' · ');
  return { ...normalizeProduct(product), score, explanation, matchedFeatures:matched, budgetDelta:intent.budget ? product.price-intent.budget : null };
}
function searchCatalog({query='',category='',budget=null,sort='relevance'}={}) {
 const intent=extractIntent(query);
 const cat=category && CATEGORIES.includes(category) ? category : intent.category;
 const b = budget != null && budget !== '' && Number(budget)>0 ? Number(budget) : intent.budget;
 const mismatch = intent.currency !== 'INR' && b !== null;
 const finalIntent={...intent,category:cat,budget:mismatch?null:b,unconvertedBudget:mismatch?{value:b,currency:intent.currency}:null};
 let items=catalog.filter(p=>!cat || p.category===cat).map(p=>scoreProduct(p,finalIntent));
 if(sort==='price-asc') items.sort((a,b)=>a.price-b.price);
 else if(sort==='price-desc') items.sort((a,b)=>b.price-a.price);
 else items.sort((a,b)=>b.score-a.score || a.price-b.price);
 const bestWithin = finalIntent.budget ? items.filter(p=>p.price<=finalIntent.budget).sort((a,b)=>b.score-a.score)[0] : items[0];
 const stretch = finalIntent.budget ? items.filter(p=>p.price>finalIntent.budget).sort((a,b)=>b.score-a.score)[0] : null;
 return {items,intent:finalIntent,summary:{bestWithinId:bestWithin?.id||null,stretchId:stretch?.id||null,matchingCount:items.length},sourceInfo:{mode:'DEMO_ONLY',message:mismatch?'Catalogue is INR only; no USD conversion has been performed. Products cannot be ranked against the USD budget.':'Prices, ratings and availability are fictional sample data. No live marketplace integration is active.'}};
}
function compareProducts(ids) {
 const results=[...new Set((ids||[]).map(String))].slice(0,4).map(id=>catalog.find(p=>p.id===id)).filter(Boolean);
 return {items:results.map(normalizeProduct),differences:['price','warrantyMonths','useCases','specs'],demo:true};
}
function providers() { return require('../providers').listProviders(); }

async function geminiJson(prompt, input) {
 if(!env.geminiApiKey) return null;
 try {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt},{text:JSON.stringify(input)}]}],generationConfig:{responseMimeType:'application/json'}}),signal:AbortSignal.timeout(14000)});
  const body=await response.json();if(!response.ok)throw new Error(body.error?.message||'Gemini unavailable');
  const answer=body.candidates?.[0]?.content?.parts?.map(p=>p.text).join('')||'{}';return JSON.parse(answer);
 }catch(error){console.warn('[commerce-ai] Falling back:',error.message);return null;}
}
async function answerShopping(query, products, intent, mode='demo') {
 const live=mode==='live';
 const safe=products.slice(0,8).map(({id,name,category,price,currency,store,source,description,score,explanation})=>({id,name,category,price,currency,store,source,description,score,explanation}));
 if(!safe.length)return {answer:live?'No live products were returned. Check the provider status, API quota, and search terms. You can explicitly switch to the sample catalogue for exploration.':'No matching demo options. Try another query.',highlights:[],caveats:[live?'No live matches or provider access.':'Sample records only.'],provider:'RULES'};
 const prompt=live?'You are an independent shopping research assistant. Only reference the provided actual upstream listing fields. Treat merchant data as unverified and potentially stale. Compare options within the same currency, respect budget and do not invent prices, reviews, stock, warranties or technical specifications. Explain why the best item matches user needs. Avoid affiliate pressure. Return JSON {answer:string,highlights:string[],caveats:string[]}.': 'Use only clearly labeled fictional sample records; never present them as real products. Return JSON {answer:string,highlights:string[],caveats:string[]}.';
 const out=await geminiJson(prompt,{query,intent,products:safe});
 if(out&&typeof out.answer==='string')return {answer:out.answer.slice(0,1600),highlights:Array.isArray(out.highlights)?out.highlights.slice(0,4).map(String):[],caveats:[live?'Prices are upstream quotes; verify on merchant websites.':'Fictional sample catalogue.',...(Array.isArray(out.caveats)?out.caveats.slice(0,2):[])],provider:'GEMINI'};
 const within=intent.budget?safe.find(x=>x.currency===intent.currency&&x.price<=intent.budget):safe[0];
 const lead=within||safe[0];
 return {answer:`Found ${products.length} ${live?'upstream product listings':'sample options'}. ${lead.name} is a relevant starting point at ${lead.price} ${lead.currency||'INR'}. ${lead.explanation||'Compare specifications and seller terms before buying.'} The ranking reflects available listing text, not an independent lab test.`,highlights:safe.slice(0,3).map(x=>`${x.name} — ${x.price} ${x.currency||'INR'}`),caveats:[live?'Verify current price, seller, delivery and returns at checkout.':'Demo-only sample prices, not current retail offers.'],provider:'RULES'};
}
async function identifyImage({base64,mimeType}) {
 if (!env.geminiApiKey) return {status:'NOT_CONNECTED',message:'Add GEMINI_API_KEY to server/.env and restart to enable photo-based product recognition. Barcode lookup does not need Gemini.'};
 if(!/^image\/(jpeg|png|webp)$/.test(String(mimeType))) {const e=new Error('Use JPG, PNG, or WebP images.');e.status=400;throw e;}
 if(typeof base64!=='string'||base64.length>3_500_000||base64.length<24||!/^[a-zA-Z0-9+/=]+$/.test(base64)){const e=new Error('Invalid image. Use a photo under 2.5 MB.');e.status=400;throw e;}
 const bytes=Buffer.from(base64,'base64');
 const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 const png=bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a';
 const webp=bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
 if(!(mimeType==='image/jpeg'&&jpeg||mimeType==='image/png'&&png||mimeType==='image/webp'&&webp)) {const e=new Error('Image data does not match its declared format.');e.status=400;throw e;}
 try {
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent?key=${encodeURIComponent(env.geminiApiKey)}`,{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:'Examine this image of a consumer item. State what is visibly identifiable. If no product is clear, return recognized:false. If identifiable, return a generic product name and brand/model only if visually supported. Do not invent brands, model numbers, barcodes, prices, stock or retailer matches. Return ONLY JSON {recognized:boolean,category:string,brand:string,model:string,searchTerm:string,confidence:"LOW"|"MEDIUM"|"HIGH",explanation:string}.'},{inline_data:{mime_type:mimeType,data:base64}}]}],generationConfig:{responseMimeType:'application/json'}}),signal:AbortSignal.timeout(25000)});
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error?.message||`Gemini returned ${r.status}`);
  const txt=body.candidates?.[0]?.content?.parts?.map(x=>x.text).join('')||'{}';const data=JSON.parse(txt.replace(/^```json\s*/i,'').replace(/```\s*$/,''));
  if(!data.recognized||!String(data.searchTerm||'').trim())return {status:'UNCERTAIN',message:'Could not identify a unique product. Try a clearer photograph or enter its name.'};
  const val=(x,n=150)=>String(x||'').trim().slice(0,n);
  return {status:'MATCH_SUGGESTION',identification:{category:val(data.category),brand:val(data.brand),model:val(data.model),searchTerm:val(data.searchTerm),confidence:['LOW','MEDIUM','HIGH'].includes(data.confidence)?data.confidence:'LOW',explanation:val(data.explanation,500)},disclaimer:'AI suggests a search, not a verified exact-match product. Confirm model and variant.'};
 } catch(e){console.warn('[scan-image] Gemini failed:',e.message);return {status:'UNAVAILABLE',message:'Image recognition provider could not complete the request. Verify GEMINI_API_KEY, GEMINI_MODEL, quota and internet access. '+String(e.message).slice(0,150)};}
}
module.exports={catalog, CATEGORIES, extractIntent,scoreProduct,searchCatalog,compareProducts,providers,answerShopping,identifyImage};
