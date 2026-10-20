import {graphemes, stripOuterEmptyLines, wrapText, unionBounds} from './layout.js?c=d8d3620e58';

const NS = 'http://www.w3.org/2000/svg';
const XMLNS = 'http://www.w3.org/2000/xmlns/';
let lastText, lastWrap, lastLines;

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

/** Embed fonts into the supplied SVG. Clone a live preview before calling. */
export function embedImageFonts(root, fonts) {
  for (const child of [...root.children]) {
    if (child.localName === 'defs' && child.hasAttribute('data-embedded-fonts')) child.remove();
  }
  const embedded = new Map();
  for (const font of fonts) {
    if (font.data) embedded.set(JSON.stringify([font.family, font.weight ?? 400]), font);
  }
  if (!embedded.size) return root;
  const defs = element('defs', {'data-embedded-fonts':''});
  const style = element('style');
  style.textContent = [...embedded.values()].map(font => {
    const mime = /^font\/(woff2?|ttf|otf)$/.test(font.mime || '') ? font.mime : 'font/woff2';
    return `@font-face{font-family:"${cssString(font.family)}";font-style:normal;font-weight:${font.weight ?? 400};src:url("data:${mime};base64,${font.data}")}`;
  }).join('');
  defs.append(style);
  root.prepend(defs);
  return root;
}

function prepareLines(text, wrap) {
  if (text !== lastText || wrap !== lastWrap) {
    const lines = wrapText(text, wrap);
    lastLines = {lines, cells:lines.map(graphemes)};
    lastText = text;
    lastWrap = wrap;
  }
  return lastLines;
}

/**
 * Build a white SVG after the caller has loaded its FontFace objects.
 * Vertical graphemes use equal em cells; their native advance never determines
 * the next character's position. All fonts share the same layout envelope.
 */
