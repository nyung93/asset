import { test, expect, type Page } from '@playwright/test';
const now = new Date('2026-10-21T03:00:00Z');
async function enterInvestments(page: Page) {
 if (page.viewportSize()!.width < 768) await page.getByRole('navigation',{name:'하단 탭'}).getByRole('button',{name:'투자',exact:true}).click();
 else await page.getByRole('navigation',{name:'메인 메뉴'}).getByRole('button',{name:/^투자/}).click();
}
async function addStock(page:Page,search:string,principal:string,quantity:string) {
 await page.getByRole('button',{name:'종목 추가',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'투자 종목 추가'});
 await dialog.getByRole('combobox',{name:'종목 검색'}).fill(search);
 await dialog.getByRole('combobox',{name:'종목 검색'}).press('Enter');
 await dialog.getByLabel('매수 원금',{exact:false}).fill(principal);
 await dialog.getByLabel('보유 수량 (주)').fill(quantity);
 await dialog.getByRole('button',{name:'저장하기',exact:true}).click();
 await expect(dialog).not.toBeVisible();
}
test('autocomplete, quantity-based valuation, currency totals, refresh and failure retention',async({page},testInfo)=>{
 await page.clock.setFixedTime(now);
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 let apple=220;let samsung=55000;let failApple=false;
 await page.route(/\/api\/index\?action=finance-quote&ticker=/,async route=>{
  const requestUrl=new URL(route.request().url());
  const ticker=requestUrl.searchParams.get('ticker')!;
  if(ticker==='AAPL' && failApple) {await route.fulfill({status:503,body:'unavailable'});return;}
  const body={chart:{error:null,result:[{meta:{symbol:ticker,currency:ticker==='KRW=X'||ticker.endsWith('.KS')?'KRW':'USD',regularMarketPrice:ticker==='KRW=X'?1300:ticker==='AAPL'?apple:samsung,regularMarketTime:Math.floor(now.getTime()/1000)}}]}};
  await route.fulfill({json:body});
 });
 await page.goto('/');await enterInvestments(page);
 await addStock(page,'애플','2000','10');
 const appleCard=page.getByRole('region',{name:'보유 투자 종목'}).getByRole('article').filter({hasText:'Apple Inc.'});
 await expect(appleCard).toContainText('US$2,200.00');
 await expect(appleCard.getByText('+10.00%',{exact:true})).toHaveClass(/text-rose-500/);
 await expect(page.getByRole('article').filter({hasText:'총 매수 원금'})).toContainText('₩2,600,000');
 apple=230;
 await page.getByRole('button',{name:'시세 새로고침',exact:true}).click();
 await expect(appleCard).toContainText('US$2,300.00');
 await addStock(page,'삼성전자','500000','10');
 await expect(page.getByRole('region',{name:'해외 주식'})).toContainText('US$2,300.00');
 await expect(page.getByRole('article').filter({hasText:'총 매수 원금'})).toContainText('₩3,100,000');
 await expect(page.getByRole('article').filter({hasText:'현재 총 평가금액'})).toContainText('₩3,540,000');
 failApple=true;samsung=45000;
 await page.getByRole('button',{name:'시세 새로고침',exact:true}).click();
 await expect(page.getByText('1개 종목의 시세를 갱신하지 못했어요. 저장된 평가금액을 유지합니다.')).toBeVisible();
 await expect(appleCard).toContainText('US$2,300.00');
 await expect(appleCard).toContainText('갱신 실패, 저장값 유지');
 const samsungCard=page.getByRole('region',{name:'보유 투자 종목'}).getByRole('article').filter({hasText:'삼성전자'});
 await expect(samsungCard.getByText('-10.00%',{exact:true})).toHaveClass(/text-blue-500/);
 await expect(page.getByRole('article').filter({hasText:'현재 총 평가금액'})).toContainText('₩3,440,000');
 await expect(page.getByRole('region',{name:'국내 주식'})).toContainText('₩450,000');
 await expect(page.getByRole('region',{name:'해외 주식'})).toContainText('US$2,300.00');
 await page.screenshot({path:testInfo.outputPath('investments.png'),fullPage:true,animations:'disabled'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await enterInvestments(page);
 await expect(appleCard).toContainText('US$2,300.00');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state.investments.length)).toBe(2);
 expect(errors).toEqual([]);
});
test('monthly snapshot carry-forward and percentage point comparison preserve history',async({page})=>{
 await page.clock.setFixedTime(now);
 await page.addInitScript(()=>{
  localStorage.setItem('rich-grandma-tycoon-v1',JSON.stringify({version:1,state:{investments:[{invId:'prev',yearMonth:'2026-09',tickerName:'Apple Inc.',ticker:'AAPL',currency:'USD',quantity:10,purchasePrice:200,investedPrincipal:2000,currentValuation:2100,lastPrice:210,quoteTime:'2026-09-30T20:00:00Z',fetchedAt:'2026-09-30T21:00:00Z',valuationSource:'market'}]}}));
 });
 await page.route(/\/api\/index\?action=finance-quote&ticker=/,route=>{const u=new URL(route.request().url());const ticker=u.searchParams.get('ticker')!;return route.fulfill({json:{chart:{error:null,result:[{meta:{symbol:ticker,currency:ticker==='KRW=X'?'KRW':'USD',regularMarketPrice:ticker==='KRW=X'?1300:220,regularMarketTime:Math.floor(now.getTime()/1000)}}]}}});});
 await page.goto('/');await enterInvestments(page);
 await expect(page.getByRole('article').filter({hasText:'총 매수 원금'})).toContainText('₩2,600,000');
 await expect(page.getByRole('article').filter({hasText:'현재 총 평가금액'})).toContainText('₩2,860,000');
 await expect(page.getByRole('article').filter({hasText:'총 누적 수익률'})).toContainText('+5.00%p');
 await expect(page.getByRole('region',{name:'해외 주식'})).toContainText('전월 +5.00%p');
 await page.getByLabel('투자 조회 월').fill('2026-09');
 await expect(page.getByRole('button',{name:'시세 새로고침',exact:true})).toBeDisabled();
 const historical=page.getByRole('region',{name:'보유 투자 종목'}).getByRole('article');
 await expect(historical).toContainText('US$2,100.00');
 await expect(historical).toContainText('+5.00%');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state.investments.find((i:{yearMonth:string})=>i.yearMonth==='2026-09').currentValuation)).toBe(2100);
});
test('new holdings on API failure are explicitly unpriced until recovery',async({page})=>{
 await page.clock.setFixedTime(now);
 await page.route(/\/api\/index\?action=finance-quote&ticker=/,route=>route.fulfill({status:503,body:'unavailable'}));
 await page.goto('/');await enterInvestments(page);await addStock(page,'애플','2000','10');
 const card=page.getByRole('region',{name:'보유 투자 종목'}).getByRole('article');
 await expect(card).toContainText('시세 미확인');
 await expect(page.getByRole('article').filter({hasText:'총 누적 수익률'})).toContainText('—');
 await expect(page.getByRole('article').filter({hasText:'총 매수 원금'})).toContainText('—');
 await expect(page.getByText('환율을 조회하지 못해 원화 합계를 표시할 수 없어요.')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state.investments[0].currentValuation)).toBe(2000);
 await page.unroute(/\/api\/index\?action=finance-quote&ticker=/);
 await page.route(/\/api\/index\?action=finance-quote&ticker=/,route=>{const u=new URL(route.request().url());const ticker=u.searchParams.get('ticker')!;return route.fulfill({json:{chart:{error:null,result:[{meta:{symbol:ticker,currency:ticker==='KRW=X'?'KRW':'USD',regularMarketPrice:ticker==='KRW=X'?1300:210,regularMarketTime:Math.floor(now.getTime()/1000)}}]}}});});
 await page.getByRole('button',{name:'환율 다시 조회'}).click();
 await expect(page.getByRole('article').filter({hasText:'총 매수 원금'})).toContainText('₩2,600,000');
 await page.getByRole('button',{name:'시세 새로고침',exact:true}).click();
 await expect(card).toContainText('+5.00%');
 await expect(page.getByRole('article').filter({hasText:'현재 총 평가금액'})).toContainText('₩2,730,000');
 await expect(card).not.toContainText('시세 미확인');
});
