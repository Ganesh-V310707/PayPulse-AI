const test=require('node:test');const assert=require('node:assert/strict');
const envFile=require.resolve('../src/config/env');require.cache[envFile]={id:envFile,filename:envFile,loaded:true,exports:{geminiApiKey:'mock-test-key',geminiModel:'gemini-2.5-flash'}};
const {identifyImage}=require('../src/services/commerceService');
const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9W1QAAAABJRU5ErkJggg==';
test('image endpoint sends real inline image payload and returns tentative identifiable search term',async()=>{
 const original=global.fetch;global.fetch=async(url,init)=>{const body=JSON.parse(init.body);assert.equal(body.contents[0].parts[1].inline_data.mime_type,'image/png');assert.ok(body.contents[0].parts[1].inline_data.data.length>20);return {ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({recognized:true,category:'Audio',brand:'Sony',model:'WH-1000XM5',searchTerm:'Sony WH-1000XM5 headphones',confidence:'MEDIUM',explanation:'Text on package partially visible'})}]}}]})}};
 try{const result=await identifyImage({base64:png,mimeType:'image/png'});assert.equal(result.status,'MATCH_SUGGESTION');assert.equal(result.identification.searchTerm,'Sony WH-1000XM5 headphones')}finally{global.fetch=original}
});
test('image endpoint rejects spoofed MIME type instead of sending arbitrary content',async()=>{await assert.rejects(()=>identifyImage({base64:png,mimeType:'image/jpeg'}),/does not match/)});
