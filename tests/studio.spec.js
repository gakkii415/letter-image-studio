import {test,expect} from '@playwright/test';
const artifact=process.env.LETTERING_ARTIFACT_DIR||'test-results/screenshots';
async function ready(page){
 await expect(page.locator('#live-preview > svg')).toBeVisible({timeout:30000});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
 await expect(page.locator('#save-button')).toBeEnabled({timeout:30000});
}
async function exportPNG(page){
 await page.locator('#save-button').click();
 await expect(page.locator('#save-dialog')).toBeVisible();
 await expect(page.locator('#saved-image')).toBeVisible({timeout:30000});
 await page.waitForFunction(()=>{const image=document.querySelector('#saved-image');return image.complete&&image.naturalWidth>0;},{},{timeout:30000});
 await expect(page.locator('#download-button')).toBeEnabled();
}
test('workbench fits a compact iPhone viewport and exports opaque PNG',async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');await ready(page);
 for(const height of [852,700,600,520]){
  await page.setViewportSize({width:393,height});await page.waitForFunction(()=>Math.abs(parseFloat(document.documentElement.style.getPropertyValue('--app-height'))-innerHeight)<1);
  const metrics=await page.evaluate(()=>({height:innerHeight,scroll:document.documentElement.scrollHeight,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,save:document.querySelector('#save-button').getBoundingClientRect().bottom,preview:document.querySelector('#preview-stage').getBoundingClientRect().height}));
  expect(metrics.scroll).toBeLessThanOrEqual(metrics.height+1);expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);expect(metrics.save).toBeLessThanOrEqual(metrics.height);expect(metrics.preview).toBeGreaterThan(100);
 }
 await page.setViewportSize({width:393,height:700});await page.screenshot({path:`${artifact}/lettering-phone-${info.project.name}.png`});
 const liveBefore=await page.locator('#live-preview > svg').evaluate(svg=>({width:svg.getAttribute('width'),height:svg.getAttribute('height')}));
 const guideSample=await page.locator('#preview-guides line[data-group-divider="horizontal"]').evaluate(line=>({x:(Number(line.getAttribute('x1'))+Number(line.getAttribute('x2')))/2,y:Number(line.getAttribute('y1'))}));
 await page.evaluate(()=>{const OriginalBlob=window.Blob;window.__exportSVG='';window.Blob=class extends OriginalBlob{constructor(parts,options){super(parts,options);if(options?.type?.startsWith('image/svg+xml'))window.__exportSVG=parts.join('');}};});
 await exportPNG(page);
 const rgba=await page.evaluate(({guide,width,height})=>{const image=document.querySelector('#saved-image');const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const c=canvas.getContext('2d');c.drawImage(image,0,0);return {corner:[...c.getImageData(0,0,1,1).data],divider:[...c.getImageData(Math.floor(guide.x*canvas.width/Number(width)),Math.floor(guide.y*canvas.height/Number(height)),1,1).data]};},{guide:guideSample,...liveBefore});
 expect(rgba.corner).toEqual([255,255,255,255]);expect(rgba.divider).toEqual([255,255,255,255]);expect(errors).toEqual([]);
 expect(await page.locator('#live-preview > svg').evaluate(svg=>({width:svg.getAttribute('width'),height:svg.getAttribute('height')}))).toEqual(liveBefore);
 await expect(page.locator('#live-preview style')).toHaveCount(0);
 const serialized=await page.evaluate(()=>window.__exportSVG);
 expect(serialized).not.toContain('preview-guides');expect(serialized).not.toContain('data-group-divider');
 await page.locator('#close-save').click();
 await page.setViewportSize({width:1280,height:900});await page.screenshot({path:`${artifact}/lettering-desktop-${info.project.name}.png`});
});
test('both writing directions remain enabled and the input sits above the three adjustment tabs',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('kotonoha-settings-v1',JSON.stringify({text:'永遠',selected:['yu','hira'],size:72,mode:'horizontal',tracking:0,line:1.5,wrap:12,color:'#000000'})));
 await page.goto('/');await ready(page);
 await expect(page.locator('#live-preview [data-orientation="horizontal"]')).toHaveCount(2);
 await expect(page.locator('#live-preview [data-orientation="vertical"]')).toHaveCount(2);
 expect(await page.locator('#live-preview text').evaluateAll(nodes=>nodes.every(node=>node.getAttribute('font-size')==='44'))).toBe(true);
 await expect(page.locator('[data-mode],#size-input,#tab-size,#zoom-in,#zoom-out')).toHaveCount(0);
 await expect(page.locator('[role="tab"]')).toHaveCount(3);
 await expect(page.locator('.text-input-label')).toBeVisible();await expect(page.locator('.text-input-label')).toHaveText('文字入力');
 const placement=await page.evaluate(()=>{
  const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height};};
  return {input:rect('#text-input'),bar:rect('.text-bar'),canvas:rect('.canvas-area'),controls:rect('#controls')};
 });
 expect(placement.input.height).toBeGreaterThanOrEqual(45);
 expect(placement.bar.top).toBeGreaterThanOrEqual(placement.canvas.bottom-1);
 expect(placement.bar.bottom).toBeLessThanOrEqual(placement.controls.top+1);
 expect(placement.controls.top-placement.bar.bottom).toBeLessThan(20);
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
test('font specimens have a separate gap and preview dividers never enter the output SVG',async({page})=>{
 await page.goto('/');await ready(page);
 const layouts=await page.evaluate(async()=>{
  const {buildImage}=await import('/renderer.js');
  const fonts=[{family:'KotoNotoSerif',weight:400},{family:'KotoNotoSans',weight:400}];
  const results=[];
  for(const line of [.8,1.5,2.4]){
   const out=buildImage({text:'永遠',fonts,size:44,tracking:.6,line,wrap:12,color:'#000000',mode:'both',embedFonts:false});
   const single=buildImage({text:'永遠',fonts:fonts.slice(0,1),size:44,tracking:.6,line,wrap:12,color:'#000000',mode:'both',embedFonts:false});
   results.push({line,groups:out.groupBounds,width:out.width,height:out.height,single:{width:single.width,height:single.height}});
  }
  return results;
 });
 for(const layout of layouts){
  const horizontal=layout.groups.filter(g=>g.orientation==='horizontal'),vertical=layout.groups.filter(g=>g.orientation==='vertical');
  const gap=44*(.9+Math.max(0,layout.line-.8)*.5);
  expect(horizontal[1].y-horizontal[0].y-horizontal[0].height).toBeCloseTo(gap,5);
  expect(vertical[0].x-vertical[1].x-vertical[1].width).toBeCloseTo(gap,5);
  expect(gap).toBeGreaterThanOrEqual(44*.9);
  for(const g of layout.groups){expect(g.x).toBeGreaterThanOrEqual(0);expect(g.y).toBeGreaterThanOrEqual(0);expect(g.x+g.width).toBeLessThanOrEqual(layout.width+.01);expect(g.y+g.height).toBeLessThanOrEqual(layout.height+.01);}
  expect(layout.single).toEqual(layouts[0].single);
 }
 await expect(page.locator('#preview-guides line[data-group-divider="horizontal"]')).toHaveCount(1);
 await expect(page.locator('#preview-guides line[data-group-divider="vertical"]')).toHaveCount(1);
 await expect(page.locator('#live-preview [data-group-divider]')).toHaveCount(0);
 const before=await page.locator('#preview-guides line[data-group-divider="horizontal"]').getAttribute('y1');
 await page.locator('#tab-line').click();await page.locator('#control-number').fill('2.4');await ready(page);
 const after=await page.locator('#preview-guides line[data-group-divider="horizontal"]').getAttribute('y1');
 expect(Number(after)).toBeGreaterThan(Number(before));
 await page.locator('#open-fonts').click();await page.locator('[data-font-id="hira"] input').uncheck();await page.locator('#close-fonts').click();await ready(page);
 await expect(page.locator('#preview-guides [data-group-divider]')).toHaveCount(0);
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
 await expect(page.locator('#live-preview [data-orientation="horizontal"]')).toHaveCount(2);
 await expect(page.locator('#live-preview [data-orientation="vertical"]')).toHaveCount(2);
 await page.screenshot({path:`${artifact}/lettering-script-${info.project.name}.png`});
 await exportPNG(page);
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

test('parameter input updates the live SVG on the next frame without PNG encoding',async({page},info)=>{
 await page.goto('/');await ready(page);
 await page.locator('#text-input').fill('春の風あいうえおかき');await ready(page);
 await page.evaluate(()=>{
  window.__encodingCounts={urls:0,blobs:0};
  const createURL=URL.createObjectURL,toBlob=HTMLCanvasElement.prototype.toBlob;
  URL.createObjectURL=function(...args){window.__encodingCounts.urls++;return createURL.apply(this,args);};
  HTMLCanvasElement.prototype.toBlob=function(...args){window.__encodingCounts.blobs++;return toBlob.apply(this,args);};
 });
 const frames=await page.evaluate(async()=>{
  const samples=[];
  for(let index=0;index<40;index++){
   const tracking=index===39?.6:Number(((index%41-8)*.025).toFixed(3));
   const live=document.querySelector('#live-preview'),before=Number(live.dataset.revision);
   const range=document.querySelector('#tracking-input');range.value=String(tracking);range.dispatchEvent(new Event('input',{bubbles:true}));
   await new Promise(resolve=>requestAnimationFrame(resolve));
   samples.push({before,revision:Number(live.dataset.revision),tracking,pitch:Number(live.querySelector('[data-orientation="vertical"]').dataset.cellPitch),size:live.querySelector('text').getAttribute('font-size'),paintMs:Number(live.dataset.paintMs)});
  }
  return samples;
 });
 expect(frames).toHaveLength(40);
 for(const frame of frames){
  expect(frame.revision).toBeGreaterThan(frame.before);expect(frame.size).toBe('44');expect(frame.pitch).toBeCloseTo(44*(1+frame.tracking));
  expect(Number.isFinite(frame.paintMs)).toBe(true);
 }
 await info.attach('live-frame-times',{body:JSON.stringify(frames,null,2),contentType:'application/json'});
 await page.locator('#tab-tracking').click();
 const tracking=await page.evaluate(async()=>{
  const live=document.querySelector('#live-preview'),before=Number(live.dataset.revision),range=document.querySelector('#tracking-input');
  range.value='0.3';range.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(resolve=>requestAnimationFrame(resolve));
  return {before,revision:Number(live.dataset.revision),pitch:Number(live.querySelector('[data-orientation="vertical"]').dataset.cellPitch)};
 });
 expect(tracking.revision).toBeGreaterThan(tracking.before);expect(tracking.pitch).toBeCloseTo(57.2);
 await page.locator('#tab-line').click();
 await page.locator('#control-number').fill('1.8');await ready(page);
 expect(await page.locator('#live-preview [data-orientation="vertical"]').first().evaluate(g=>Number(g.dataset.linePitch))).toBeCloseTo(79.2);
 const composition=await page.evaluate(async()=>{
  const live=document.querySelector('#live-preview'),before=Number(live.dataset.revision),input=document.querySelector('#text-input');
  input.value='春の風か';input.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'か'}));
  await new Promise(resolve=>requestAnimationFrame(resolve));
  return {before,revision:Number(live.dataset.revision),label:live.querySelector('svg').getAttribute('aria-label')};
 });
 expect(composition.revision).toBeGreaterThan(composition.before);expect(composition.label).toContain('春の風か');
 await expect(page.locator('#live-preview style')).toHaveCount(0);
 expect(await page.locator('#live-preview > svg').evaluate(svg=>svg.outerHTML.includes('data:font/'))).toBe(false);
 expect(await page.evaluate(()=>window.__encodingCounts)).toEqual({urls:0,blobs:0});
});