export function buildImage({text, fonts, size, tracking, line, wrap, color, mode, embedFonts = true}) {
  const cellPitch = size * (1 + tracking);
  const linePitch = size * line;
  if (![size, cellPitch, linePitch].every(value => Number.isFinite(value) && value > 0)) {
    throw new Error('文字サイズ・字間・行間を確認してください。');
  }
  const wrapLimit = Math.max(1, Math.floor(Number(wrap) || 12));
  const {lines, cells} = prepareLines(stripOuterEmptyLines(text), wrapLimit);
  // Compact specimen spacing follows the line control; preview guides make
  // font boundaries clear without reserving another full character of white.
  const fontGap = size * (.35 + Math.max(0, line - .8) * .2);
  const padding = Math.ceil(size * .225);
  const measurement = element('svg', {'aria-hidden':'true', 'data-renderer-measurement':''});
  measurement.style.cssText = 'position:fixed;left:-20000px;top:0;width:1px;height:1px;overflow:visible;opacity:0;pointer-events:none;stroke:none;';
  try {
    function buildSection(orientation) {
      const vertical = orientation === 'vertical';
      const section = element('g', {'data-section':orientation});
      const groups = fonts.map((font, fontIndex) => {
        const group = element('g', {
          'data-orientation':orientation,
          'data-font-family':font.family,
          'data-font-index':fontIndex,
          'data-line-pitch':linePitch,
        });
        if (vertical) group.setAttribute('data-cell-pitch', cellPitch);
        section.append(group);
        // Clone font/style attributes instead of setting them for every glyph.
        const template = createText('', font, size, color);
        if (vertical) {
          template.setAttribute('text-anchor', 'middle');
          template.setAttribute('dominant-baseline', 'central');
          template.setAttribute('letter-spacing', 0);
          template.setAttribute('writing-mode', 'vertical-rl');
          template.style.writingMode = 'vertical-rl';
          template.style.textOrientation = 'upright';
          template.style.fontKerning = 'none';
          template.style.fontFeatureSettings = '"vert" 1, "vrt2" 1';
        } else {
          template.setAttribute('x', 0);
          template.setAttribute('letter-spacing', size * tracking);
          template.style.fontKerning = 'normal';
        }
        lines.forEach((value, row) => {
          if (vertical) {
            const x = (lines.length - 1 - row) * linePitch + size / 2;
            cells[row].forEach((grapheme, index) => {
              const glyph = template.cloneNode(false);
              glyph.textContent = grapheme;
              glyph.setAttribute('x', x);
              glyph.setAttribute('y', index * cellPitch + size / 2);
              glyph.setAttribute('data-column', row);
              glyph.setAttribute('data-cell-index', index);
              group.append(glyph);
            });
          } else if (value) {
            const rowText = template.cloneNode(false);
            rowText.textContent = value;
            rowText.setAttribute('y', size * .8 + row * linePitch);
            rowText.setAttribute('data-row', row);
            group.append(rowText);
          }
        });
        return group;
      });

      const logical = vertical
        ? {x:0, y:0, width:size + (lines.length - 1) * linePitch, height:size + (Math.max(1, ...cells.map(row => row.length)) - 1) * cellPitch}
        : {x:0, y:0, width:size * .2, height:size + (lines.length - 1) * linePitch};
      return {group:section, groups, vertical, logical};
    }

    const sections = [
      fonts.length && mode !== 'vertical' ? buildSection('horizontal') : null,
      fonts.length && mode !== 'horizontal' ? buildSection('vertical') : null,
    ];
    const active = sections.filter(Boolean);
    if (active.length) {
      measurement.append(...active.map(section => section.group));
      document.body.append(measurement);
      // Read only after all writes. The unpositioned font groups overlap, so
      // one section bbox is exactly the union of its individual font bboxes.
      for (const section of active) section.shared = unionBounds([section.logical, bounds(section.group)]);
    }
    for (const section of active) {
      const {group:sectionGroup, groups, vertical, logical, shared} = section;
      // Font specimens are separate text blocks. Keep a visible blank margin
      // between their ink envelopes in addition to each specimen's own line
      // layout, including at tight line spacing and large overhangs.
      const groupStep = (vertical ? shared.width : shared.height) + fontGap;
      const positioned = [];
      groups.forEach((group, index) => {
        addLayoutBounds(group, shared);
        group.setAttribute('data-logical-width', logical.width);
        group.setAttribute('data-logical-height', logical.height);
        const x = vertical ? -index * groupStep : 0;
        const y = vertical ? 0 : index * groupStep;
        group.setAttribute('transform', `translate(${x},${y})`);
        positioned.push({...moveBox(shared, x, y), fontIndex:index, orientation:vertical ? 'vertical' : 'horizontal'});
      });
      section.box = unionBounds(positioned);
      section.groupBounds = positioned;
      sectionGroup.remove();
    }

    const [horizontal, vertical] = sections;
    const sectionGap = horizontal && vertical ? size * .425 : 0;
    const width = Math.max(1, Math.ceil(Math.max(horizontal?.box.width || 0, vertical?.box.width || 0) + padding * 2));
    const height = Math.max(1, Math.ceil((horizontal?.box.height || 0) + (vertical?.box.height || 0) + sectionGap + padding * 2));
    const root = element('svg', {width, height, viewBox:`0 0 ${width} ${height}`});
    root.setAttributeNS(XMLNS, 'xmlns', NS);
    if (embedFonts) embedImageFonts(root, fonts);
    root.append(element('rect', {width:'100%', height:'100%', fill:'#ffffff', stroke:'none'}));
    const groupBounds = [];
    if (horizontal) {
      const x = padding - horizontal.box.x, y = padding - horizontal.box.y;
      horizontal.group.setAttribute('transform', `translate(${x},${y})`);
      root.append(horizontal.group);
      groupBounds.push(...horizontal.groupBounds.map(box => moveBox(box, x, y)));
    }
    if (vertical) {
      const x = (width - vertical.box.width) / 2 - vertical.box.x;
      const y = padding + (horizontal?.box.height || 0) + sectionGap - vertical.box.y;
      vertical.group.setAttribute('transform', `translate(${x},${y})`);
      root.append(vertical.group);
      groupBounds.push(...vertical.groupBounds.map(box => moveBox(box, x, y)));
    }
    return {root, width, height, wrap:wrapLimit, groupBounds};
  } finally {
    measurement.remove();
  }
}
