const express=require('express');
const rateLimit=require('express-rate-limit');
const {catalog,CATEGORIES,searchCatalog,compareProducts,answerShopping,identifyImage}=require('../services/commerceService');
const {liveSearch,barcodeLookup,providerStatus}=require('../services/liveCommerceService');
const {calculate}=require('../services/decisionService');
const router=express.Router();
const searchLimit=rateLimit({windowMs:15*60*1000,limit:40,standardHeaders:'draft-8',legacyHeaders:false});
const aiLimit=rateLimit({windowMs:15*60*1000,limit:12,standardHeaders:'draft-8',legacyHeaders:false});
router.get('/providers',(_req,res)=>res.json({providers:providerStatus()}));
router.get('/categories',(_req,res)=>res.json({categories:CATEGORIES}));
router.get('/demo/products',(req,res)=>res.json(searchCatalog({query:String(req.query.q||'').slice(0,500),category:req.query.category,budget:req.query.budget,sort:req.query.sort})));
// Keep this old route as an explicitly labeled demo-only compatibility route.
router.get('/products',(req,res)=>res.json(searchCatalog({query:String(req.query.q||'').slice(0,500),category:req.query.category,budget:req.query.budget,sort:req.query.sort})));
router.get('/products/:id',(req,res)=>{const p=catalog.find(p=>p.id===req.params.id);if(!p)return res.status(404).json({message:'Demo product not found.'});res.json({product:p,demo:true});});
router.post('/compare',(req,res)=>res.json(compareProducts(Array.isArray(req.body.ids)?req.body.ids:[])));
router.post('/search',searchLimit,async(req,res,next)=>{try{
 const q=String(req.body.query||'').slice(0,500).trim();
 if(req.body.mode==='demo')return res.json({...searchCatalog({query:q}),errors:[]});
 const country=String(req.body.country||'').toUpperCase();
 res.json(await liveSearch(q,{country}));
}catch(e){next(e)}});
router.post('/assistant',aiLimit,async(req,res,next)=>{try{
 const query=String(req.body.query||'').trim().slice(0,500);
 if(query.length<3)return res.status(400).json({message:'Describe what you are looking for.'});
 const mode=req.body.mode==='demo'?'demo':'live';
 const result=mode==='demo'?searchCatalog({query}):await liveSearch(query,{country:String(req.body.country||'').toUpperCase()});
 const response=await answerShopping(query,result.items.slice(0,12),result.intent,mode);
 res.json({...response,products:result.items,intent:result.intent,summary:result.summary,sourceInfo:result.sourceInfo,errors:result.errors||[]});
}catch(e){next(e)}});
router.get('/barcode/:code',searchLimit,async(req,res,next)=>{try{
 const code=String(req.params.code||'').slice(0,40);
 if(code.toUpperCase().startsWith('DEMO')){const p=catalog.find(x=>x.barcode===code);return res.json({matched:Boolean(p),product:p||null,source:'DEMO_CATALOG',message:p?'Demo sample only':'Demo barcode not found'});}
 res.json(await barcodeLookup(code));
}catch(e){next(e)}});
router.post('/scan-image',aiLimit,async(req,res,next)=>{try{res.json(await identifyImage({base64:req.body.base64,mimeType:req.body.mimeType}));}catch(e){next(e)}});
router.post('/decision/:tool',searchLimit,(req,res,next)=>{try{res.json(calculate(req.params.tool,req.body||{}));}catch(e){next(e)}});
router.get('/insights',(_req,res)=>res.json({readiness:providerStatus()}));
module.exports=router;
