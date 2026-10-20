import {graphemes, outputScale} from './layout.js';
import {buildImage} from './renderer.js';
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
const DEFAULT = {text:'永遠',selected:['yu','hira'],size:44,tracking:0,line:1.5,wrap:12,color:'#000000',mode:'both'};
let state={...DEFAULT}, fonts=[...nativeFonts,...CATALOG.map(font=>({...font,builtin:true}))], db, renderId=0, renderTimer, readyFile, previewURL, toastTimer, customCounter=0;
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
async function registerFace(font,bytes){const face=new FontFace(font.family,bytes,{weight:'400',style:'normal'});await face.load();document.fonts.add(face);const signature=String.fromCharCode(...new Uint8Array(bytes).subarray(0,4));const mime=signature==='wOF2'?'font/woff2':signature==='wOFF'?'font/woff':signature==='OTTO'?'font/otf':'font/ttf';const item={...font,bytes,data:base64(bytes),mime,face};loaded.set(font.id,item);return item;}
async function loadCatalog(id){if(loaded.has(id))return loaded.get(id);if(loading.has(id))return loading.get(id);const task=(async()=>{const font=CATALOG.find(f=>f.id===id);if(!font)throw new Error('フォントが見つかりません');const r=await fetch(`assets/fonts/${font.file}`);if(!r.ok)throw new Error('フォントの読み込みに失敗しました');return registerFace(font,await r.arrayBuffer());})();loading.set(id,task);try{return await task;}finally{loading.delete(id);}}
async function resolveFont(font){if(font.candidates){if(font.systemFamily)return {family:font.systemFamily,weight:font.weight};if(!font.fallback)throw new Error(`${font.label}のファイルを追加してください`);const fallback=await loadCatalog(font.fallback);return {...fallback,weight:400};}return {...(loaded.get(font.id)||await loadCatalog(font.id)),weight:400};}
function setSelections(id,checked){if(checked&&state.selected.length>=8){toast('同時に選べるフォントは8種類です');drawFontList();return;}state.selected=checked?[...state.selected,id]:state.selected.filter(x=>x!==id);queueRender();}
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
  if(font.custom){const del=document.createElement('button');del.type='button';del.className='font-remove';del.setAttribute('aria-label',`${font.label}を削除`);del.textContent='×';del.addEventListener('click',async()=>{fonts=fonts.filter(x=>x.id!==font.id);state.selected=state.selected.filter(x=>x!==font.id);try{await dbRequest('delete',font.id);}catch{}const cached=loaded.get(font.id);if(cached){document.fonts.delete(cached.face);loaded.delete(font.id);}const native=nativeFonts.find(f=>f.id===font.id);if(native)fonts.unshift(native);drawFontList();queueRender();});row.append(del);}
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
async function importBytes(bytes,name){if(bytes.byteLength>24*1024*1024)throw new Error('24MB以下のフォントファイルを選んでください');if(bytes.byteLength<100)throw new Error('フォントファイルを確認してください');const identity=importIdentity(name),serial=customCounter++;const id=identity?.id||`custom-${Date.now()}-${serial}`;const font={id,label:identity?.label||name.replace(/\.(ttf|otf|woff2?)$/i,'').slice(0,80)||'追加フォント',family:`KotoCustom${Date.now()}${serial}`,custom:true};const previousFace=loaded.get(id)?.face;try{await registerFace(font,bytes);if(previousFace)document.fonts.delete(previousFace);}catch{throw new Error('読み込めないファイルです。ZIPは解凍し、TTF・OTF・WOFF・WOFF2を追加してください。');}const record={...font,bytes};const existing=fonts.findIndex(f=>f.id===id);if(existing>=0)fonts[existing]=record;else fonts.push(record);if(state.selected.length<8&&!state.selected.includes(id))state.selected.push(id);let persistent=true;try{await dbRequest('put',record);}catch{persistent=false;}drawFontList();queueRender();$('font-import-status').textContent=persistent?`${font.label}を追加しました。`: `${font.label}を追加しました。このブラウザでは再読込すると消えます。`;}
function syncUI(){for(const key of ['size','tracking','line','wrap'])$(key==='line'?'line-input':`${key}-input`).value=state[key];$('text-input').value=state.text;$('color-input').value=state.color;updateValues();drawFontList();updateCatalog();}
function updateValues(){$('char-count').textContent=`${graphemes(state.text).length}/160`;$('open-fonts').textContent=`書体 ${state.selected.length}`;$('size-value').textContent=`${state.size}px`;$('tracking-value').textContent=`${state.tracking>0?'+':''}${Number(state.tracking).toFixed(2)}em`;$('line-value').textContent=`${Number(state.line).toFixed(2)}倍`;$('wrap-value').textContent=`${state.wrap}文字`;$('color-value').textContent=state.color.toUpperCase();document.querySelectorAll('[data-mode]').forEach(b=>{const active=b.dataset.mode===state.mode;b.setAttribute('aria-pressed',active);b.classList.toggle('is-active',active);});document.querySelectorAll('[data-color]').forEach(b=>{b.setAttribute('aria-pressed',b.dataset.color===state.color);b.classList.toggle('is-selected',b.dataset.color===state.color);});}
function queueRender(){saveState();updateValues();readyFile=null;$('save-button').disabled=true;$('download-button').disabled=true;$('render-status').textContent='作成中…';clearTimeout(renderTimer);renderId++;renderTimer=setTimeout(()=>render(renderId),180);}
function layout(resolved,wrap){return buildImage({text:state.text,fonts:resolved,size:state.size,tracking:state.tracking,line:state.line,wrap,color:state.color,mode:state.mode});}
async function svgToPNG(result){const scale=outputScale(result.width,result.height);const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.floor(result.width*scale));canvas.height=Math.max(1,Math.floor(result.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('画像を作成できませんでした。もう一度お試しください。');result.root.setAttribute('width',canvas.width);result.root.setAttribute('height',canvas.height);const svg=new XMLSerializer().serializeToString(result.root);const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml;charset=utf-8'}));try{const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('画像の描画に失敗しました。フォントを変更してお試しください。'));img.src=url;});ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('画像が大きすぎます。文字数かフォント数を減らしてください。');return {blob,width:canvas.width,height:canvas.height,scale};}finally{URL.revokeObjectURL(url);canvas.width=1;canvas.height=1;}}
async function render(id){if(!state.text.trim()||!state.selected.length){$('preview-image').hidden=true;$('preview-empty').hidden=false;$('preview-empty').textContent=state.selected.length?'画像にする文字を入力してください。':'フォントを1つ以上選んでください。';$('image-dimensions').textContent='—';$('render-status').textContent='';return;}try{const selected=state.selected.map(id=>fonts.find(f=>f.id===id)).filter(Boolean);if(/[\u3040-\u30ff\u3400-\u9fff]/u.test(state.text)&&selected.some(f=>f.latin))throw new Error('英字書体は日本語に対応していません');const resolved=await Promise.all(selected.map(resolveFont));if(id!==renderId)return;let result=layout(resolved,state.wrap);let autoWrap=false;if(outputScale(result.width,result.height)*state.size<24){for(let w=state.wrap+1;w<=32;w++){const candidate=layout(resolved,w);if(outputScale(candidate.width,candidate.height)>outputScale(result.width,result.height)){result=candidate;autoWrap=true;}if(outputScale(result.width,result.height)*state.size>=24)break;}}
 if(outputScale(result.width,result.height)*state.size<24)throw new Error('読みやすい文字サイズを保つため、改行・行間・選択フォントの数を減らしてください。');
 const png=await svgToPNG(result);if(id!==renderId)return;const nextURL=URL.createObjectURL(png.blob),oldURL=previewURL;previewURL=nextURL;$('preview-image').src=nextURL;$('preview-image').alt=`${selected.map(f=>f.label).join('、')}の${state.mode==='both'?'横書き・縦書き':state.mode==='horizontal'?'横書き':'縦書き'}文字画像`;$('preview-image').hidden=false;$('preview-empty').hidden=true;readyFile=new File([png.blob],`kotonoha-${new Date().toISOString().slice(0,10)}.png`,{type:'image/png'});$('image-dimensions').textContent=`${png.width.toLocaleString()} × ${png.height.toLocaleString()} px`;$('render-status').textContent=autoWrap?`読みやすさを保つため${result.wrap}文字で折り返しました`:'';$('save-button').disabled=false;$('download-button').disabled=false;if($('font-dialog').open)refreshFontSamples();if(oldURL)setTimeout(()=>URL.revokeObjectURL(oldURL),5000);
 }catch(error){if(id!==renderId)return;$('render-status').textContent=error.message;$('preview-image').hidden=true;$('preview-empty').hidden=false;$('preview-empty').textContent='画像を作れませんでした。設定を変更して再度お試しください。';}}
function showSaveImage(){if(!previewURL)return;$('saved-image').src=previewURL;$('save-dialog').showModal();}
$('text-input').maxLength=800;
$('text-input').addEventListener('input',event=>{if(event.isComposing)return;const chars=graphemes(event.target.value);state.text=chars.slice(0,160).join('');event.target.value=state.text;queueRender();});
$('text-input').addEventListener('compositionend',event=>{state.text=graphemes(event.target.value).slice(0,160).join('');event.target.value=state.text;queueRender();});
for(const key of ['size','tracking','line','wrap'])$(`${key}-input`).addEventListener('input',event=>{state[key]=Number(event.target.value);queueRender();});
$('color-input').addEventListener('input',event=>{state.color=event.target.value;queueRender();});
document.querySelectorAll('[data-color]').forEach(button=>button.addEventListener('click',()=>{state.color=button.dataset.color;$('color-input').value=state.color;queueRender();}));
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{state.mode=button.dataset.mode;queueRender();}));
$('open-fonts').addEventListener('click',openFonts);$('close-fonts').addEventListener('click',()=>$('font-dialog').close());$('close-save').addEventListener('click',()=>$('save-dialog').close());
for(const dialog of [$('font-dialog'),$('save-dialog')])dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}});
$('font-file').addEventListener('change',async event=>{const files=[...event.target.files];$('font-import-status').textContent='フォントを読み込んでいます…';for(const file of files){try{if(file.size>24*1024*1024)throw new Error('24MB以下のフォントファイルを選んでください');await importBytes(await file.arrayBuffer(),file.name);}catch(error){$('font-import-status').textContent=error.message;}}event.target.value='';});
async function readFontResponse(response){if(!response.body){const bytes=await response.arrayBuffer();if(bytes.byteLength>24*1024*1024)throw new Error('24MB以下のフォントを指定してください');return bytes;}const reader=response.body.getReader(),chunks=[];let total=0;try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>24*1024*1024){await reader.cancel();throw new Error('24MB以下のフォントを指定してください');}chunks.push(value);}}finally{reader.releaseLock();}const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes.buffer;}
$('import-url').addEventListener('click',async()=>{const button=$('import-url');button.disabled=true;$('font-import-status').textContent='フォントを読み込んでいます…';try{const url=new URL($('font-url').value);if(!['https:','http:'].includes(url.protocol))throw new Error('HTTPまたはHTTPSのURLを入力してください');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);try{const r=await fetch(url,{signal:controller.signal});if(!r.ok)throw new Error('フォントを取得できません');const length=Number(r.headers.get('content-length'));if(length>24*1024*1024)throw new Error('24MB以下のフォントを指定してください');const bytes=await readFontResponse(r);await importBytes(bytes,decodeURIComponent(url.pathname.split('/').pop()||'追加フォント'));}finally{clearTimeout(timeout);}$('font-url').value='';}catch{$('font-import-status').textContent='このURLから追加できません。フォントファイルをダウンロードし、「ファイルから追加」で選んでください。';}finally{button.disabled=false;}});
$('toggle-preview').addEventListener('click',()=>{const full=$('preview-stage').classList.toggle('actual-size');$('toggle-preview').textContent=full?'全体':'拡大';$('toggle-preview').setAttribute('aria-pressed',full);$('toggle-preview').setAttribute('aria-label',full?'プレビュー全体を表示':'プレビューを拡大して確認');});
$('save-button').addEventListener('click',()=>{if(!readyFile)return;if(navigator.canShare?.({files:[readyFile]})&&navigator.share){navigator.share({files:[readyFile]}).catch(error=>{if(error.name!=='AbortError')showSaveImage();});}else showSaveImage();});
$('download-button').addEventListener('click',()=>{if(!readyFile)return;const link=document.createElement('a');link.href=previewURL;link.download=readyFile.name;link.click();toast('PNG画像をダウンロードします');});
async function init(){try{const saved=JSON.parse(localStorage.getItem('kotonoha-settings-v1')||'null');if(saved){state.text=typeof saved.text==='string'?graphemes(saved.text).slice(0,160).join(''):DEFAULT.text;for(const [key,min,max] of [['size',28,72],['tracking',-.2,.8],['line',.8,2.4],['wrap',6,24]])if(Number.isFinite(saved[key]))state[key]=Math.min(max,Math.max(min,saved[key]));if(/^#[0-9a-f]{6}$/i.test(saved.color))state.color=saved.color;if(['both','horizontal','vertical'].includes(saved.mode))state.mode=saved.mode;if(Array.isArray(saved.selected))state.selected=saved.selected.filter(x=>typeof x==='string').slice(0,8);}}catch{}
 await Promise.all(nativeFonts.map(async font=>{font.systemFamily=await detectFamily(font.candidates);}));
 try{db=await openDB();const records=await dbRequest('all');for(const record of records){if(CATALOG.some(f=>f.id===record.id))continue;try{await registerFace(record,record.bytes);const existing=fonts.findIndex(f=>f.id===record.id);if(existing>=0)fonts[existing]=record;else fonts.push(record);}catch{}}}catch{}
 state.selected=state.selected.filter(id=>fonts.some(f=>f.id===id&&(f.systemFamily||f.fallback||!f.candidates)));syncUI();queueRender();
}
function updateViewport(){
 const viewport=window.visualViewport;
 const height=viewport?.height||window.innerHeight;
 document.documentElement.style.setProperty('--app-height',`${height}px`);
 document.body.classList.toggle('keyboard-open',document.activeElement?.id==='text-input'&&height<window.innerHeight*.78);
}
window.visualViewport?.addEventListener('resize',updateViewport);
window.addEventListener('resize',updateViewport);
$('text-input').addEventListener('focus',updateViewport);
$('text-input').addEventListener('blur',()=>setTimeout(updateViewport,100));
updateViewport();
init();
