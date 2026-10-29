import {test,expect,type Page} from '@playwright/test';

async function navigate(page:Page,name:string) {
  if (page.viewportSize()!.width<768) await page.getByRole('navigation',{name:'하단 탭'}).getByRole('button',{name,exact:true}).click();
  else await page.getByRole('navigation',{name:'메인 메뉴'}).getByRole('button',{name:new RegExp(`^${name}`)}).click();
}

test('category manager keeps codes internal and separates expense, income, saving and investment',async({page})=>{
  await page.goto('/');await navigate(page,'목표 & 설정');
  await expect(page.getByRole('heading',{name:'월 지출 예산'})).toBeVisible();
  await expect(page.getByText('1,450,000')).toBeVisible();
  await expect(page.getByText('FO01')).toHaveCount(0);
  await page.getByRole('button',{name:'카테고리 관리'}).click();
  const dialog=page.getByRole('dialog',{name:'카테고리 관리'});
  await expect(dialog).toContainText('식비');
  await expect(dialog).not.toContainText('FO01');
  await dialog.getByRole('button',{name:'카테고리 추가'}).click();
  await dialog.getByLabel('이름').fill('카페');
  await dialog.getByLabel('월 예산 한도 (원)').fill('50000');
  await dialog.getByRole('button',{name:'저장',exact:true}).click();
  await expect(dialog).toContainText('카페');
  await dialog.getByRole('tab',{name:'수입'}).click();
  await dialog.getByRole('button',{name:'카테고리 추가'}).click();
  await dialog.getByLabel('이름').fill('월급');
  await expect(dialog.getByLabel('월 예산 한도 (원)')).toHaveCount(0);
  await dialog.getByRole('button',{name:'저장',exact:true}).click();
  await dialog.getByRole('tab',{name:'저축'}).click();
  await dialog.getByRole('button',{name:'카테고리 추가'}).click();
  await dialog.getByLabel('이름').fill('적금');
  await dialog.getByRole('button',{name:'저장',exact:true}).click();
  await dialog.getByRole('tab',{name:'투자'}).click();
  await dialog.getByRole('button',{name:'카테고리 추가'}).click();
  await dialog.getByLabel('이름').fill('장기 투자');
  await dialog.getByRole('button',{name:'저장',exact:true}).click();
  await dialog.getByRole('button',{name:'닫기'}).click();
  await expect(page.getByText('1,500,000')).toBeVisible();
  const codes=await page.evaluate(()=>JSON.parse(localStorage.getItem('rich-grandma-tycoon-v1')!).state.budgetCodes);
  expect(codes.filter((code:{codeId:string})=>['EX0001','IN0001','SA0001','IV0001'].includes(code.codeId))).toHaveLength(4);

  await navigate(page,'캘린더');
  await page.getByRole('button',{name:'기록하기',exact:true}).click();
  const form=page.getByRole('dialog',{name:'가계부 기록하기'});
  await expect(form.getByLabel('카테고리')).toContainText('카페');
  await expect(form.getByLabel('카테고리')).not.toContainText('월급');
  await form.getByLabel('구분',{exact:true}).selectOption('INCOME');
  await expect(form.getByLabel('카테고리')).toContainText('월급');
  await expect(form.getByLabel('카테고리')).not.toContainText('카페');
  await form.getByLabel('구분',{exact:true}).selectOption('SAVING');
  await expect(form.getByLabel('카테고리')).toContainText('적금');
  await form.getByRole('button',{name:'닫기'}).click();
  await navigate(page,'투자');
  await page.getByRole('button',{name:'종목 추가',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'투자 종목 추가'}).getByLabel('투자 카테고리')).toContainText('장기 투자');
});
