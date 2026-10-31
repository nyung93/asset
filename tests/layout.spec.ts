import {test,expect} from '@playwright/test';

test('mobile navigation keeps every main screen inside the viewport',async({page},testInfo)=>{
  test.skip(testInfo.project.name!=='mobile','Mobile viewport check');
  await page.goto('/');
  const navigation=page.getByRole('navigation',{name:'하단 탭'});
  for(const label of ['홈','캘린더','통계','투자','목표 & 설정']) {
    await navigation.getByRole('button',{name:label,exact:true}).click();
    await expect(page.locator('main.main-content')).toBeVisible();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
    expect(overflow,`${label} 화면이 모바일 폭을 넘었습니다.`).toBeLessThanOrEqual(1);
  }
});
