const catalog=require('../data/demoCatalog.json');
module.exports={id:'DEMO_CATALOG',name:'PayPulse demo catalogue',status:'demo_available',live:false,description:'Fictional samples only, served locally with explicit DEMO labels',async search(){return catalog.map(p=>({...p,source:'DEMO_CATALOG',demo:true}));}};
