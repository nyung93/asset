import {strict as assert} from 'node:assert';
import {Readable} from 'node:stream';

// Run after bundling so production builds fail if the deployed entry point is broken.
process.env.FIREBASE_PROJECT_ID='';
const {default:handler}=await import('../api/index.mjs');
const request=Object.assign(Readable.from([]),{
  method:'GET',url:'/api/index?action=status',headers:{host:'example.com'},
});
let body='';
const response={statusCode:200,setHeader:()=>undefined,end:chunk=>{body=chunk.toString();}};
await handler(request,response);
assert.equal(response.statusCode,503);
assert.equal(JSON.parse(body).code,'setup_required');
