'use strict';
const crypto = require('node:crypto');
const env = require('../config/env');
const {extractIntent} = require('./commerceService');
const cache = new Map();
const safeUrl = (s) => { try { const u = new URL(String(s||'')); return ['https:','http:'].includes(u.protocol) && !['localhost','127.0.0.1'].includes(u.hostname) ? u.href : null; } catch { return null; } };
const clean = (s,n=240) => String(s||'').replace(/[<>\x00-\x1f]/g,' ').trim().slice(0,n);
const hash = s => crypto.createHash('sha256').update(s).digest('hex').slice(0,22);
function getCurrency(country='IN'){ return country==='IN'?'INR':country==='GB'?'GBP':'USD'; }
function extractSearchTerms(query,intent){
 const filtered=clean(query,500).replace(/(?:₹|\$|rs\.?|inr|usd|gbp|£)\s*[\d,]+(?:\.\d+)?\s*k?/gi,' ').replace(/\b(?:under|below|less than|within|maximum|max|around|budget|up to)\s*[\d,]+\s*k?\b/gi,' ').replace(/\b(?:i|need|want|find|show|me|a|an|the|best|good|for|with|my|to|please|that|is|and|of|product|price|buy|search|recommend|suggest|options|between|under|below|maximum|max|less|than|budget|around)\b/gi,' ').replace(/\s+/g,' ').trim();
 return (filtered || intent.category || query).slice(0,120);
}
function scored(p,intent){
 const text=`${p.name} ${p.description} ${(p.specs||[]).join(' ')}`.toLowerCase();
 const matches=[...new Set([...(intent.keywords||[]),...(intent.importantNeeds||[])])].filter(w=>text.includes(w)).slice(0,7);
 let score=38 + Math.min(35,matches.length*7);
 if(intent.budget && intent.currency===p.currency){ score += p.price<=intent.budget?16:Math.max(-20,10-((p.price-intent.budget)/intent.budget)*35); }
 else if(intent.budget) score-=12;
 if(p.rating && p.reviewCount)score+=Math.min(9,Math.max(0,(p.rating-3)*2+Math.log10(p.reviewCount+1)));
 const delta=intent.budget && intent.currency===p.currency ? p.price-intent.budget : null;
 return {...p,score:Math.min(100,Math.max(0,Math.round(score))),matchedFeatures:matches,budgetDelta:delta,
 explanation: [matches.length?`Listing mentions ${matches.slice(0,3).join(', ')}`:'Check listing details against your requirements',delta===null?'No comparable budget or price provided':delta<=0?'Within your budget':`${Math.round(delta).toLocaleString()} above budget`,'Verify merchant details and current availability'].join(' · ')};
}
const DEFAULT_TIMEOUT=13000;
async function fetchJSON(url,opts={}){
 const r=await fetch(url,{...opts,signal:AbortSignal.timeout(DEFAULT_TIMEOUT)});
 const body=await r.json().catch(()=>({}));
 if(!r.ok){ const e=new Error(clean(body.error||body.error_description||body.message||`Provider returned ${r.status}`,350));e.status=r.status;e.providerError=true;throw e; }
 return body;
}
async function serpapiSearch(terms,country){
 const u=new URL('https://serpapi.com/search.json');
 for(const [k,v] of Object.entries({engine:'google_shopping',q:terms,gl:country.toLowerCase(),hl:'en',num:'24',api_key:env.serpapiKey}))u.searchParams.set(k,v);
 const data=await fetchJSON(u);
 if(data.error)throw new Error('Shopping provider: '+clean(data.error));
 const currency=getCurrency(country);
 return (data.shopping_results||[]).slice(0,35).map((v,i)=>{
  const price=Number(v.extracted_price);
  const priceText=String(v.price||'');
  const explicitCurrency=/₹|\b(?:Rs\.?|INR)\b/i.test(priceText)?'INR':/£|\bGBP\b/i.test(priceText)?'GBP':/\$|\bUSD\b/i.test(priceText)?'USD':null;
  if(explicitCurrency && explicitCurrency!==currency)return null;
  if(!Number.isFinite(price)||price<=0)return null;
  const url=safeUrl(v.link||v.product_link);
  if(!url)return null;
  const id='serp_'+hash(`${v.product_id||v.title}|${v.source}|${price}|${i}`);
  return {id,name:clean(v.title,180),description:clean(v.snippet||v.delivery||'',500),tagline:clean(v.snippet||'Current provider listing (verify before purchase)',200),category:'Products',source:'GOOGLE_SHOPPING',provider:'SerpApi · Google Shopping',store:clean(v.source,90)||'Marketplace',price,currency,originalPrice:Number(v.extracted_old_price)||null,rating:Number(v.rating)||null,reviewCount:Number(v.reviews)||null,image:safeUrl(v.thumbnail||v.serpapi_thumbnail),url,productPageType:v.link?'retailer-or-listing':'comparison-listing',availability:null,specs:(v.extensions||[]).filter(x=>typeof x==='string').slice(0,5),useCases:[],demo:false,sourceTimestamp:new Date().toISOString()};
 }).filter(Boolean);
}
let token=null;let tokenUntil=0;
async function getEbayToken(){
 if(token && Date.now()<tokenUntil-60000)return token;
 const auth=Buffer.from(`${env.ebayClientId}:${env.ebayClientSecret}`).toString('base64');
 const r=await fetch('https://api.ebay.com/identity/v1/oauth2/token',{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'client_credentials',scope:'https://api.ebay.com/oauth/api_scope'}),signal:AbortSignal.timeout(DEFAULT_TIMEOUT)});
 const d=await r.json().catch(()=>({}));if(!r.ok||!d.access_token)throw new Error('eBay authentication failed: '+clean(d.error_description||d.error||r.status));token=d.access_token;tokenUntil=Date.now()+(Number(d.expires_in)||3600)*1000;return token;
}
async function ebaySearch(terms,country){
 if(!['US','GB'].includes(country))return [];
 const cur=getCurrency(country);const market=country==='GB'?'EBAY_GB':'EBAY_US';
 const u=new URL('https://api.ebay.com/buy/browse/v1/item_summary/search');u.searchParams.set('q',terms);u.searchParams.set('limit','30');
 const data=await fetchJSON(u,{headers:{Authorization:`Bearer ${await getEbayToken()}`,'X-EBAY-C-MARKETPLACE-ID':market}});
 return (data.itemSummaries||[]).map(v=>{
  const price=Number(v.price?.value);const url=safeUrl(v.itemWebUrl);if(!Number.isFinite(price)||price<=0||!url||v.price?.currency!==cur)return null;
  return {id:'ebay_'+hash(v.itemId),name:clean(v.title,180),description:clean(v.shortDescription||'',500),tagline:clean(v.shortDescription||'eBay seller listing',200),category:'Products',source:'EBAY',provider:'eBay Browse API',store:clean(v.seller?.username||'eBay',100),price,currency:cur,originalPrice:null,rating:null,reviewCount:null,image:safeUrl(v.image?.imageUrl),url,productPageType:'retailer-listing',availability:null,specs:[],useCases:[],demo:false,sourceTimestamp:new Date().toISOString()};
 }).filter(Boolean);
}
function providerStatus(){return {serpapi:{configured:Boolean(env.serpapiKey),label:'Google Shopping via SerpApi',requires:'SERPAPI_KEY'},ebay:{configured:Boolean(env.ebayClientId&&env.ebayClientSecret),label:'eBay Browse (US/GB)',requires:'EBAY_CLIENT_ID + EBAY_CLIENT_SECRET'},image:{configured:Boolean(env.geminiApiKey),label:'Gemini image identification',requires:'GEMINI_API_KEY'},barcode:{configured:true,label:'Open Food Facts (food products)',requires:'none; usage policy applies'}};}
async function liveSearch(query,{country=env.shoppingCountry,providers=null}={}){
 const q=clean(query,500);if(q.length<3){const e=new Error('Enter at least 3 characters to search.');e.status=400;throw e;}
 country=['IN','US','GB'].includes(country)?country:env.shoppingCountry;
 const intent=extractIntent(q);const terms=extractSearchTerms(q,intent);
 const active=(providers||['serpapi','ebay']).filter(p=>['serpapi','ebay'].includes(p));
 const configured=providerStatus();const enabled=active.filter(k=>configured[k].configured && !(k==='ebay'&&country==='IN'));
 if(!enabled.length)return {items:[],intent,summary:{matchingCount:0},sourceInfo:{mode:'NOT_CONNECTED',message:'Real product search is not connected. Add SERPAPI_KEY to server/.env. Demo data can be enabled separately.',required:['SERPAPI_KEY'],country,currency:getCurrency(country)},errors:[]};
 const ck=JSON.stringify([terms,country,enabled,intent.budget]);const found=cache.get(ck);if(found&&Date.now()-found.time<180000)return {...found.value,sourceInfo:{...found.value.sourceInfo,cache:'HIT'}};
 const results=await Promise.allSettled(enabled.map(k=>k==='serpapi'?serpapiSearch(terms,country):ebaySearch(terms,country)));
 const errors=results.flatMap((v,i)=>v.status==='rejected'?[{provider:enabled[i],message:clean(v.reason?.message||'Provider unavailable',200)}]:[]);
 const items=results.flatMap(v=>v.status==='fulfilled'?v.value:[]).filter(x=>x.currency===getCurrency(country));
 const seen=new Set();const ranked=items.filter(p=>{const id=p.source+'|'+p.name.toLowerCase()+'|'+p.price;if(seen.has(id))return false;seen.add(id);return true;}).map(p=>scored(p,intent)).sort((a,b)=>b.score-a.score);
 const bestWithin=intent.budget&&intent.currency===getCurrency(country)?ranked.filter(p=>p.price<=intent.budget)[0]:ranked[0];
 const stretch=intent.budget&&intent.currency===getCurrency(country)?ranked.filter(p=>p.price>intent.budget).sort((a,b)=>a.price-b.price)[0]:null;
 const response={items:ranked,intent:{...intent,searchTerms:terms},summary:{matchingCount:ranked.length,bestWithinId:bestWithin?.id||null,stretchId:stretch?.id||null},sourceInfo:{mode:ranked.length?'LIVE':(errors.length?'PROVIDER_ERROR':'EMPTY'),message:(ranked.length?'Prices are provided by upstream shopping services and are not guaranteed at checkout. Verify the merchant listing.':errors.length?'The connected shopping provider returned an error.':'No live listings matched this request.')+(intent.budget&&intent.currency!==getCurrency(country)?` Your ${intent.currency} budget was NOT compared to ${getCurrency(country)} prices; select the matching country/currency.`:''),country,currency:getCurrency(country),providers:enabled,checkedAt:new Date().toISOString()},errors};
 if(cache.size>80)cache.clear();cache.set(ck,{time:Date.now(),value:response});return response;
}
async function barcodeLookup(code){
 const c=clean(code,32).replace(/\s+/g,'');if(!/^\d{8,14}$/.test(c)){const e=new Error('Enter a valid EAN/UPC barcode (8–14 digits).');e.status=400;throw e;}
 const data=await fetchJSON(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}?fields=code,product_name,brands,quantity,image_front_url,categories,ingredients_text`,{headers:{'User-Agent':env.productUserAgent||'PayPulseAI/2.1 (contact: dev@example.org)'}});
 if(data.status!==1||!data.product)return {matched:false,status:'NOT_FOUND',message:'No verified record found in Open Food Facts. This catalogue covers food, not general electronics.'};
 const p=data.product;return {matched:true,status:'MATCHED',source:'OPEN_FOOD_FACTS',product:{name:clean(p.product_name||'Unlabeled food product'),brand:clean(p.brands,100),description:clean(p.ingredients_text||p.categories||'',600),image:safeUrl(p.image_front_url),barcode:c},message:'Open Food Facts identifies the item, but does not provide live shop prices or stock.'};
}
module.exports={liveSearch,barcodeLookup,providerStatus,extractSearchTerms,scored,safeUrl,serpapiSearch,ebaySearch};
