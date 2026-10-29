import { test, expect, type Page, type Route } from '@playwright/test';

const api = '**/api/index?action=ai-receipt';
const response = (data: unknown) => ({status:'SUCCESS',data});
const form = (page: Page) => page.getByRole('dialog',{name:'가계부 기록하기',exact:true});
const sheet = (page: Page) => page.getByRole('dialog',{name:'영수증 캡처로 입력하기',exact:true});
const snapshot = (page: Page) => page.evaluate(()=>JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1') ?? '{"state":{"transactions":[],"xpLogs":[]}}').state);
async function open(page: Page) {
  await page.goto('/');
  if (page.viewportSize()!.width < 768) await page.getByRole('navigation',{name:'하단 탭'}).getByRole('button',{name:'캘린더',exact:true}).click();
  else await page.getByRole('navigation',{name:'메인 메뉴'}).getByRole('button',{name:/^캘린더/}).click();
  await page.getByLabel('선택 날짜',{exact:true}).fill('2026-10-22');
  await page.getByRole('button',{name:'기록하기',exact:true}).click();
}
async function fixture(page: Page) {
  const data = await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=1000;
    const context=canvas.getContext('2d')!;context.fillStyle='white';context.fillRect(0,0,1600,1000);
    context.fillStyle='black';context.font='48px sans-serif';context.fillText('Receipt 12,500 KRW',100,200);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return {name:'receipt.png',mimeType:'image/png',buffer:Buffer.from(data,'base64')};
}
async function choose(page: Page) {
  await form(page).getByRole('button',{name:'영수증 캡처로 입력하기',exact:true}).click();
  await sheet(page).getByLabel('결제 이미지 선택',{exact:true}).setInputFiles(await fixture(page));
}

test('upload automatically fills editable fields using a resized JPEG; save alone awards XP',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let sent:{mimeType:string;data:string}|undefined;
  await page.route(api,async route=>{
    sent={mimeType:'image/jpeg',data:route.request().postDataJSON().imageBase64};
    await route.fulfill({json:response({txDate:'2024-02-29',amount:12500,memo:'동네 식당',recommendedCodeId:'FO01'})});
  });
  await open(page);await choose(page);
  await expect(sheet(page)).not.toBeVisible();
  await expect(form(page).getByLabel('금액 (원)',{exact:true})).toHaveValue('12500');
  expect(sent?.mimeType).toBe('image/jpeg');
  const dimensions=await page.evaluate(async image=>{
    const img=new Image();img.src=`data:${image.mimeType};base64,${image.data}`;await img.decode();
    return [img.naturalWidth,img.naturalHeight];
  },sent!);
  expect(dimensions).toEqual([800,500]);
  expect((await snapshot(page)).transactions).toHaveLength(0);
  expect((await snapshot(page)).xpLogs).toHaveLength(0);
  await expect(form(page).getByLabel('날짜',{exact:true})).toHaveValue('2024-02-29');
  await expect(form(page).getByLabel('구분',{exact:true})).toHaveValue('EXPENSE');
  await expect(form(page).getByLabel('카테고리',{exact:true})).toHaveValue('FO01');
  await form(page).screenshot({path:testInfo.outputPath('receipt-autofill.png')});
  await form(page).getByLabel('금액 (원)',{exact:true}).fill('12000');
  await form(page).getByLabel('메모').fill('확인한 점심');
  await form(page).getByRole('button',{name:'기록 저장',exact:true}).click();
  const state=await snapshot(page);
  expect(state.transactions).toHaveLength(1);expect(state.xpLogs).toHaveLength(1);
  expect(state.transactions[0]).toMatchObject({txDate:'2024-02-29',amount:12000,memo:'확인한 점심',type:'EXPENSE',codeId:'FO01'});
  expect(state.xpLogs[0].referencePeriod).toBe('2024-02-29');
  await page.reload();expect((await snapshot(page)).transactions).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('partial amount preserves draft date and memo and requires a real budget selection',async({page})=>{
  await page.route(api,route=>route.fulfill({json:{status:'PARTIAL',data:{amount:8900}}}));
  await open(page);
  await form(page).getByLabel('메모').fill('이미 적은 메모');
  await form(page).getByLabel('구분',{exact:true}).selectOption('INCOME');
  await choose(page);await expect(sheet(page)).not.toBeVisible();
  await expect(form(page).getByRole('status')).toContainText('직접 확인해 주세요');
  await expect(form(page).getByLabel('날짜',{exact:true})).toHaveValue('2026-10-22');
  await expect(form(page).getByLabel('메모')).toHaveValue('이미 적은 메모');
  await expect(form(page).getByLabel('금액 (원)',{exact:true})).toHaveValue('8900');
  await expect(form(page).getByLabel('카테고리',{exact:true})).toHaveValue('');
  await form(page).getByRole('button',{name:'기록 저장',exact:true}).click();
  await expect(form(page)).toBeVisible();expect((await snapshot(page)).transactions).toHaveLength(0);
  await form(page).getByLabel('카테고리',{exact:true}).selectOption('SH01');
  await form(page).getByRole('button',{name:'기록 저장',exact:true}).click();
  expect((await snapshot(page)).transactions[0].codeId).toBe('SH01');
});

test('failed recognition and quota error offer retry/manual input without clearing drafts',async({page},testInfo)=>{
  let calls=0;
  await page.route(api,route=>{calls++;return calls===1 ? route.fulfill({json:{status:'FAILED',errorMessage:'결제 금액을 읽지 못했어요.'}}) : route.fulfill({status:429,json:{error:'Gemini 무료 사용량이 잠시 부족해요.'}});});
  await open(page);await form(page).getByLabel('금액 (원)',{exact:true}).fill('7000');
  await choose(page);
  await expect(sheet(page).getByRole('alert')).toContainText('금액을 읽지 못했어요');
  await sheet(page).getByRole('button',{name:'다시 읽기',exact:true}).click();
  await expect(sheet(page).getByRole('alert')).toContainText('사용량');
  await sheet(page).screenshot({path:testInfo.outputPath('receipt-failed.png')});
  await sheet(page).getByRole('button',{name:'직접 입력하기',exact:true}).click();
  await expect(form(page).getByLabel('금액 (원)',{exact:true})).toHaveValue('7000');
  expect((await snapshot(page)).transactions).toHaveLength(0);expect((await snapshot(page)).xpLogs).toHaveLength(0);
  await form(page).getByRole('button',{name:'기록 저장',exact:true}).click();
  expect((await snapshot(page)).transactions[0].amount).toBe(7000);
});

test('cancelling recognition ignores late response; Escape only closes sheet',async({page})=>{
  let pending:Route|undefined;
  await page.route(api,route=>{pending=route;});
  await open(page);await form(page).getByLabel('메모').fill('보존할 메모');
  await choose(page);await expect.poll(()=>Boolean(pending)).toBe(true);
  await expect(sheet(page).getByRole('status')).toContainText('영수증을 꼼꼼히 읽고 있어요...');
  await page.keyboard.press('Escape');
  await expect(sheet(page)).not.toBeVisible();await expect(form(page)).toBeVisible();
  await pending!.fulfill({json:response({amount:9999,memo:'늦은 결과',recommendedCodeId:'FO01'})}).catch(()=>{});
  await expect(form(page).getByLabel('금액 (원)',{exact:true})).toHaveValue('');
  await expect(form(page).getByLabel('메모')).toHaveValue('보존할 메모');
  expect((await snapshot(page)).xpLogs).toHaveLength(0);
});

test('invalid and corrupt uploads stay local; leisure maps to the existing category',async({page})=>{
  let calls=0;
  await page.route(api,route=>{calls++;return route.fulfill({json:response({amount:15000,memo:'영화관',txDate:'2026-10-22',recommendedCodeId:'CU01'})});});
  await open(page);await form(page).getByRole('button',{name:'영수증 캡처로 입력하기',exact:true}).click();
  const input=sheet(page).getByLabel('결제 이미지 선택',{exact:true});
  await expect(input).toHaveAttribute('accept','image/*');
  await input.setInputFiles({name:'photo.heic',mimeType:'image/heic',buffer:Buffer.from('test')});
  await expect(sheet(page).getByRole('alert')).toContainText('JPG');expect(calls).toBe(0);
  await input.setInputFiles({name:'broken.png',mimeType:'image/png',buffer:Buffer.from([137,80,78,71,13,10,26,10,0])});
  await expect(sheet(page).getByRole('alert')).toContainText('사진을 열지 못했어요');expect(calls).toBe(0);
  await input.setInputFiles(await fixture(page));
  await expect(sheet(page)).not.toBeVisible();
  await expect(form(page).getByLabel('카테고리',{exact:true})).toHaveValue('LE01');
});

test('real Canvas keeps aspect ratio, avoids upscaling, and composites transparency on white',async({page})=>{
  await page.goto('/');
  const results=await page.evaluate(async()=>{
    const modulePath='/src/utils/receiptParser.ts';
    const {resizeReceiptImage}=await import(modulePath);
    const output=[];
    for(const [width,height] of [[400,1000],[1600,3200],[800,400]]) {
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const blob=await new Promise<Blob>(resolve=>canvas.toBlob(value=>resolve(value!),'image/png'));
      const resized=await resizeReceiptImage(blob);
      const img=new Image();img.src=`data:${resized.mimeType};base64,${resized.data}`;await img.decode();
      const pixel=document.createElement('canvas');pixel.width=1;pixel.height=1;
      const context=pixel.getContext('2d')!;context.drawImage(img,0,0);
      output.push({width:img.naturalWidth,height:img.naturalHeight,pixel:[...context.getImageData(0,0,1,1).data]});
    }
    return output;
  });
  expect(results).toEqual([
    {width:400,height:1000,pixel:[255,255,255,255]},
    {width:800,height:1600,pixel:[255,255,255,255]},
    {width:800,height:400,pixel:[255,255,255,255]},
  ]);
});
