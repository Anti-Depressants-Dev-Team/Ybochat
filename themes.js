// Appearance options shared by every window: theme palettes, accent presets,
// tab tag colors, and the helpers that sanitize and apply them. The main
// process loads this with require() to color the native title bars; each page
// loads it with a <script> tag.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.YboThemes = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // `ov` is the RGB triple used for every translucent overlay (hover states,
  // borders, muted text), so light themes get dark overlays automatically.
  const THEMES = {
    dark:     { label: 'Dark',     scheme: 'dark',  bg: '#121212', panel: '#161616', sidebar: '#0b0b0b', tab: '#2c2c2c', fg: '#ffffff', ov: '255,255,255' },
    midnight: { label: 'Midnight', scheme: 'dark',  bg: '#000000', panel: '#060606', sidebar: '#000000', tab: '#1c1c1c', fg: '#ffffff', ov: '255,255,255' },
    dim:      { label: 'Dim',      scheme: 'dark',  bg: '#1e1f22', panel: '#232428', sidebar: '#17181a', tab: '#313338', fg: '#f2f3f5', ov: '255,255,255' },
    light:    { label: 'Light',    scheme: 'light', bg: '#f2f3f5', panel: '#ffffff', sidebar: '#e3e5e8', tab: '#d4d7dc', fg: '#1f2328', ov: '0,0,0' }
  };

  const ACCENTS = [
    ['Blue', '#007bff'], ['Blurple', '#5865f2'], ['Purple', '#9b5cff'],
    ['Pink', '#ff4fa3'], ['Red', '#ed4245'], ['Orange', '#ff8a00'],
    ['Yellow', '#f5c400'], ['Green', '#23a55a'], ['Teal', '#14b8a6']
  ];

  // Tags tell apart several accounts of the same app at a glance.
  const TAG_COLORS = ACCENTS;

  const TAB_SIZES = ['compact', 'normal', 'large'];
  const TAB_SHAPES = ['round', 'rounded', 'square'];

  const DEFAULTS = {
    theme: 'dark',
    accent: '#007bff',
    tabSize: 'normal',
    tabShape: 'round',
    showTabNames: false
  };

  const isHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

  function normalizeAppearance(s) {
    const source = s || {};
    return {
      theme: Object.hasOwn(THEMES, source.theme) ? source.theme : DEFAULTS.theme,
      accent: isHex(source.accent) ? source.accent.toLowerCase() : DEFAULTS.accent,
      tabSize: TAB_SIZES.includes(source.tabSize) ? source.tabSize : DEFAULTS.tabSize,
      tabShape: TAB_SHAPES.includes(source.tabShape) ? source.tabShape : DEFAULTS.tabShape,
      showTabNames: !!source.showTabNames
    };
  }

  function luminance(hex) {
    const channel = i => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  }

  const contrast = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };

  // White reads best on most accents; switch to near-black only on the bright
  // ones (yellow, teal, orange) where white text washes out.
  const textOn = hex => (luminance(hex) > 0.35 ? '#111111' : '#ffffff');

  function applyAppearance(s, root) {
    const target = root || document.documentElement;
    const appearance = normalizeAppearance(s);
    const theme = THEMES[appearance.theme];

    target.dataset.theme = appearance.theme;
    target.dataset.tabSize = appearance.tabSize;
    target.dataset.tabShape = appearance.tabShape;
    target.dataset.showNames = String(appearance.showTabNames);
    target.style.colorScheme = theme.scheme;

    const vars = {
      '--bg': theme.bg,
      '--panel': theme.panel,
      '--sidebar-bg': theme.sidebar,
      '--tab-bg': theme.tab,
      '--fg': theme.fg,
      '--ov': theme.ov,
      '--accent': appearance.accent,
      '--accent-fg': textOn(appearance.accent),
      // Accent used as text (headings, links) falls back to the body color
      // when it would be hard to read, e.g. yellow on the light theme.
      '--accent-ink': contrast(appearance.accent, theme.panel) >= 3 ? appearance.accent : theme.fg
    };
    for (const [name, value] of Object.entries(vars)) target.style.setProperty(name, value);
    return appearance;
  }

  return { THEMES, ACCENTS, TAG_COLORS, TAB_SIZES, TAB_SHAPES, DEFAULTS, isHex, normalizeAppearance, textOn, applyAppearance };
});
