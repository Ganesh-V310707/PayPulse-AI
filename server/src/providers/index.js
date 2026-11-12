// Provider contract: {id,name,status,live,search(query, filters)}.
// A provider must return normalized product records with source and data timestamps.
// Only the demo catalogue can be queried without approved partner access.
const demo = require('./demoProvider');
const amazon = require('./amazonCreatorsProvider');
const flipkart = require('./flipkartProvider');
const providers = [demo,amazon,flipkart];
function listProviders(){return providers.map(({id,name,status,live,description})=>({id,name,status,live,description}));}
function activeProviders(){return providers.filter(p=>p.live||p.id==='DEMO_CATALOG');}
module.exports={providers,listProviders,activeProviders};
