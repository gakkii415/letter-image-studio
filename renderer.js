import {graphemes, wrapText, unionBounds} from './layout.js';

const NS = 'http://www.w3.org/2000/svg';
const XMLNS = 'http://www.w3.org/2000/xmlns/';

function element(name, attributes = {}) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

function cssString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\d ').replace(/\n/g, '\\a ');
}

function bounds(node) {
  const box = node.getBBox();
  return {x:box.x, y:box.y, width:box.width, height:box.height};
}

function moveBox(box, x, y) {
  return {...box, x:box.x + x, y:box.y + y};
}

function addLayoutBounds(group, box) {
  // A shared transparent envelope makes each font's layout dimensions equal,
  // while retaining ink that extends outside the nominal em cells.
  group.prepend(element('rect', {
    ...box, fill:'#ffffff', 'fill-opacity':0, stroke:'none',
    'pointer-events':'none', 'aria-hidden':'true', 'data-layout-bounds':'',
  }));
}

function createText(value, font, size, color) {
  const text = element('text', {
    'font-family':`"${cssString(font.family)}"`,
    'font-weight':font.weight ?? 400,
    'font-size':size,
    fill:color,
    stroke:'none',
    'xml:space':'preserve',
  });
  text.textContent = value;
  text.style.whiteSpace = 'pre';
  text.style.fontSynthesis = 'none';
  text.style.stroke = 'none';
  return text;
}

function embedFonts(root, fonts) {
  const embedded = new Map();
  for (const font of fonts) {
    if (font.data) embedded.set(JSON.stringify([font.family, font.weight ?? 400]), font);
  }
  if (!embedded.size) return;
  const defs = element('defs');
  const style = element('style');
  style.textContent = [...embedded.values()].map(font => {
    const mime = /^font\/(woff2?|ttf|otf)$/.test(font.mime || '') ? font.mime : 'font/woff2';
    return `@font-face{font-family:"${cssString(font.family)}";font-style:normal;font-weight:${font.weight ?? 400};src:url("data:${mime};base64,${font.data}")}`;
  }).join('');
  defs.append(style);
  root.append(defs);
}

/**
 * Build a white SVG after the caller has loaded its FontFace objects.
 * Vertical graphemes use equal em cells; their native advance never determines
 * the next character's position. All fonts share the same layout envelope.
 */
export function buildImage({text, fonts, size, tracking, line, wrap, color, mode}) {
  const cellPitch = size * (1 + tracking);
  const linePitch = size * line;
  if (![size, cellPitch, linePitch].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('文字サイズ・字間・行間を確認してください。');
  }
  const wrapLimit = Math.max(1, Math.floor(Number(wrap) || 12));
  const lines = wrapText(String(text ?? ''), wrapLimit);
  const cells = lines.map(graphemes);
  const blockPitch = lines.length * linePitch;
  const padding = Math.ceil(size * .55);
  const measurement = element('svg', {'aria-hidden':'true', 'data-renderer-measurement':''});
  measurement.style.cssText = 'position:fixed;left:-20000px;top:0;width:1px;height:1px;overflow:visible;opacity:0;pointer-events:none;stroke:none;';
  document.body.append(measurement);

  try {
    function buildSection(orientation) {
      const vertical = orientation === 'vertical';
      const section = element('g', {'data-section':orientation});
      measurement.append(section);
      const groups = fonts.map((font, fontIndex) => {
        const group = element('g', {
          'data-orientation':orientation,
          'data-font-family':font.family,
          'data-font-index':fontIndex,
          'data-line-pitch':linePitch,
        });
        if (vertical) group.setAttribute('data-cell-pitch', cellPitch);
        section.append(group);
        lines.forEach((value, row) => {
          if (vertical) {
            cells[row].forEach((grapheme, index) => {
              const glyph = createText(grapheme, font, size, color);
              glyph.setAttribute('x', (lines.length - 1 - row) * linePitch + size / 2);
              glyph.setAttribute('y', index * cellPitch + size / 2);
              glyph.setAttribute('text-anchor', 'middle');
              glyph.setAttribute('dominant-baseline', 'central');
              glyph.setAttribute('letter-spacing', 0);
              glyph.setAttribute('writing-mode', 'vertical-rl');
              glyph.setAttribute('data-column', row);
              glyph.setAttribute('data-cell-index', index);
              glyph.style.writingMode = 'vertical-rl';
              glyph.style.textOrientation = 'upright';
              glyph.style.fontKerning = 'none';
              glyph.style.fontFeatureSettings = '"vert" 1, "vrt2" 1';
              group.append(glyph);
            });
          } else if (value) {
            const rowText = createText(value, font, size, color);
            rowText.setAttribute('x', 0);
            rowText.setAttribute('y', size * .8 + row * linePitch);
            rowText.setAttribute('letter-spacing', size * tracking);
            rowText.setAttribute('data-row', row);
            rowText.style.fontKerning = 'normal';
            group.append(rowText);
          }
        });
        return group;
      });

      const logical = vertical
        ? {x:0, y:0, width:size + (lines.length - 1) * linePitch, height:size + (Math.max(1, ...cells.map(row => row.length)) - 1) * cellPitch}
        : {x:0, y:0, width:size * .2, height:size + (lines.length - 1) * linePitch};
      const shared = unionBounds([logical, ...groups.map(bounds)]);
      const positioned = [];
      groups.forEach((group, index) => {
        addLayoutBounds(group, shared);
        group.setAttribute('data-logical-width', logical.width);
        group.setAttribute('data-logical-height', logical.height);
        const x = vertical ? -index * blockPitch : 0;
        const y = vertical ? 0 : index * blockPitch;
        group.setAttribute('transform', `translate(${x},${y})`);
        positioned.push(moveBox(shared, x, y));
      });
      const box = unionBounds(positioned);
      section.remove();
      return {group:section, box};
    }

    const horizontal = fonts.length && mode !== 'vertical' ? buildSection('horizontal') : null;
    const vertical = fonts.length && mode !== 'horizontal' ? buildSection('vertical') : null;
    const sectionGap = horizontal && vertical ? size * .9 : 0;
    const width = Math.max(1, Math.ceil(Math.max(horizontal?.box.width || 0, vertical?.box.width || 0) + padding * 2));
    const height = Math.max(1, Math.ceil((horizontal?.box.height || 0) + (vertical?.box.height || 0) + sectionGap + padding * 2));
    const root = element('svg', {width, height, viewBox:`0 0 ${width} ${height}`});
    root.setAttributeNS(XMLNS, 'xmlns', NS);
    embedFonts(root, fonts);
    root.append(element('rect', {width:'100%', height:'100%', fill:'#ffffff', stroke:'none'}));
    if (horizontal) {
      horizontal.group.setAttribute('transform', `translate(${padding - horizontal.box.x},${padding - horizontal.box.y})`);
      root.append(horizontal.group);
    }
    if (vertical) {
      const x = (width - vertical.box.width) / 2 - vertical.box.x;
      const y = padding + (horizontal?.box.height || 0) + sectionGap - vertical.box.y;
      vertical.group.setAttribute('transform', `translate(${x},${y})`);
      root.append(vertical.group);
    }
    return {root, width, height, wrap:wrapLimit};
  } finally {
    measurement.remove();
  }
}
