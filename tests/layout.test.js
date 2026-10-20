import {test} from 'node:test';
import assert from 'node:assert/strict';
import {graphemes, stripOuterEmptyLines, wrapText, outputScale, unionBounds, escapeXML} from '../layout.js';
test('combining marks and joined emoji remain intact',()=>{
 assert.equal(graphemes('か\u3099👨‍👩‍👧‍👦春').length,3);
 assert.deepEqual(wrapText('か\u3099👨‍👩‍👧‍👦春',2),['か\u3099👨‍👩‍👧‍👦','春']);
});
test('Japanese wrapping preserves text, blank lines, and avoids a closing mark at line start',()=>{
 const input='春の風。「こんにちは」（京都）ーABC123、。！？\n\n次の行';
 const lines=wrapText(input,6);
 assert.equal(lines.join(''),input.replace(/\n/g,''));
 assert.ok(lines.includes(''));
 assert.ok(lines.every(s=>!s.startsWith('。')));
});
test('rendering ignores empty outer lines, including pasted CRLF, without reserving extra rows',()=>{
 for(const text of ['永遠','永遠\n\n','\n\n永遠','\n永遠\n\n','\r\n永遠\r\n\r\n']){
  assert.equal(stripOuterEmptyLines(text),'永遠');
  assert.deepEqual(wrapText(stripOuterEmptyLines(text)),['永遠']);
 }
 assert.equal(stripOuterEmptyLines('\r\n\n\r'),'');
});
test('rendering preserves internal empty lines, spaces and indentation',()=>{
 assert.deepEqual(wrapText(stripOuterEmptyLines('\n永遠\n\n京都\n\n')),['永遠','','京都']);
 assert.equal(stripOuterEmptyLines('\n  永遠　\n'),'  永遠　');
 assert.equal(stripOuterEmptyLines(' \n永遠\n '),' \n永遠\n ');
 assert.equal(stripOuterEmptyLines('\n永遠\n  京都\n'),'永遠\n  京都');
});
test('all sizes fit the export dimension and area budget',()=>{
 for(const [w,h] of [[100,100],[30000,1200],[3000,10000],[500,30000]]){
  const s=outputScale(w,h);
  assert.ok(w*s<=16384+1e-7 && h*s<=16384+1e-7);
  assert.ok(w*h*s*s<=12000001);
 }
});
test('ink bounds include negative bearings and overhangs',()=>{
 assert.deepEqual(unionBounds([{x:-9,y:-30,width:55,height:40},{x:60,y:5,width:55,height:50}]),{x:-9,y:-30,width:124,height:85});
});
test('user text is always encoded as SVG text',()=>assert.equal(escapeXML('<script>&"'), '&lt;script&gt;&amp;&quot;'));
