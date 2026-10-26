import { test, expect, type Page } from '@playwright/test';
const now = new Date('2026-10-22T03:00:00Z');
const avatar = {hair:1,eyes:1,face:1,skin:1,top:1,bottom:1,shoes:1};
const character = {totalXp:0,level:1,currentXp:0,houseStage:1,avatar,isCustomized:false};
async function seed(page: Page, state: Record<string, unknown>, version = 2) {
  await page.evaluate(({state,version}) => localStorage.setItem('rich-grandma-tycoon-v1',JSON.stringify({state,version})), {state,version});
  await page.reload();
}

test('bonuses upgrade houses, animate level-up and remain claimed after reload', async ({page},testInfo) => {
  await page.clock.setFixedTime(now);await page.goto('/');
  await seed(page,{
    character:{...character,totalXp:450,level:5,currentXp:50},
    goals:[{year:2026,month:10,targetSavingAmount:1000,targetInvestReturnRate:5},{year:2026,month:0,targetSavingAmount:1000,targetInvestReturnRate:5}],
    transactions:[{txId:'s',txDate:'2026-10-22',type:'SAVING',codeId:'SAVING',amount:1000,memo:''}],
    investments:[{invId:'i',yearMonth:'2026-10',ticker:'AAPL',tickerName:'Apple',currency:'USD',quantity:10,purchasePrice:100,investedPrincipal:1000,currentValuation:1100,valuationSource:'market'}],
  });
  await page.getByRole('button',{name:'이번 달 예산 지킴이 XP 받기',exact:true}).click();
  await expect(page.getByTestId('my-room')).toHaveAttribute('data-stage','2');
  await expect(page.getByTestId('room-background')).toHaveAttribute('src',/room-stage-2\.png/);
  await expect(page.getByText('새 집으로 이사했어요! Lv.6',{exact:true})).toBeVisible();
  await expect(page.locator('.confetti-layer span')).toHaveCount(32);
  for(const title of ['차곡차곡 저축 달성','이번 달 투자 목표 달성','올해의 부자 습관 완성']) await page.getByRole('button',{name:`${title} XP 받기`,exact:true}).click();
  await expect(page.getByTestId('my-room')).toHaveAttribute('data-stage','3');
  await expect(page.getByTestId('room-background')).toHaveAttribute('src',/room-stage-3\.png/);
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-expression','happy');
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state);
  expect(state.character.totalXp).toBe(2000);expect(state.character.level).toBe(16);expect(state.xpLogs).toHaveLength(4);
  await page.reload();
  await expect(page.getByRole('button',{name:'올해의 부자 습관 완성 수령 완료',exact:true})).toBeDisabled();
  await expect(page.getByTestId('my-room')).toHaveAttribute('data-stage','3');
  await page.screenshot({path:testInfo.outputPath('home.png'),fullPage:true,animations:'disabled'});
});

test('every housing stage renders, including the mansion maximum and migration', async({page},testInfo)=>{
  await page.clock.setFixedTime(now);await page.goto('/');
  for(const [totalXp,stage] of [[0,1],[500,2],[2000,3],[5000,4],[10000,5]]) {
    await seed(page,{character:{...character,totalXp,avatar:{hair:3,eyes:5,face:5,skin:2,top:5,bottom:5,shoes:2}}});
    await expect(page.getByTestId('my-room')).toHaveAttribute('data-stage',String(stage));
    await expect(page.getByTestId('room-background')).toHaveAttribute('src',new RegExp(`room-stage-${stage}\\.png`));
    await expect(page.getByTestId('room-background')).toHaveJSProperty('naturalWidth',stage===1 ? 1408 : 1200);
    if(stage===5) await expect(page.getByRole('progressbar',{name:'다음 집 업그레이드 진행률'})).toHaveAttribute('aria-valuenow','100');
    await page.getByTestId('my-room').screenshot({path:testInfo.outputPath(`room-stage-${stage}.png`),animations:'disabled'});
  }
  await seed(page,{character:{...character,level:6,currentXp:0,isCustomized:true},xpLogs:[]},1);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state.character.totalXp)).toBe(1500);
  await expect(page.getByRole('heading',{name:'Lv.12채광 좋은 오피스텔',exact:true})).toBeVisible();
});

test('home reactions respond to ledger, XP and closed goals',async({page})=>{
  await page.clock.setFixedTime(now);await page.goto('/');
  const expense={txId:'e',txDate:'2026-10-22',type:'EXPENSE',codeId:'FO01',amount:500,memo:'점심'};
  const base={character,budgetCodes:[{codeId:'FO01',categoryName:'식비',monthlyLimit:1000}]};
  await seed(page,{...base,transactions:[expense]});
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-expression','neutral');
  await seed(page,{...base,transactions:[expense],xpLogs:[{logId:'d',earnedDate:'2026-10-22',rewardType:'DAILY_LOG',referencePeriod:'2026-10-22',xpAmount:10}]});
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-expression','happy');
  await seed(page,{...base,transactions:[{...expense,amount:1001}]});
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-expression','frowning');
  await expect(page.getByRole('button',{name:'이번 달 예산 지킴이 XP 받기',exact:true})).toBeDisabled();
  await seed(page,{...base,goals:[{year:2026,month:9,targetSavingAmount:1000,targetInvestReturnRate:5}]});
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-expression','crying');
  await seed(page,{...base,goals:[{year:2026,month:10,targetSavingAmount:1000,targetInvestReturnRate:5}]});
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-expression','neutral');
});
