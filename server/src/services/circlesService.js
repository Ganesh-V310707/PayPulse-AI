const crypto=require('node:crypto');
const seeded=[
 {id:'DEMO-CIRCLE-1',name:'Developer laptop collective',category:'Laptops',budget:65000,requirements:'16GB RAM, strong battery, coding-ready',members:24,offers:[{id:'demo-bid-a',merchant:'Sample Merchant A',amount:61500,terms:'Demo quote only'}],demo:true},
 {id:'DEMO-CIRCLE-2',name:'Campus creators collective',category:'Cameras',budget:40000,requirements:'4K video and audio input',members:12,offers:[],demo:true},
 {id:'DEMO-CIRCLE-3',name:'Remote work desk setup',category:'Monitors',budget:17000,requirements:'QHD IPS with USB-C',members:18,offers:[],demo:true},
];
const local=seeded.map(c=>({...c,offers:[...c.offers]}));
function all(){return local.map(c=>({...c,offers:c.offers.map(o=>({...o}))}));}
function create(body){const name=String(body.name||'').trim().slice(0,80),category=String(body.category||'Other').slice(0,40),requirements=String(body.requirements||'').trim().slice(0,400),budget=Number(body.budget);if(name.length<4||requirements.length<8||!Number.isFinite(budget)||budget<=0||budget>1e8){const e=new Error('Enter a valid group name, requirements and budget.');e.status=400;throw e;}const doc={id:'DEMO-'+crypto.randomUUID().slice(0,8),name,category,requirements,budget,members:1,offers:[],demo:true};local.unshift(doc);return doc;}
function join(id){const c=local.find(c=>c.id===id);if(!c){const e=new Error('Group not found');e.status=404;throw e;}c.members+=1;return c;}
function bid(id,body){const c=local.find(c=>c.id===id);if(!c){const e=new Error('Group not found');e.status=404;throw e;}const amount=Number(body.amount),merchant=String(body.merchant||'').trim().slice(0,80),terms=String(body.terms||'').slice(0,180);if(merchant.length<2||!Number.isFinite(amount)||amount<=0||amount>1e8){const e=new Error('Merchant name and positive quote amount required.');e.status=400;throw e;}c.offers.push({id:'DEMO-BID-'+crypto.randomUUID().slice(0,7),merchant,amount,terms,demo:true});return c;}
module.exports={all,create,join,bid};
