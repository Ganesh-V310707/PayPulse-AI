// Amazon Creators API requires eligible Associates account and approved credentials.
// This adapter is intentionally unavailable until compliant integration is implemented.
// Do not bypass marketplace access controls or insert fake listings.
module.exports={id:'AMAZON_CREATORS',name:'Amazon Creators API',status:'requires_partner_approval',live:false,description:'Official Creators API application and program eligibility required',async search(){return [];}};
