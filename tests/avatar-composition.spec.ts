import {test,expect,type Locator} from '@playwright/test';

async function raster(avatar:Locator) {
  return avatar.evaluate(async node=>{
    const svg=node.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
    svg.setAttribute('width','400');svg.setAttribute('height','600');svg.removeAttribute('class');
    for(const image of svg.querySelectorAll('image')) {
      const blob=await fetch(image.getAttribute('href')!).then(r=>r.blob());
      const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(blob);});
      image.setAttribute('href',data);
    }
    const image=new Image();image.src=`data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=400;canvas.height=600;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
    const pixels=ctx.getImageData(0,0,400,600).data;
    let hash=2166136261,visible=0,transparent=0,white=0;
    for(let i=0;i<pixels.length;i++) hash=Math.imul(hash^pixels[i],16777619)>>>0;
    for(let p=0;p<pixels.length;p+=4) {
      if(pixels[p+3]===0) transparent++;else visible++;
      if(pixels[p+3]>200&&pixels[p]>220&&pixels[p+1]>220&&pixels[p+2]>200)white++;
    }
    const corners=[[0,0],[399,0],[0,599],[399,599]].map(([x,y])=>pixels[(y*400+x)*4+3]);
    return {hash,visible,transparent,white,corners,png:canvas.toDataURL('image/png')};
  });
}

test('transparent avatar responds visually to every selection and saves across app surfaces',async({page,context},info)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await page.getByRole('button',{name:'캐릭터 만들기',exact:true}).click();
  const dialog=page.getByRole('dialog');
  const tabs=dialog.getByRole('group',{name:'커스터마이징 파츠',exact:true});
  const avatar=page.getByTestId('character-preview');
  const gallery:{label:string;png:string}[]=[];
  const initial=(await avatar.getAttribute('data-avatar-config'))!;
  for(const [part,label,count] of [['hair','헤어',5],['outfit','의상',5],['faceExpression','표정',5],['headAccessory','머리 장식',3],['handAccessory','손 소품',4]] as const) {
    await tabs.getByRole('button',{name:label,exact:true}).click();
    const options=dialog.getByRole('group',{name:`${label} 옵션`,exact:true}).getByRole('button');
    await expect(options).toHaveCount(count);
    const hashes=new Set<number>();
    for(let index=0;index<count;index++) {
      await options.nth(index).click();
      await expect(options.nth(index)).toHaveAttribute('aria-pressed','true');
      const result=await raster(avatar);
      expect(result.corners).toEqual([0,0,0,0]);
      expect(result.transparent).toBeGreaterThan(85000);
      expect(result.visible).toBeGreaterThan(20000);
      hashes.add(result.hash);
      gallery.push({label:`${label} ${index+1}`,png:result.png});
    }
    expect(hashes.size,`${part} must actually change rendered pixels`).toBe(count);
  }
  // A head accessory and a held object coexist, rather than replacing one another.
  await expect(avatar.locator('[data-part="headAccessory"]')).toHaveAttribute('data-variant','3');
  await expect(avatar.locator('[data-part="handAccessory"]')).toHaveAttribute('data-variant','5');
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-avatar-config',initial);
  await dialog.getByRole('button',{name:'밤하늘 배경',exact:true}).click();
  await dialog.screenshot({path:info.outputPath('wardrobe-dark.png')});
  const final=(await avatar.getAttribute('data-avatar-config'))!;
  await dialog.getByRole('button',{name:'캐릭터 완성하기',exact:true}).click();
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-avatar-config',final);
  await page.reload();
  await expect(page.locator('.profile svg[data-avatar-config]')).toHaveAttribute('data-avatar-config',final);
  await page.locator('.bottom-nav').getByRole('button',{name:'캘린더',exact:true}).click();
  await expect(page.locator('.main-content svg[data-avatar-config]')).toHaveAttribute('data-avatar-config',final);
  await page.locator('.bottom-nav').getByRole('button',{name:'홈',exact:true}).click();
  await page.getByTestId('my-room').screenshot({path:info.outputPath('room-composed.png')});
  await page.getByRole('button',{name:'캐릭터 옷장',exact:true}).click();
  await dialog.getByRole('button',{name:'헤어 1: 긴 생머리',exact:true}).click();
  await dialog.getByRole('button',{name:'취소',exact:true}).click();
  await expect(page.getByTestId('room-avatar')).toHaveAttribute('data-avatar-config',final);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  const sheet=await context.newPage();await sheet.setViewportSize({width:1100,height:1400});
  await sheet.setContent(`<html><body style="margin:0;background:#ebefe6;font-family:sans-serif;display:grid;grid-template-columns:repeat(5,1fr);gap:10px;padding:16px">${gallery.map(item=>`<figure style="margin:0;text-align:center;border-radius:12px;background:#d9e2dc"><img src="${item.png}" style="height:230px;width:100%;object-fit:contain"><figcaption style="padding:8px">${item.label}</figcaption></figure>`).join('')}</body></html>`);
  await sheet.screenshot({path:info.outputPath('combinations.png'),fullPage:true});
  await sheet.close();
});
