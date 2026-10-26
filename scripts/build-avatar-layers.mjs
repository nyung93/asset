// Crop the imagegen-produced alpha sheets into runtime sprites. No chroma key or white removal.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {chromium} from '@playwright/test';

const root = new URL('../src/assets/avatar/layers/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('../src/data/avatar-layers.json', import.meta.url), 'utf8'));
await mkdir(new URL('sprites/', root), {recursive:true});
const browser = await chromium.launch({channel:'chrome', headless:true});
try {
  const page = await browser.newPage();
  const reports = [];
  for (const item of manifest) {
    const bytes = await readFile(new URL(`source/${item.source}.png`, root));
    const {png, ...report} = await page.evaluate(async ({url, item}) => {
      const img = new Image(); img.src = url; await img.decode();
      const [x,y,width,height] = item.rect;
      if (x < 0 || y < 0 || x + width > img.width || y + height > img.height) throw new Error(`Invalid crop: ${item.id}`);
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img,x,y,width,height,0,0,width,height);
      const pixels = ctx.getImageData(0,0,width,height);
      const {data} = pixels;
      // Keep the intended connected sprite if the crop touches a neighboring item.
      // Preserve antialiasing by retaining a two-pixel fringe around its alpha core.
      if (item.isolate) {
        const visited = new Uint8Array(width * height);
        let largest = [];
        const queue = new Int32Array(width * height);
        for (let seed=0;seed<visited.length;seed++) {
          if(visited[seed] || data[seed*4+3] < 32) continue;
          let head=0,tail=1; queue[0]=seed; visited[seed]=1;
          while(head<tail) {
            const p=queue[head++]; const px=p%width,py=Math.floor(p/width);
            for(const next of [px>0?p-1:-1,px<width-1?p+1:-1,py>0?p-width:-1,py<height-1?p+width:-1]) {
              if(next<0 || visited[next] || data[next*4+3]<32) continue;
              visited[next]=1; queue[tail++]=next;
            }
          }
          if(tail>largest.length) largest=Array.from(queue.subarray(0,tail));
        }
        const keep=new Uint8Array(width*height);
        for(const p of largest) {
          const px=p%width,py=Math.floor(p/width);
          for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++) {
            const nx=px+dx,ny=py+dy;
            if(nx>=0&&nx<width&&ny>=0&&ny<height) keep[ny*width+nx]=1;
          }
        }
        for(let p=0;p<keep.length;p++) if(!keep[p]) data[p*4+3]=0;
      }
      let transparent=0, visible=0;
      for(let p=3;p<data.length;p+=4) {
        // Discard only near-invisible encoding noise; keep translucent cheeks/edges.
        if(data[p]<=3) data[p]=0;
        if(data[p]===0) transparent++; else visible++;
      }
      if(!transparent || !visible) throw new Error(`Missing alpha or empty sprite: ${item.id}`);
      ctx.putImageData(pixels,0,0);
      return {png:canvas.toDataURL('image/png').split(',')[1], id:item.id, width,height,transparent,visible};
    }, {url:`data:image/png;base64,${bytes.toString('base64')}`, item});
    await writeFile(new URL(`sprites/${item.id}.png`, root),Buffer.from(png,'base64'));
    reports.push(report);
  }
  await writeFile(new URL('alpha-report.json',root),JSON.stringify(reports,null,2)+'\n');
  console.log(`Prepared ${reports.length} transparent sprites; alpha report written.`);
} finally {await browser.close();}
