import {test,expect} from '@playwright/test';

const choices=[
  ['default','리본 할미'],['saver','저축 지킴이'],['crying','눈물의 절약왕'],
  ['duck','오리 후드'],['pink','핑크 스마일'],
] as const;

test('five complete transparent characters can be chosen and remain consistent across the app',async({page},info)=>{
  await page.goto('/');
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-artwork','default');
  for(const [id,label] of choices) {
    await page.getByRole('button',{name:'캐릭터 고르기'}).click();
    const dialog=page.getByRole('dialog',{name:'캐릭터 고르기'});
    await expect(dialog.getByRole('group',{name:'캐릭터 선택'}).getByRole('button')).toHaveCount(5);
    await dialog.getByRole('button',{name:`${label} 선택`}).click();
    await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-artwork',id);
    await expect(page.locator('.profile svg[data-artwork]')).toHaveAttribute('data-artwork',id);
  }
  await page.getByTestId('my-room').screenshot({path:info.outputPath('room-pink.png')});
  await page.locator('.bottom-nav').getByRole('button',{name:'캘린더',exact:true}).click();
  await expect(page.locator('.main-content svg[data-artwork]')).toHaveAttribute('data-artwork','pink');
  await page.reload();
  await expect(page.locator('.profile svg[data-artwork]')).toHaveAttribute('data-artwork','pink');
  await page.locator('.bottom-nav').getByRole('button',{name:'홈',exact:true}).click();
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-artwork','pink');
  const transparency=await page.getByTestId('room-avatar').evaluate(async node=>{
    const source=node.querySelector('image')?.getAttribute('href');
    if(!source) return false;
    const image=new Image();image.src=source;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d')!;context.drawImage(image,0,0);
    return context.getImageData(0,0,1,1).data[3]===0;
  });
  expect(transparency).toBe(true);
});
