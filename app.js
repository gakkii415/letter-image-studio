import {initColorPicker} from './color.js?c=78302e9170';
import {graphemes, outputScale} from './layout.js';
import {buildImage, embedImageFonts} from './renderer.js?c=55c1a21ae6';
const $ = id => document.getElementById(id);
const CATALOG = [
 {id:'alex-brush',label:'Alex Brush',family:'Alex Brush',file:'alex-brush.woff2',latin:true},
 {id:'sacramento',label:'Sacramento',family:'Sacramento',file:'sacramento.woff2',latin:true},
 {id:'italianno',label:'Italianno',family:'Italianno',file:'italianno.woff2',latin:true},
 {id:'monsieur-la-doulaise',label:'Monsieur La Doulaise',family:'Monsieur La Doulaise',file:'monsieur-la-doulaise.woff2',latin:true},
 {id:'parisienne',label:'Parisienne',family:'Parisienne',file:'parisienne.woff2',latin:true},
 {id:'pinyon-script',label:'Pinyon Script',family:'Pinyon Script',file:'pinyon-script.woff2',latin:true},
 {id:'noto-serif',label:'Noto Serif JP',family:'KotoNotoSerif',file:'noto-serif-jp.woff2'},
 {id:'noto-sans',label:'Noto Sans JP',family:'KotoNotoSans',file:'noto-sans-jp.woff2'},
 {id:'zen-maru',label:'Zen Maru Gothic',family:'KotoZenMaru',file:'zen-maru-gothic.woff2'},
 {id:'yuji',label:'Yuji Syuku',family:'KotoYuji',file:'yuji-syuku.woff2'}
];
const FILE_FONTS = ['Notera 2 Light', 'Notera 2 Thin', 'Notera', 'Stylish Calligraphy'];
const nativeFonts = [
 {id:'yu',label:'游明朝体 ミディアム',candidates:['YuMincho Medium','YuMincho-Medium','YuMincho','Yu Mincho'],fallback:'noto-serif',fallbackName:'Noto Serif JP',weight:500},
 {id:'hira',label:'ヒラギノ角ゴ W3',candidates:['Hiragino Kaku Gothic ProN','Hiragino Sans'],fallback:'noto-sans',fallbackName:'Noto Sans JP',weight:300},
 {id:'snell',label:'Snell Roundhand',candidates:['Snell Roundhand','SnellRoundhand'],weight:400}
];
const FONT_SIZE=44;
const DEFAULT = {text:'永遠',selected:['yu','hira'],tracking:0,line:1.5,wrap:12,color:'#000000'};
let state={...DEFAULT}, fonts=[...nativeFonts,...CATALOG.map(font=>({...font,builtin:true}))], db, renderId=0, renderFrame=0, persistTimer, readyFile, previewURL, toastTimer, customCounter=0;
let currentImage, currentFonts=[], fitNext=true, activeControl='tracking', exportTask;
const camera={zoom:1,x:0,y:0}, fontData=new WeakMap();
const loaded=new Map(), loading=new Map();
function toast(message){ $('toast').textContent=message; $('toast').hidden=false; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>{$('toast').classList.remove('visible');$('toast').hidden=true;},4000); }
function saveState(){try{localStorage.setItem('kotonoha-settings-v1',JSON.stringify(state));}catch{}}
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('kotonoha-fonts',1);r.onupgradeneeded=()=>r.result.createObjectStore('fonts',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function dbRequest(action,value){return new Promise((resolve,reject)=>{if(!db)return reject(new Error('保存機能が利用できません'));const tx=db.transaction('fonts',action==='all'?'readonly':'readwrite'),store=tx.objectStore('fonts');let r=action==='all'?store.getAll():action==='delete'?store.delete(value):store.put(value);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function detectFamily(candidates){
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
 const sample='永国あ漢Wm012345 Snell';
 for(const family of candidates){
  try{
   const probe=new FontFace('LetteringLocalProbe',`local("${family}")`);
   await probe.load();
   // Some engines resolve an absent local face to a default font. Compare it
   // with another absent name in the same fallback stack, rather than a generic.
   const distinct=['monospace','serif'].some(base=>{
    context.font=`72px "__LetteringMissingFont_94731__",${base}`;
    const fallback=context.measureText(sample).width;
    context.font=`72px "${family}",${base}`;
    return Math.abs(context.measureText(sample).width-fallback)>.01;
   });
   if(distinct)return family;
  }catch{}
 }
 return null;
}
function base64(buffer){let result='';const bytes=new Uint8Array(buffer);for(let i=0;i<bytes.length;i+=32768)result+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(result);}
async function registerFace(font,bytes){const face=new FontFace(font.family,bytes,{weight:'400',style:'normal'});await face.load();document.fonts.add(face);const signature=String.fromCharCode(...new Uint8Array(bytes).subarray(0,4));const mime=signature==='wOF2'?'font/woff2':signature==='wOFF'?'font/woff':signature==='OTTO'?'font/otf':'font/ttf';const item={...font,bytes,mime,face};loaded.set(font.id,item);return item;}
async function loadCatalog(id){if(loaded.has(id))return loaded.get(id);if(loading.has(id))return loading.get(id);const task=(async()=>{const font=CATALOG.find(f=>f.id===id);if(!font)throw new Error('フォントが見つかりません');const r=await fetch(`assets/fonts/${font.file}`);if(!r.ok)throw new Error('フォントの読み込みに失敗しました');return registerFace(font,await r.arrayBuffer());})();loading.set(id,task);try{return await task;}finally{loading.delete(id);}}
async function resolveFont(font){if(font.candidates){if(font.systemFamily)return {family:font.systemFamily,weight:font.weight};if(!font.fallback)throw new Error(`${font.label}のファイルを追加してください`);const fallback=await loadCatalog(font.fallback);return {...fallback,weight:400};}return {...(loaded.get(font.id)||await loadCatalog(font.id)),weight:400};}
function setSelections(id,checked){if(checked&&state.selected.length>=8){toast('同時に選べるフォントは8種類です');drawFontList();return;}state.selected=checked?[...state.selected,id]:state.selected.filter(x=>x!==id);queueRender(true);}
function fontPreview(font) {
 if(font.systemFamily)return {family:font.systemFamily,weight:font.weight};
 return loaded.get(font.fallback||font.id);
}
function drawFontList(){
 const parent=$('font-list');parent.replaceChildren();
 fonts.forEach(font=>{
  const row=document.createElement('div');row.className='font-row';row.dataset.fontId=font.id;
  const label=document.createElement('label');label.className='font-choice';
  const input=document.createElement('input');input.type='checkbox';input.checked=state.selected.includes(font.id);input.setAttribute('aria-label',font.label);
  const missing=font.candidates&&!font.systemFamily&&!font.fallback;
  input.disabled=!!missing;input.addEventListener('change',()=>setSelections(font.id,input.checked));
  const copy=document.createElement('span');copy.className='font-copy';
  const sample=document.createElement('span');sample.className='font-sample';
  const preview=fontPreview(font);
  sample.textContent=preview?(font.candidates&&!font.systemFamily?font.fallbackName:font.label):missing?font.label:'…';
  if(preview){sample.style.fontFamily=`"${preview.family}"`;sample.style.fontWeight=preview.weight||400;sample.dataset.loaded='true';}
  else sample.classList.add('font-pending');
  const meta=document.createElement('span');meta.className='font-meta';
  meta.textContent=missing?'ファイル未追加':!preview?`${font.label} · 読込中`:font.candidates&&!font.systemFamily?`${font.label}の代替`:'';
  copy.append(sample,meta);label.append(input,copy);row.append(label);
  if(missing){const add=document.createElement('button');add.type='button';add.className='font-file-add';add.textContent='追加';add.addEventListener('click',()=>$('font-file').click());row.append(add);}
  if(font.custom){const del=document.createElement('button');del.type='button';del.className='font-remove';del.setAttribute('aria-label',`${font.label}を削除`);del.textContent='×';del.addEventListener('click',async()=>{fonts=fonts.filter(x=>x.id!==font.id);state.selected=state.selected.filter(x=>x!==font.id);try{await dbRequest('delete',font.id);}catch{}const cached=loaded.get(font.id);if(cached){document.fonts.delete(cached.face);loaded.delete(font.id);}const native=nativeFonts.find(f=>f.id===font.id);if(native)fonts.unshift(native);drawFontList();queueRender(true);});row.append(del);}
  parent.append(row);
 });
 for(const name of FILE_FONTS){
  const key=name.toLowerCase().replaceAll(' ','');
  if(fonts.some(f=>f.custom&&f.label.toLowerCase().replaceAll(' ','').includes(key)))continue;
  const row=document.createElement('button');row.type='button';row.className='file-font-row';
  const label=document.createElement('span');label.textContent=name;
  const action=document.createElement('small');action.textContent='ファイルを追加';row.append(label,action);
  row.addEventListener('click',()=>$('font-file').click());parent.append(row);
 }
}
function refreshFontSamples(){
 for(const font of fonts){
  const row=$('font-list').querySelector(`[data-font-id="${font.id}"]`),preview=fontPreview(font);
  if(!row||!preview)continue;
  const sample=row.querySelector('.font-sample');sample.textContent=font.candidates&&!font.systemFamily?font.fallbackName:font.label;sample.style.fontFamily=`"${preview.family}"`;sample.style.fontWeight=preview.weight||400;sample.classList.remove('font-pending');sample.dataset.loaded='true';
  row.querySelector('.font-meta').textContent=font.candidates&&!font.systemFamily?`${font.label}の代替`:'';
 }
}
function updateCatalog(){ $('catalog-list').replaceChildren(); }
async function openFonts(){
 $('font-dialog').showModal();drawFontList();
 await Promise.allSettled(CATALOG.map(async font=>{try{await loadCatalog(font.id);}catch{}refreshFontSamples();}));
 await Promise.allSettled(nativeFonts.filter(f=>f.fallback).map(resolveFont));
 refreshFontSamples();
}
function importIdentity(name){
 if(/notera.*2.*light/i.test(name))return {id:'file-notera-light',label:'Notera 2 Light'};
 if(/notera.*2.*thin/i.test(name))return {id:'file-notera-thin',label:'Notera 2 Thin'};
 if(/notera/i.test(name))return {id:'file-notera',label:'Notera'};
 if(/stylish.*calligraphy/i.test(name))return {id:'file-stylish',label:'Stylish Calligraphy'};
 if(/snell/i.test(name))return {id:'snell',label:'Snell Roundhand'};
 if(/yu.?mincho|游明朝/i.test(name))return {id:'yu',label:'游明朝体 ミディアム'};
 if(/hiragino.*(kaku|sans)|ヒラギノ角/i.test(name))return {id:'hira',label:'ヒラギノ角ゴ W3'};
 return null;
}
async function importBytes(bytes,name){if(bytes.byteLength>24*1024*1024)throw new Error('24MB以下のフォントファイルを選んでください');if(bytes.byteLength<100)throw new Error('フォントファイルを確認してください');const identity=importIdentity(name),serial=customCounter++;const id=identity?.id||`custom-${Date.now()}-${serial}`;const font={id,label:identity?.label||name.replace(/\.(ttf|otf|woff2?)$/i,'').slice(0,80)||'追加フォント',family:`KotoCustom${Date.now()}${serial}`,custom:true};const previousFace=loaded.get(id)?.face;try{await registerFace(font,bytes);if(previousFace)document.fonts.delete(previousFace);}catch{throw new Error('読み込めないファイルです。ZIPは解凍し、TTF・OTF・WOFF・WOFF2を追加してください。');}const record={...font,bytes};const existing=fonts.findIndex(f=>f.id===id);if(existing>=0)fonts[existing]=record;else fonts.push(record);if(state.selected.length<8&&!state.selected.includes(id))state.selected.push(id);let persistent=true;try{await dbRequest('put',record);}catch{persistent=false;}drawFontList();queueRender(true);$('font-import-status').textContent=persistent?`${font.label}を追加しました。`: `${font.label}を追加しました。このブラウザでは再読込すると消えます。`;}
function syncUI(){for(const key of ['tracking','line','wrap'])$(key==='line'?'line-input':`${key}-input`).value=state[key];$('text-input').value=state.text;updateValues();drawFontList();updateCatalog();}
const CONTROL={tracking:{min:-.2,max:.8,step:.025,unit:'em',label:'字間'},line:{min:.8,max:2.4,step:.05,unit:'倍',label:'行間'}};
function updateValues(){
 $('char-count').textContent=`${graphemes(state.text).length}/160`;
 $('open-fonts').textContent=`書体 ${state.selected.length}`;
 $('tracking-value').textContent=`${state.tracking>0?'+':''}${Number(state.tracking).toFixed(3)}em`;
 $('line-value').textContent=`${Number(state.line).toFixed(2)}倍`;
 $('wrap-value').textContent=`${state.wrap}文字`;
 $('color-open-value').textContent=state.color.toUpperCase();
 $('color-open-chip').style.backgroundColor=state.color;
 if(CONTROL[activeControl]&&document.activeElement!==$('control-number'))$('control-number').value=state[activeControl];
}
function selectControl(key){
 activeControl=key;
 document.querySelectorAll('[data-control]').forEach(b=>{const active=b.dataset.control===key;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1;b.classList.toggle('is-active',active);});
 document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==key);
 const config=CONTROL[key];
 if(config){for(const prop of ['min','max','step'])$('control-number')[prop]=config[prop];$('control-number').value=state[key];$('control-number').setAttribute('aria-label',`${config.label}を数値で指定`);$('control-unit').textContent=config.unit;}
}
function adjustControl(value){
 const config=CONTROL[activeControl];if(!config||!Number.isFinite(value))return;
 state[activeControl]=Number(Math.max(config.min,Math.min(config.max,Math.round(value/config.step)*config.step)).toFixed(3));
 $(`${activeControl}-input`).value=state[activeControl];queueRender();
}
function queueRender(fit=false){
 clearTimeout(persistTimer);persistTimer=setTimeout(saveState,300);
 updateValues();readyFile=null;renderId++;fitNext ||= fit;
 if(!renderFrame)renderFrame=requestAnimationFrame(()=>{renderFrame=0;render(renderId);});
}
function layout(resolved,wrap){return buildImage({text:state.text,fonts:resolved,size:FONT_SIZE,tracking:state.tracking,line:state.line,wrap,color:state.color,mode:'both',embedFonts:false});}
function availableFont(font){
 if(font.systemFamily)return {family:font.systemFamily,weight:font.weight};
 const cached=loaded.get(font.fallback||font.id);return cached?{...cached,weight:400}:null;
}
function showEmpty(message){currentImage=null;$('live-preview').replaceChildren();$('preview-guides')?.remove();$('preview-empty').hidden=false;$('preview-empty').textContent=message;$('save-button').disabled=true;$('image-dimensions').textContent='—';}
function render(id){
 if(id!==renderId)return;
 if(!state.text.trim()||!state.selected.length){showEmpty(state.selected.length?'文字を入力':'書体を選択');$('render-status').textContent='';return;}
 try{
  const selected=state.selected.map(id=>fonts.find(f=>f.id===id)).filter(Boolean);
  if(/[\u3040-\u30ff\u3400-\u9fff]/u.test(state.text)&&selected.some(f=>f.latin))throw new Error('英字書体は日本語に対応していません');
  const resolved=selected.map(availableFont);
  if(resolved.some(f=>!f)){
   $('save-button').disabled=true;$('render-status').textContent='書体を読込中…';
   Promise.all(selected.map(resolveFont)).then(()=>{if(id===renderId)queueRender(true);}).catch(error=>{if(id===renderId){showEmpty(error.message);$('render-status').textContent='';}});return;
  }
  const start=performance.now();
  let result=layout(resolved,state.wrap),autoWrap=false;
  if(outputScale(result.width,result.height)*FONT_SIZE<24){for(let w=state.wrap+1;w<=32;w++){const candidate=layout(resolved,w);if(outputScale(candidate.width,candidate.height)>outputScale(result.width,result.height)){result=candidate;autoWrap=true;}if(outputScale(result.width,result.height)*FONT_SIZE>=24)break;}}
  if(outputScale(result.width,result.height)*FONT_SIZE<24)throw new Error('改行・行間・選択書体を減らしてください');
  currentImage=result;currentFonts=resolved;
  result.root.setAttribute('role','img');result.root.setAttribute('aria-label',`${state.text}の文字画像`);
  $('live-preview').replaceChildren(result.root);drawGuides(result);$('live-preview').dataset.revision=id;
  $('preview-empty').hidden=true;
  if(fitNext){fitCamera();fitNext=false;}else applyCamera();
  const scale=outputScale(result.width,result.height);
  $('image-dimensions').textContent=`${Math.floor(result.width*scale).toLocaleString()} × ${Math.floor(result.height*scale).toLocaleString()} px`;
  $('render-status').textContent=autoWrap?`${result.wrap}文字で折り返し`:'';
  $('save-button').disabled=false;
  $('live-preview').dataset.paintMs=(performance.now()-start).toFixed(2);
 }catch(error){showEmpty(error.message);$('render-status').textContent='';}
}
function drawGuides(result){
 $('preview-guides')?.remove();
 const NS='http://www.w3.org/2000/svg',overlay=document.createElementNS(NS,'svg');
 overlay.id='preview-guides';overlay.setAttribute('aria-hidden','true');
 for(const [key,value] of Object.entries({width:result.width,height:result.height,viewBox:`0 0 ${result.width} ${result.height}`}))overlay.setAttribute(key,value);
 for(const direction of ['horizontal','vertical']){
  const boxes=result.groupBounds.filter(b=>b.orientation===direction);
  for(let i=1;i<boxes.length;i++){
   const a=boxes[i-1],b=boxes[i],vertical=direction==='vertical',line=document.createElementNS(NS,'line');
   const midpoint=vertical?(a.x+b.x+b.width)/2:(a.y+a.height+b.y)/2;
   const left=Math.min(a.x,b.x)-FONT_SIZE*.12,right=Math.max(a.x+a.width,b.x+b.width)+FONT_SIZE*.12;
   const top=Math.min(a.y,b.y)-FONT_SIZE*.12,bottom=Math.max(a.y+a.height,b.y+b.height)+FONT_SIZE*.12;
   for(const [key,value] of Object.entries({x1:vertical?midpoint:left,y1:vertical?top:midpoint,x2:vertical?midpoint:right,y2:vertical?bottom:midpoint,stroke:'#d0d0d0','stroke-width':1,'stroke-dasharray':'3 4','vector-effect':'non-scaling-stroke','data-group-divider':direction}))line.setAttribute(key,value);
   overlay.append(line);
  }
 }
 $('preview-transform').append(overlay);
}
function applyCamera(){
 if(!currentImage)return;
 $('preview-transform').style.transform=`translate(${camera.x-currentImage.width*camera.zoom/2}px,${camera.y-currentImage.height*camera.zoom/2}px) scale(${camera.zoom})`;
}
function fitCamera(){
 if(!currentImage)return;
 const stage=$('preview-stage').getBoundingClientRect();
 camera.zoom=Math.max(.01,Math.min(4,(stage.width-32)/currentImage.width,(stage.height-60)/currentImage.height));camera.x=0;camera.y=-10;applyCamera();
}
async function svgToPNG(result){const scale=outputScale(result.width,result.height);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(result.width*scale));canvas.height=Math.max(1,Math.floor(result.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像を作成できませんでした。もう一度お試しください。');result.root.setAttribute('width',canvas.width);result.root.setAttribute('height',canvas.height);const svg=new XMLSerializer().serializeToString(result.root);const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('画像の描画に失敗しました。フォントを変更してお試しください。'));img.src=url;});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('画像が大きすぎます。文字数かフォント数を減らしてください。');return {blob,width:canvas.width,height:canvas.height,scale};}finally{URL.revokeObjectURL(url);canvas.width=1;canvas.height=1;}}
async function prepareSave(){
 if(renderFrame){cancelAnimationFrame(renderFrame);renderFrame=0;render(renderId);}
 if(!currentImage)return;
 if(!$('save-dialog').open)$('save-dialog').showModal();
 if(readyFile){$('saved-image').src=previewURL;return;}
 $('saved-image').hidden=true;$('save-status').textContent='PNGを作成中…';$('share-button').disabled=true;$('download-button').disabled=true;
 if(exportTask){await exportTask;if($('save-dialog').open&&!readyFile&&currentImage)return prepareSave();return;}
 const id=renderId,snapshot={...currentImage,root:currentImage.root.cloneNode(true)},selectedFonts=currentFonts;
 exportTask=(async()=>{
  // Let the modal paint first. Encoding is reserved for this explicit export.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const embedded=selectedFonts.map(font=>{if(!font.bytes)return font;let data=fontData.get(font.bytes);if(!data){data=base64(font.bytes);fontData.set(font.bytes,data);}return {...font,data};});
  embedImageFonts(snapshot.root,embedded);
  const png=await svgToPNG(snapshot);
  if(id!==renderId)return;
  const oldURL=previewURL;previewURL=URL.createObjectURL(png.blob);
  readyFile=new File([png.blob],`lettering-${new Date().toISOString().slice(0,10)}.png`,{type:'image/png'});
  $('saved-image').src=previewURL;$('saved-image').hidden=false;
  $('save-status').textContent='';$('share-button').disabled=false;$('download-button').disabled=false;
  const shareable=!!(navigator.share&&navigator.canShare?.({files:[readyFile]}));
  $('share-button').hidden=!shareable;
  if(oldURL)URL.revokeObjectURL(oldURL);
 })().catch(error=>{$('save-status').textContent=error.message;}).finally(()=>{exportTask=null;});
 await exportTask;
}
$('text-input').maxLength=800;
$('text-input').addEventListener('input',event=>{const chars=graphemes(event.target.value);state.text=chars.slice(0,160).join('');if(!event.isComposing)event.target.value=state.text;queueRender(true);});
$('text-input').addEventListener('compositionend',event=>{state.text=graphemes(event.target.value).slice(0,160).join('');event.target.value=state.text;queueRender(true);});
for(const key of ['tracking','line','wrap'])$(`${key}-input`).addEventListener('input',event=>{state[key]=Number(event.target.value);queueRender(key==='wrap');});
$('open-fonts').addEventListener('click',openFonts);$('close-fonts').addEventListener('click',()=>$('font-dialog').close());$('close-save').addEventListener('click',()=>$('save-dialog').close());
for(const dialog of [$('font-dialog'),$('save-dialog')])dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
$('font-file').addEventListener('change',async event=>{const files=[...event.target.files];$('font-import-status').textContent='フォントを読み込んでいます…';for(const file of files){try{if(file.size>24*1024*1024)throw new Error('24MB以下のフォントファイルを選んでください');await importBytes(await file.arrayBuffer(),file.name);}catch(error){$('font-import-status').textContent=error.message;}}event.target.value='';});
async function readFontResponse(response){if(!response.body){const bytes=await response.arrayBuffer();if(bytes.byteLength>24*1024*1024)throw new Error('24MB以下のフォントを指定してください');return bytes;}const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>24*1024*1024){await reader.cancel();throw new Error('24MB以下のフォントを指定してください');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes.buffer;}
$('import-url').addEventListener('click',async()=>{const button=$('import-url');button.disabled=true;$('font-import-status').textContent='フォントを読み込んでいます…';try{const url=new URL($('font-url').value);if(!['https:','http:'].includes(url.protocol))throw new Error('HTTPまたはHTTPSのURLを入力してください');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw new Error('フォントを取得できません');const length=Number(r.headers.get('content-length'));if(length>24*1024*1024)throw new Error('24MB以下のフォントを指定してください');const bytes=await readFontResponse(r);await importBytes(bytes,decodeURIComponent(url.pathname.split('/').pop()||'追加フォント'));}finally{clearTimeout(timeout);}$('font-url').value='';}catch{$('font-import-status').textContent='このURLから追加できません。フォントファイルをダウンロードし、「ファイルから追加」で選んでください。';}finally{button.disabled=false;}});
document.querySelectorAll('[data-control]').forEach(button=>{
 button.addEventListener('click',()=>selectControl(button.dataset.control));
 button.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const tabs=[...document.querySelectorAll('[data-control]')],i=tabs.indexOf(button);const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs.at(-1):tabs[(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length];selectControl(next.dataset.control);next.focus();});
});
$('step-down').addEventListener('click',()=>adjustControl(state[activeControl]-CONTROL[activeControl].step));
$('step-up').addEventListener('click',()=>adjustControl(state[activeControl]+CONTROL[activeControl].step));
$('control-number').addEventListener('input',event=>{if(event.target.value!=='')adjustControl(event.target.valueAsNumber);});
$('control-number').addEventListener('change',()=>{$('control-number').value=state[activeControl];});
$('toggle-preview').addEventListener('click',fitCamera);
const pointers=new Map();let gesture;
function startGesture(){
 const points=[...pointers.values()];
 gesture=points.length>1?{type:'pinch',distance:Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),cx:(points[0].x+points[1].x)/2,cy:(points[0].y+points[1].y)/2,...camera}:{type:'pan',px:points[0]?.x,py:points[0]?.y,...camera};
}
$('preview-stage').addEventListener('pointerdown',event=>{if(!currentImage)return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});event.currentTarget.setPointerCapture(event.pointerId);startGesture();});
$('preview-stage').addEventListener('pointermove',event=>{
 if(!pointers.has(event.pointerId))return;pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});const points=[...pointers.values()];
 if(points.length>1&&gesture.type==='pinch'){
  const distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),cx=(points[0].x+points[1].x)/2,cy=(points[0].y+points[1].y)/2;
  camera.zoom=Math.max(.02,Math.min(8,gesture.zoom*distance/Math.max(1,gesture.distance)));
  const rect=$('preview-stage').getBoundingClientRect(),ratio=camera.zoom/gesture.zoom;
  camera.x=cx-(rect.left+rect.width/2)-(gesture.cx-(rect.left+rect.width/2)-gesture.x)*ratio;
  camera.y=cy-(rect.top+rect.height/2)-(gesture.cy-(rect.top+rect.height/2)-gesture.y)*ratio;
 }else{camera.x=gesture.x+points[0].x-gesture.px;camera.y=gesture.y+points[0].y-gesture.py;}
 applyCamera();
});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('preview-stage').addEventListener(type,event=>{pointers.delete(event.pointerId);if(pointers.size)startGesture();});
$('save-button').addEventListener('click',prepareSave);
$('share-button').addEventListener('click',()=>{if(!readyFile)return;navigator.share?.({files:[readyFile]}).catch(error=>{if(error.name!=='AbortError')$('save-status').textContent='画像を長押しして保存してください';});});
$('download-button').addEventListener('click',()=>{if(!readyFile)return;const link=document.createElement('a');link.href=previewURL;link.download=readyFile.name;link.click();toast('PNG画像をダウンロードします');});
async function init(){try{const saved=JSON.parse(localStorage.getItem('kotonoha-settings-v1')||'null');if(saved){state.text=typeof saved.text==='string'?graphemes(saved.text).slice(0,160).join(''):DEFAULT.text;for(const [key,min,max] of [['tracking',-.2,.8],['line',.8,2.4],['wrap',6,24]])if(Number.isFinite(saved[key]))state[key]=Math.min(max,Math.max(min,saved[key]));if(/^#[0-9a-f]{6}$/i.test(saved.color))state.color=saved.color;if(Array.isArray(saved.selected))state.selected=saved.selected.filter(x=>typeof x==='string').slice(0,8);}}catch{}
 await Promise.all(nativeFonts.map(async font=>{font.systemFamily=await detectFamily(font.candidates);}));
 try{db=await openDB();const records=await dbRequest('all');for(const record of records){if(CATALOG.some(f=>f.id===record.id))continue;try{await registerFace(record,record.bytes);const existing=fonts.findIndex(f=>f.id===record.id);if(existing>=0)fonts[existing]=record;else fonts.push(record);}catch{}}}catch{}
 state.selected=state.selected.filter(id=>fonts.some(f=>f.id===id&&(f.systemFamily||f.fallback||!f.candidates)));syncUI();selectControl('tracking');queueRender(true);
}
function updateViewport(){
 const viewport=window.visualViewport;
 const height=viewport?.height||window.innerHeight;
 document.documentElement.style.setProperty('--app-height',`${height}px`);
 document.body.classList.toggle('keyboard-open',['text-input','control-number'].includes(document.activeElement?.id)&&height<window.innerHeight*.78);
}
window.visualViewport?.addEventListener('resize',updateViewport);
window.addEventListener('resize',updateViewport);
new ResizeObserver(()=>{if(currentImage)fitCamera();}).observe($('preview-stage'));
window.addEventListener('pagehide',saveState);
for(const id of ['text-input','control-number']){
 $(id).addEventListener('focus',updateViewport);
 $(id).addEventListener('blur',()=>setTimeout(updateViewport,100));
}
initColorPicker({getColor:()=>state.color,onChange:color=>{state.color=color;queueRender();}});
updateViewport();
init();
