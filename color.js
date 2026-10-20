const RECENT_KEY = 'lettering-recent-colors-v1';
const RECENT_LIMIT = 6;
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^#?([\da-f]{3}|[\da-f]{6})$/i);
  if (!match) return null;
  const digits = match[1].toLowerCase();
  return `#${digits.length === 3 ? [...digits].map(char => char + char).join('') : digits}`;
}

function hexToHSV(hex) {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let h = 0;
  if (delta) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h = (h * 60 + 360) % 360;
  }
  return {h, s: max ? delta / max : 0, v: max};
}

function hsvToHex({h, s, v}) {
  const hue = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = v - c;
  const rgb = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60)];
  return `#${rgb.map(channel => Math.round(clamp(channel + m) * 255).toString(16).padStart(2, '0')).join('')}`;
}

function readRecent() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return [...new Set(saved.map(normalizeHex).filter(Boolean))].slice(0, RECENT_LIMIT);
  } catch { return []; }
}

/** Wire the existing color dialog. This module creates no markup. */
export function initColorPicker({getColor, onChange}) {
  if (typeof getColor !== 'function' || typeof onChange !== 'function') {
    throw new TypeError('initColorPicker requires getColor and onChange functions');
  }
  const required = id => {
    const element = document.getElementById(id);
    if (!element) throw new Error(`Missing color picker element: #${id}`);
    return element;
  };
  const dialog = required('color-dialog');
  const field = required('color-field'), thumb = required('color-thumb');
  const hueInput = required('hue-input'), hexInput = required('hex-input');
  const chip = required('picker-color-chip');
  const openButton = required('open-color'), closeButton = required('close-color');
  const openChip = required('color-open-chip'), openValue = required('color-open-value');
  const recentSection = required('recent-colors-section'), recentRow = required('recent-colors');
  const recentButtons = [...recentRow.querySelectorAll('[data-recent-index]')]
    .sort((a, b) => Number(a.dataset.recentIndex) - Number(b.dataset.recentIndex));
  if (recentButtons.length !== RECENT_LIMIT) {
    throw new Error('Color picker needs six existing [data-recent-index] buttons');
  }
  const monoButtons = [...dialog.querySelectorAll('[data-picker-color]')];
  const events = new AbortController();
  const listen = (element, type, handler, options = {}) => element.addEventListener(type, handler, {...options, signal: events.signal});
  let selected = normalizeHex(getColor()) || '#000000';
  let hsv = hexToHSV(selected), recent = readRecent(), activePointer = null;

  function paintRecent() {
    recentSection.hidden = recent.length === 0;
    recentButtons.forEach((button, index) => {
      const color = recent[index];
      button.hidden = !color;
      if (!color) return;
      button.style.backgroundColor = color;
      button.setAttribute('aria-label', `最近使った色 ${color.toUpperCase()}`);
      button.setAttribute('aria-pressed', String(color === selected));
      button.title = color.toUpperCase();
    });
  }

  function paint({forceHex = false} = {}) {
    field.style.setProperty('--picker-hue', `${hsv.h}deg`);
    thumb.style.left = `${hsv.s * 100}%`;
    thumb.style.top = `${(1 - hsv.v) * 100}%`;
    hueInput.value = String(Math.round(hsv.h));
    hueInput.setAttribute('aria-valuetext', `${Math.round(hsv.h)}度`);
    field.setAttribute('aria-valuenow', String(Math.round(hsv.s * 100)));
    field.setAttribute('aria-valuetext', `彩度 ${Math.round(hsv.s * 100)}%、明度 ${Math.round(hsv.v * 100)}%`);
    chip.style.backgroundColor = selected;
    chip.setAttribute('aria-label', `選択中の色 ${selected.toUpperCase()}`);
    openChip.style.backgroundColor = selected;
    openValue.textContent = selected.toUpperCase();
    if (forceHex || document.activeElement !== hexInput) {
      hexInput.value = selected.toUpperCase();
      hexInput.setAttribute('aria-invalid', 'false');
    }
    monoButtons.forEach(button => {
      const color = normalizeHex(button.dataset.pickerColor);
      if (color) button.style.backgroundColor = color;
      button.setAttribute('aria-pressed', String(color === selected));
    });
    paintRecent();
  }

  function notify() {
    if (normalizeHex(getColor()) !== selected) onChange(selected);
  }

  function applyHSV() {
    selected = hsvToHex(hsv);
    // iOS may keep the HEX field focused while a range control is touched.
    paint({forceHex: true});
    notify();
  }

  function applyHex(hex, {notifyChange = true, forceHex = false} = {}) {
    const normalized = normalizeHex(hex);
    if (!normalized) return false;
    const next = hexToHSV(normalized);
    // Neutral colors have no unique hue; keep the user's hue ready for the next drag.
    if (next.s === 0) next.h = hsv.h;
    hsv = next;
    selected = normalized;
    paint({forceHex});
    if (notifyChange) notify();
    return true;
  }

  function sync({forceHex = false} = {}) {
    const color = normalizeHex(getColor()) || selected;
    if (color !== selected) applyHex(color, {notifyChange: false, forceHex});
    else paint({forceHex});
  }

  function remember() {
    const color = normalizeHex(getColor()) || selected;
    const next = [color, ...recent.filter(item => item !== color)].slice(0, RECENT_LIMIT);
    if (next.join(',') === recent.join(',')) return;
    recent = next;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch {}
    paintRecent();
  }

  function open() {
    sync({forceHex: true});
    if (!dialog.open) dialog.showModal();
    field.focus({preventScroll: true});
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  function updatePointer(event) {
    const bounds = field.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    hsv.s = clamp((event.clientX - bounds.left) / bounds.width);
    hsv.v = 1 - clamp((event.clientY - bounds.top) / bounds.height);
    applyHSV();
  }

  function releasePointer() {
    if (activePointer === null) return;
    const pointer = activePointer;
    activePointer = null;
    try { if (field.hasPointerCapture(pointer)) field.releasePointerCapture(pointer); } catch {}
  }

  listen(openButton, 'click', open);
  listen(closeButton, 'click', close);
  listen(dialog, 'close', () => { releasePointer(); remember(); hexInput.value = selected.toUpperCase(); hexInput.setAttribute('aria-invalid', 'false'); });
  listen(dialog, 'click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) close();
  });
  listen(field, 'pointerdown', event => {
    if (event.button !== 0 || activePointer !== null) return;
    event.preventDefault();
    field.focus({preventScroll: true});
    activePointer = event.pointerId;
    try { field.setPointerCapture(activePointer); } catch {}
    updatePointer(event);
  });
  listen(field, 'pointermove', event => {
    if (event.pointerId === activePointer) updatePointer(event);
  });
  listen(field, 'pointerup', event => {
    if (event.pointerId !== activePointer) return;
    updatePointer(event); releasePointer(); remember();
  });
  listen(field, 'pointercancel', event => {
    if (event.pointerId !== activePointer) return;
    releasePointer(); remember();
  });
  listen(field, 'lostpointercapture', event => {
    if (event.pointerId === activePointer) { activePointer = null; remember(); }
  });
  listen(field, 'keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.1 : 0.01;
    if (event.key === 'ArrowLeft') hsv.s = clamp(hsv.s - step);
    if (event.key === 'ArrowRight') hsv.s = clamp(hsv.s + step);
    if (event.key === 'ArrowUp') hsv.v = clamp(hsv.v + step);
    if (event.key === 'ArrowDown') hsv.v = clamp(hsv.v - step);
    applyHSV();
  });
  listen(field, 'keyup', event => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) remember();
  });
  listen(field, 'change', remember);
  listen(hueInput, 'input', () => { hsv.h = clamp(Number(hueInput.value), 0, 360); applyHSV(); });
  listen(hueInput, 'change', remember);
  listen(hueInput, 'pointerup', remember);
  listen(hexInput, 'input', () => {
    const valid = applyHex(hexInput.value);
    hexInput.setAttribute('aria-invalid', String(!valid));
  });
  listen(hexInput, 'change', () => { if (applyHex(hexInput.value)) remember(); });
  listen(hexInput, 'blur', () => {
    applyHex(normalizeHex(hexInput.value) || selected, {forceHex: true});
    hexInput.setAttribute('aria-invalid', 'false');
  });
  monoButtons.forEach(button => listen(button, 'click', () => {
    if (applyHex(button.dataset.pickerColor, {forceHex: true})) remember();
  }));
  recentButtons.forEach((button, index) => listen(button, 'click', () => {
    if (recent[index] && applyHex(recent[index], {forceHex: true})) remember();
  }));

  paint({forceHex: true});
  return {
    sync, open, close,
    destroy() { releasePointer(); events.abort(); }
  };
}
