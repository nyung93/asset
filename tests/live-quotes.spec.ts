import { test, expect } from '@playwright/test';
test('live Yahoo quote via CORS-compatible relay from browser origin',async({page},testInfo)=>{
 test.skip(process.env.RGT_LIVE_QUOTES!=='1' || testInfo.project.name!=='desktop','Opt-in live network smoke check');
 page.on('requestfailed',request=>{if(request.url().includes('allorigins')) console.log('Proxy request failure:',request.failure()?.errorText);});
 page.on('console',message=>{if(message.type()==='error') console.log('Browser error:',message.text());});
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const modulePath='/src/utils/financeApi.ts';
  const {fetchCurrentPrice}=await import(/* @vite-ignore */ modulePath);
  return fetchCurrentPrice('AAPL',{includeMetadata:true,force:true});
 });
 expect(result).not.toBeNull();expect(result.price).toBeGreaterThan(0);expect(result.currency).toBe('USD');
 console.log('Live browser quote:',JSON.stringify(result));
});
