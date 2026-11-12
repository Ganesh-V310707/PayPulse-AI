const test=require('node:test');const assert=require('node:assert/strict');
const envFile=require.resolve('../src/config/env');require.cache[envFile]={id:envFile,filename:envFile,loaded:true,exports:{adminApiKey:'secure-example-key-with-64-something-characters-keep-private'}};
const {requireAdmin}=require('../src/middleware/requireAdmin');
function run(key){let code=0,payload=null,nextCalled=false;const req={get:()=>key};const res={status(c){code=c;return this},json(d){payload=d;return this}};requireAdmin(req,res,()=>{nextCalled=true});return {code,payload,nextCalled}}
test('payment admin middleware rejects missing and wrong keys',()=>{assert.equal(run('').code,401);assert.equal(run('invalid').code,401);assert.equal(run('wrong-key-with-very-similar-length-already-long').nextCalled,false)});
test('payment admin middleware allows only the exact configured secret',()=>{assert.equal(run('secure-example-key-with-64-something-characters-keep-private').nextCalled,true)});