test('tabs, numeric input and step buttons adjust the selected parameter',async({page})=>{
 await page.goto('/');await ready(page);
 await expect(page.locator('[role="tab"]')).toHaveCount(3);
 await expect(page.locator('#tab-tracking')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#panel-tracking')).toBeVisible();
 await expect(page.locator('#control-unit')).toHaveText('em');
 await page.locator('#step-up').click();await ready(page);await expect(page.locator('#tracking-input')).toHaveValue('0.025');
 await page.locator('#step-down').click();await ready(page);await expect(page.locator('#tracking-input')).toHaveValue('0');
 await page.locator('#control-number').fill('-0.15');await ready(page);await expect(page.locator('#tracking-input')).toHaveValue('-0.15');
 await page.locator('#tab-line').click();await expect(page.locator('#control-unit')).toHaveText('倍');
 await page.locator('#step-up').click();await ready(page);await expect(page.locator('#line-input')).toHaveValue('1.55');
 await page.locator('#control-number').fill('2');await ready(page);await expect(page.locator('#line-input')).toHaveValue('2');
 await page.locator('#tab-line').press('ArrowLeft');await expect(page.locator('#tab-tracking')).toBeFocused();await expect(page.locator('#tab-tracking')).toHaveAttribute('aria-selected','true');
 await expect(page.locator('#tab-color')).toBeVisible();
});

test('the full color picker supports HEX, hue, a color field and persistent recent colors',async({page},info)=>{
 await page.goto('/');await ready(page);
 await page.locator('#tab-color').click();await page.locator('#open-color').click();await expect(page.locator('#color-dialog')).toBeVisible();
 await page.locator('#hex-input').fill('#304f6e');await ready(page);
 await expect(page.locator('#live-preview text').first()).toHaveAttribute('fill','#304f6e');
 await page.locator('#hex-input').fill('#zzzzzz');
 await expect(page.locator('#live-preview text').first()).toHaveAttribute('fill','#304f6e');
 await page.locator('#hex-input').fill('#304f6e');
 await page.locator('#close-color').click();
 await expect(page.locator('#color-dialog')).toBeHidden();
 await expect(page.locator('#color-open-value')).toHaveText('#304F6E');
 await page.locator('#open-color').click();
 await page.locator('#hue-input').evaluate(input=>{input.value='180';input.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#hue-input').press('ArrowRight');await expect(page.locator('#hue-input')).toHaveValue('181');
 const field=await page.locator('#color-field').boundingBox();
 await page.mouse.click(field.x+field.width*.85,field.y+field.height*.2);
 await ready(page);
 const selected=(await page.locator('#hex-input').inputValue()).toLowerCase();expect(selected).toMatch(/^#[0-9a-f]{6}$/);expect(selected).not.toBe('#304f6e');
 await expect(page.locator('#live-preview text').first()).toHaveAttribute('fill',selected);
 await expect(page.locator('#color-thumb')).toBeVisible();
 await page.screenshot({path:`${artifact}/lettering-color-${info.project.name}.png`});
 await page.locator('#close-color').click();
 await page.waitForFunction(color=>JSON.parse(localStorage.getItem('kotonoha-settings-v1')||'null')?.color?.toLowerCase()===color,selected);
 await page.reload();await ready(page);await page.locator('#tab-color').click();await page.locator('#open-color').click();
 const recent=await page.locator('#recent-colors button').evaluateAll(nodes=>nodes.map(node=>({index:node.dataset.recentIndex,color:getComputedStyle(node).backgroundColor})));
 const previous=recent.find(color=>color.color==='rgb(48, 79, 110)');expect(previous).toBeTruthy();
 await page.locator(`#recent-colors button[data-recent-index="${previous.index}"]`).click();await ready(page);
 await expect(page.locator('#live-preview text').first()).toHaveAttribute('fill','#304f6e');
});

test('camera preserves zoom while adjusting spacing and supports fit and dragging',async({page},info)=>{
 await page.goto('/');await ready(page);
 const camera=()=>page.evaluate(()=>{
  const transform=new DOMMatrix(getComputedStyle(document.querySelector('#preview-transform')).transform),svg=document.querySelector('#live-preview > svg'),glyph=svg.querySelector('text').getBoundingClientRect(),stage=document.querySelector('#preview-stage').getBoundingClientRect();
  return {zoom:transform.a,x:transform.e,y:transform.f,glyphHeight:glyph.height,width:Number(svg.getAttribute('width')),height:Number(svg.getAttribute('height')),stage:{x:stage.x,y:stage.y,width:stage.width,height:stage.height}};
 });
 const before=await camera();await expect(page.locator('#control-number')).toHaveValue('0');
 await page.locator('#control-number').fill('0.6');await ready(page);const restored=await camera();
 expect(restored.zoom).toBeCloseTo(before.zoom,5);expect(Math.abs(restored.glyphHeight-before.glyphHeight)).toBeLessThan(.5);
 const start={x:restored.stage.x+restored.stage.width*.45,y:restored.stage.y+restored.stage.height*.35};
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+40,start.y+28,{steps:5});await page.mouse.up();
 const dragged=await camera();expect(dragged.x-restored.x).toBeCloseTo(40,0);expect(dragged.y-restored.y).toBeCloseTo(28,0);expect(dragged.zoom).toBeCloseTo(restored.zoom,5);
 await page.locator('#toggle-preview').click();const fitted=await camera();
 const expectedZoom=Math.max(.01,Math.min(4,(fitted.stage.width-32)/fitted.width,(fitted.stage.height-60)/fitted.height));
 expect(fitted.zoom).toBeCloseTo(expectedZoom,5);expect(fitted.x).toBeCloseTo(-fitted.width*expectedZoom/2,2);expect(fitted.y).toBeCloseTo(-10-fitted.height*expectedZoom/2,2);
 await page.screenshot({path:`${artifact}/lettering-camera-${info.project.name}.png`});
});
test('a trusted two-finger pinch zooms the preview without changing the shared font size',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','Playwright WebKit exposes taps, but no trusted multipoint-touch API. Pan and Fit are verified in both engines.');
 await page.goto('/');await ready(page);
 await page.evaluate(()=>{window.__touchPointers=[];document.querySelector('#preview-stage').addEventListener('pointerdown',event=>{if(event.pointerType==='touch')window.__touchPointers.push({id:event.pointerId,trusted:event.isTrusted});});});
 const measure=()=>page.evaluate(()=>{
  const svg=document.querySelector('#live-preview > svg'),t=new DOMMatrix(getComputedStyle(document.querySelector('#preview-transform')).transform),r=document.querySelector('#preview-stage').getBoundingClientRect();
  return {zoom:t.a,glyph:svg.querySelector('text').getBoundingClientRect().height,width:svg.getAttribute('width'),height:svg.getAttribute('height'),cx:r.x+r.width/2,cy:r.y+r.height*.4};
 });
 const before=await measure(),session=await context.newCDPSession(page);
 await session.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
 const points=distance=>[{id:1,x:before.cx-distance/2,y:before.cy},{id:2,x:before.cx+distance/2,y:before.cy}];
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points(60)});
 await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:points(120)});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
 const after=await measure();expect(after.zoom).toBeCloseTo(before.zoom*2,3);expect(after.glyph).toBeGreaterThan(before.glyph*1.9);
 expect(after.width).toBe(before.width);expect(after.height).toBe(before.height);
 expect(await page.locator('#live-preview text').evaluateAll(nodes=>nodes.every(t=>t.getAttribute('font-size')==='44'))).toBe(true);
 const pointers=await page.evaluate(()=>window.__touchPointers);expect(new Set(pointers.map(p=>p.id)).size).toBe(2);expect(pointers.every(p=>p.trusted)).toBe(true);
 await session.send('Emulation.setTouchEmulationEnabled',{enabled:false});await session.detach();
});
test('reopening save after changing an unfinished export uses the latest image',async({page})=>{
 await page.goto('/');await ready(page);
 await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;let calls=0;HTMLCanvasElement.prototype.toBlob=function(callback,...args){original.call(this,blob=>{if(++calls===1)window.releasePNG=()=>callback(blob);else callback(blob);},...args);};});
 await page.locator('#save-button').click();await page.waitForFunction(()=>typeof window.releasePNG==='function');
 await page.locator('#close-save').click();await page.locator('#control-number').fill('0.6');await page.locator('#control-number').press('Tab');
 expect(await page.locator('#live-preview [data-orientation="vertical"]').first().evaluate(g=>Number(g.dataset.cellPitch))).toBeCloseTo(70.4);
 await page.locator('#save-button').click();await page.evaluate(()=>window.releasePNG());
 await expect(page.locator('#saved-image')).toBeVisible();await expect(page.locator('#download-button')).toBeEnabled();
 await page.waitForFunction(()=>document.querySelector('#saved-image').complete&&document.querySelector('#saved-image').naturalWidth>0);
 const dimensions=await page.evaluate(()=>({expected:document.querySelector('#image-dimensions').textContent,actual:document.querySelector('#saved-image').naturalWidth}));
 expect(dimensions.expected).toMatch(new RegExp(`^${dimensions.actual.toLocaleString()} ×`));
});
