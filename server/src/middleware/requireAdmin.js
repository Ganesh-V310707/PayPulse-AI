const crypto = require('node:crypto');
const env = require('../config/env');
function requireAdmin(req,res,next){
 if(!env.adminApiKey || env.adminApiKey.length<24)return res.status(503).json({message:'Admin access disabled. Configure a random 32+ character ADMIN_API_KEY in server/.env to manage payments.'});
 const a=Buffer.from(String(req.get('X-Admin-Key')||''));const b=Buffer.from(env.adminApiKey);
 if(a.length!==b.length || !crypto.timingSafeEqual(a,b))return res.status(401).json({message:'Admin key required for payment operations.'});
 next();
}
module.exports={requireAdmin};
