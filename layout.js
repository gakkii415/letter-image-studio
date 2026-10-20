export const graphemes = text => Array.from(new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text), x => x.segment);
const closing = /^[、。，．？！!?）」』】〕〉》〗〙〛：；ー〜…]/u;
const opening = /[（「『【〔〈《〖〘〚]$/u;
export function wrapText(text, limit = 12) {
  return text.replace(/\r\n?/g, '\n').split('\n').flatMap(paragraph => {
    const chars = graphemes(paragraph);
    if (!chars.length) return [''];
    const lines = [];
    while (chars.length) {
      let count = Math.min(limit, chars.length);
      if (count < chars.length && closing.test(chars[count])) count++;
      if (count > 1 && opening.test(chars[count - 1])) count--;
      lines.push(chars.splice(0, count).join(''));
    }
    return lines;
  });
}
export function outputScale(width, height, preferred = 2) {
  return Math.min(preferred, 16384 / width, 16384 / height, Math.sqrt(12_000_000 / (width * height)));
}
export function unionBounds(boxes) {
  if (!boxes.length) return {x:0,y:0,width:0,height:0};
  const x=Math.min(...boxes.map(b=>b.x)), y=Math.min(...boxes.map(b=>b.y));
  return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
}
export function escapeXML(text) {
  return text.replace(/[<>&"']/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
}
