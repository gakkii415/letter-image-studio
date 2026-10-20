import {test,expect} from '@playwright/test';
const artifact=process.env.LETTERING_ARTIFACT_DIR||'test-results/screenshots';
async function ready(page){await expect(page.locator('#save-button')).toBeEnabled({timeout:30000});await expect(page.locator('#preview-image')).toBeVisible();}
test('workbench fits a compact iPhone viewport and exports opaque PNG',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await ready(page);
 for(const height of [852,700,600,520]){
  await page.setViewportSize({width:393,height});await page.waitForFunction(()=>Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--app-height'))-innerHeight)<1);
  const metrics=await page.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,save:document.querySelector('#save-button').getBoundingClientRect().bottom,preview:document.querySelector('#preview-stage').getBoundingClientRect().height}));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.height+1);expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);expect(metrics.save).toBeLessThanOrEqual(metrics.height);expect(metrics.preview).toBeGreaterThan(100);
 }
 await page.setViewportSize({width:393,height:700});await page.screenshot({path:`${artifact}/lettering-phone-${info.project.name}.png`});
 const rgba=await page.evaluate(()=>{const image=document.querySelector('#preview-image');const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext('2d');c.drawImage(image,0,0);return [...c.getImageData(0,0,1,1).data];});
 expect(rgba).toEqual([255,255,255,255]);expect(errors).toEqual([]);
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:`${artifact}/lettering-desktop-${info.project.name}.png`});
});
test('vertical columns use the same pitch and envelope across fonts',async({page})=>{
 await page.goto('/');await ready(page);
 const result=await page.evaluate(async()=>{
  const {buildImage}=await import('/renderer.js');
  const fonts=[{family:'KotoNotoSerif',weight:400},{family:'KotoNotoSans',weight:400}];
  const out=buildImage({text:'春の風。「京都」ー',fonts,size:44,tracking:.1,line:1.5,wrap:12,color:'#000000',mode:'both'});
  document.body.append(out.root);
  const groups=[...out.root.querySelectorAll('[data-orientation="vertical"]')];
  const data=groups.map(g=>({y:[...g.querySelectorAll('text')].map(t=>Number(t.getAttribute('y'))),pitch:Number(g.dataset.cellPitch),height:Number(g.dataset.logicalHeight),fontSizes:[...g.querySelectorAll('text')].map(t=>t.getAttribute('font-size'))}));
  const rootBounds={width:out.width,height:out.height};out.root.remove();
  return {data,rootBounds,measurements:document.querySelectorAll('[data-renderer-measurement]').length};
 });
 expect(result.data[0].y).toEqual(result.data[1].y);expect(result.data[0].height).toBe(result.data[1].height);
 for(const group of result.data){expect(group.pitch).toBeCloseTo(48.4);expect(group.fontSizes.every(v=>v==='44')).toBe(true);}
 expect(result.measurements).toBe(0);
});
test('script fonts are initially selectable and specimens use their actual family',async({page},info)=>{
 await page.goto('/');await ready(page);await page.locator('#text-input').fill('Stay true');await ready(page);
 await page.locator('#open-fonts').click();
 for(const [id,family] of [['alex-brush','Alex Brush'],['sacramento','Sacramento'],['italianno','Italianno'],['monsieur-la-doulaise','Monsieur La Doulaise'],['parisienne','Parisienne'],['pinyon-script','Pinyon Script']]){
  const row=page.locator(`[data-font-id="${id}"]`);await expect(row.locator('.font-sample')).toHaveAttribute('data-loaded','true',{timeout:30000});
  const face=await row.locator('.font-sample').evaluate(el=>getComputedStyle(el).fontFamily);expect(face.replaceAll('"','')).toBe(family);
 }
 await page.screenshot({path:`${artifact}/lettering-fonts-${info.project.name}.png`});
 await page.locator('[data-font-id="yu"] input').uncheck();await page.locator('[data-font-id="hira"] input').uncheck();
 await page.locator('[data-font-id="alex-brush"] input').check();await page.locator('[data-font-id="sacramento"] input').check();await page.locator('#close-fonts').click();await ready(page);
 await page.locator('#direction-horizontal').click();await ready(page);
 await page.screenshot({path:`${artifact}/lettering-script-${info.project.name}.png`});
 await page.locator('#save-button').click();await expect(page.locator('#save-dialog')).toBeVisible();
 const downloadPromise=page.waitForEvent('download');await page.locator('#download-button').click();const download=await downloadPromise;expect(download.suggestedFilename()).toMatch(/\.png$/);
});
test('clearing every selected font disables saving',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('#open-fonts').click();
 await page.locator('[data-font-id="yu"] input').uncheck();await page.locator('[data-font-id="hira"] input').uncheck();await page.locator('#close-fonts').click();
 await expect(page.locator('#save-button')).toBeDisabled();await expect(page.locator('#preview-empty')).toBeVisible();
});
test('punctuation, overhangs and negative spacing remain inside the exported bounds',async({page},info)=>{
 await page.goto('/');await ready(page);
 const boxes=await page.evaluate(async()=>{
  const {buildImage}=await import('/renderer.js');
  const output=buildImage({text:'言葉に、余白を。\n（京都）ー',fonts:[{family:'KotoNotoSerif',weight:400},{family:'KotoNotoSans',weight:400}],size:44,tracking:-.2,line:.8,wrap:12,color:'#000000',mode:'both'});
  document.body.append(output.root);
  const base=output.root.getCTM().inverse();
  const positions=[...output.root.querySelectorAll('text')].map(t=>{const b=t.getBBox(),m=base.multiply(t.getCTM());return [[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>new DOMPoint(x,y).matrixTransform(m)).map(p=>({x:p.x,y:p.y}));}).flat();
  const result={width:output.width,height:output.height,positions};output.root.remove();return result;
 });
 for(const p of boxes.positions){expect(p.x).toBeGreaterThanOrEqual(-.01);expect(p.y).toBeGreaterThanOrEqual(-.01);expect(p.x).toBeLessThanOrEqual(boxes.width+.01);expect(p.y).toBeLessThanOrEqual(boxes.height+.01);}
 await page.locator('#text-input').fill('言葉に、余白を。');await ready(page);await page.screenshot({path:`${artifact}/lettering-spacing-${info.project.name}.png`});
});
test('a font file is retained across reloads and can replace a native-font slot',async({page})=>{
 await page.goto('/');await ready(page);await page.locator('#open-fonts').click();
 await page.locator('#font-file').setInputFiles({name:'YuMincho-Medium.woff2',mimeType:'font/woff2',buffer:await (await import('node:fs/promises')).readFile('assets/fonts/noto-serif-jp.woff2')});
 await expect(page.locator('[data-font-id="yu"] .font-meta')).toBeEmpty();
 await page.locator('#close-fonts').click();await ready(page);await page.reload();await ready(page);await page.locator('#open-fonts').click();
 await expect(page.locator('[data-font-id="yu"]')).toHaveCount(1);await expect(page.locator('[data-font-id="yu"] .font-sample')).toHaveText('游明朝体 ミディアム');
});
test('missing local fonts cannot be mistaken for a default system face',async({page})=>{
 await page.goto('/');await ready(page);
 const detected=await page.evaluate(async()=>{const {detectFamily}=await import(document.querySelector('script[src*="app.js"]').src);return detectFamily(['__DefinitelyAbsentLetteringFont_81951__']);});
 expect(detected).toBeNull();
});
