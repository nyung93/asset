import { test, expect } from '@playwright/test';
test('live Yahoo stock and USD/KRW quotes via same-origin server relay',async({page},testInfo)=>{
 test.skip(process.env.RGT_LIVE_QUOTES!=='1' || testInfo.project.name!=='desktop','Opt-in live network smoke check');
 page.on('requestfailed',request=>{if(request.url().includes('finance-quote')) console.log('Quote request failure:',request.failure()?.errorText);});
 page.on('console',message=>{if(message.type()==='error') console.log('Browser error:',message.text());});
 await page.goto('/');
 const result=await page.evaluate(async()=>{
  const modulePath='/src/utils/financeApi.ts';
  const {fetchCurrentPrice}=await import(/* @vite-ignore */ modulePath);
  return Promise.all([fetchCurrentPrice('AAPL',{includeMetadata:true,force:true}),fetchCurrentPrice('KRW=X',{includeMetadata:true,force:true})]);
 });
 expect(result[0]).not.toBeNull();expect(result[0].price).toBeGreaterThan(0);expect(result[0].currency).toBe('USD');
 expect(result[1]).not.toBeNull();expect(result[1].price).toBeGreaterThan(0);expect(result[1].currency).toBe('KRW');
 console.log('Live browser quote:',JSON.stringify(result));
});
