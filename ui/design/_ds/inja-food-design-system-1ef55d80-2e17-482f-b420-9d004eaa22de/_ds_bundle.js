/* @ds-bundle: {"format":4,"namespace":"InjaFoodDesignSystem_1ef55d","components":[{"name":"Spinner","sourcePath":"components/core/Button.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"Card","sourcePath":"components/core/Card.jsx"},{"name":"Chip","sourcePath":"components/core/Chip.jsx"},{"name":"Fa","sourcePath":"components/core/Fa.jsx"},{"name":"InjaIcons","sourcePath":"components/core/Icon.jsx"},{"name":"InjaDeptIcons","sourcePath":"components/core/Icon.jsx"},{"name":"InjaDeptAccent","sourcePath":"components/core/Icon.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconTile","sourcePath":"components/core/IconTile.jsx"},{"name":"IdBadge","sourcePath":"components/core/IdBadge.jsx"},{"name":"ProcessTag","sourcePath":"components/core/ProcessTag.jsx"},{"name":"ConflictCard","sourcePath":"components/feedback/ConflictCard.jsx"},{"name":"EmptyState","sourcePath":"components/feedback/EmptyState.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"Toast","sourcePath":"components/feedback/Toast.jsx"},{"name":"ActivityNode","sourcePath":"components/flow/ActivityNode.jsx"},{"name":"DetailDrawer","sourcePath":"components/flow/DetailDrawer.jsx"},{"name":"JunctionNode","sourcePath":"components/flow/JunctionNode.jsx"},{"name":"JunctionLegend","sourcePath":"components/flow/JunctionNode.jsx"},{"name":"TerminalNode","sourcePath":"components/flow/TerminalNode.jsx"},{"name":"ListEditor","sourcePath":"components/forms/ListEditor.jsx"},{"name":"AddButton","sourcePath":"components/forms/ListEditor.jsx"},{"name":"SearchField","sourcePath":"components/forms/SearchField.jsx"},{"name":"TextField","sourcePath":"components/forms/TextField.jsx"},{"name":"BranchGroup","sourcePath":"components/guide/BranchGroup.jsx"},{"name":"EndMark","sourcePath":"components/guide/BranchGroup.jsx"},{"name":"StepCard","sourcePath":"components/guide/StepCard.jsx"},{"name":"ToolGroup","sourcePath":"components/shell/ToolGroup.jsx"},{"name":"ToolButton","sourcePath":"components/shell/ToolGroup.jsx"},{"name":"ToolDivider","sourcePath":"components/shell/ToolGroup.jsx"},{"name":"TopBar","sourcePath":"components/shell/TopBar.jsx"},{"name":"Breadcrumb","sourcePath":"components/shell/TopBar.jsx"},{"name":"DepartmentCard","sourcePath":"components/surfaces/DepartmentCard.jsx"},{"name":"Idef0Diagram","sourcePath":"components/surfaces/Idef0Diagram.jsx"},{"name":"KpiCard","sourcePath":"components/surfaces/KpiCard.jsx"},{"name":"ProcessRow","sourcePath":"components/surfaces/ProcessRow.jsx"},{"name":"StatCard","sourcePath":"components/surfaces/StatCard.jsx"}],"sourceHashes":{"components/core/Button.jsx":"63eb748ddd10","components/core/Card.jsx":"a2483703c1f5","components/core/Chip.jsx":"8de8df21768f","components/core/Fa.jsx":"9762e4309d0c","components/core/Icon.jsx":"101dc6165991","components/core/IconTile.jsx":"4f52519d1722","components/core/IdBadge.jsx":"bcd4774af4ce","components/core/ProcessTag.jsx":"5a9fa0b0695b","components/feedback/ConflictCard.jsx":"c07af81959d7","components/feedback/EmptyState.jsx":"1c47240ab871","components/feedback/Modal.jsx":"f630eb7c279e","components/feedback/Toast.jsx":"b39e794cc447","components/flow/ActivityNode.jsx":"9eec7606d801","components/flow/DetailDrawer.jsx":"66152618d56d","components/flow/JunctionNode.jsx":"2115bac987b5","components/flow/TerminalNode.jsx":"f5807f4ab0b1","components/forms/ListEditor.jsx":"31b17736641c","components/forms/SearchField.jsx":"d5bbbec7c9a7","components/forms/TextField.jsx":"8a846fa26c90","components/guide/BranchGroup.jsx":"0ad00edbe033","components/guide/StepCard.jsx":"ad00479bb3b7","components/shell/ToolGroup.jsx":"ae25aff7d801","components/shell/TopBar.jsx":"ee022c02feb4","components/surfaces/DepartmentCard.jsx":"129a09621a6c","components/surfaces/Idef0Diagram.jsx":"cc4f6357c5ce","components/surfaces/KpiCard.jsx":"f3a5ca6324e6","components/surfaces/ProcessRow.jsx":"9915ebdc5a7d","components/surfaces/StatCard.jsx":"af9c4395050c","ui_kits/panel/DepartmentInfo.jsx":"4f096ff5e7c2","ui_kits/panel/Departments.jsx":"a0f0bfe6fee7","ui_kits/panel/FlowScreen.jsx":"0611655dc627","ui_kits/panel/Login.jsx":"8e5b644539d7","ui_kits/panel/Modals.jsx":"49eab7a9f0bf","ui_kits/panel/ProcessList.jsx":"5618cb4144fc","ui_kits/panel/Summary.jsx":"1de79df21a29","ui_kits/panel/data.js":"a300b664b213","ui_kits/staff-guide/StepsApp.jsx":"159c509d9d99","ui_kits/staff-guide/data.js":"2abcbdde2ac2"},"inlinedExternals":[],"unexposedExports":[{"name":"pad2Fa","sourcePath":"components/core/Fa.jsx"},{"name":"toFa","sourcePath":"components/core/Fa.jsx"}]} */

(() => {

const __ds_ns = (window.InjaFoodDesignSystem_1ef55d = window.InjaFoodDesignSystem_1ef55d || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/core/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The white card: warm 1px border, 16px radius, small violet-tinted shadow.
 *  onDark swaps the fill to cream and deepens the shadow, for the departments screen. */
function Card({
  onDark = false,
  radius,
  padding,
  hoverLift = false,
  style,
  children,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", _extends({
    onMouseEnter: hoverLift ? () => setHover(true) : undefined,
    onMouseLeave: hoverLift ? () => setHover(false) : undefined,
    style: {
      background: onDark ? 'var(--bg)' : 'var(--card)',
      border: '1px solid var(--warm)',
      borderRadius: radius ?? 'var(--radius-card)',
      boxShadow: hover ? 'var(--shadow-card-hover)' : onDark ? 'var(--shadow-card-dark)' : 'var(--shadow-card)',
      transform: hover ? 'var(--hover-lift)' : undefined,
      transition: 'transform var(--duration), box-shadow var(--duration)',
      padding,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Chip.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const KINDS = {
  input: {
    color: 'var(--icom-input-fg)',
    background: 'var(--icom-input-bg)'
  },
  control: {
    color: 'var(--icom-control-fg)',
    background: 'var(--icom-control-bg)'
  },
  output: {
    color: 'var(--icom-output-fg)',
    background: 'var(--icom-output-bg)'
  },
  mech: {
    color: 'var(--icom-mech-fg)',
    background: 'var(--icom-mech-bg)'
  }
};

/** An IDEF0 ICOM value: input / control / output / mechanism. Colour IS the role. */
function Chip({
  kind = 'input',
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      fontSize: 'var(--fs-sm2)',
      padding: '4px 10px',
      borderRadius: 'var(--radius-chip)',
      overflowWrap: 'break-word',
      minWidth: 0,
      maxWidth: '100%',
      ...KINDS[kind],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { Chip });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Chip.jsx", error: String((e && e.message) || e) }); }

// components/core/Fa.jsx
try { (() => {
const FA = '۰۱۲۳۴۵۶۷۸۹';

/** Every count, index and date the reader sees is in Persian digits (lib/format.ts).
 *  Latin digits survive in exactly one place: process ids inside IdBadge. */
const toFa = x => String(x).replace(/[0-9]/g, d => FA[Number(d)]);

/** Zero-padded to two — «۰۱», «۱۲» — as the ghost numerals and sheet numbers are. */
const pad2Fa = n => toFa(String(n).padStart(2, '0'));
function Fa({
  children
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, toFa(children ?? ''));
}
Object.assign(__ds_scope, { toFa, pad2Fa, Fa });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Fa.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The app's whole icon vocabulary, lifted verbatim from the TSX that inlines it
 *  (shell/TopBar, screens/*, flow/*, write/*, lib/departments.ts, export/steps).
 *  Line SVG on a 24x24 box, stroke=currentColor, rounded caps/joins — Feather /
 *  Lucide in style, but hand-inlined; there is no icon font and no icon files in
 *  the source repo. Values are markup strings because that is exactly how
 *  export/steps/StepsApp.tsx stores them. */
const InjaIcons = {
  chevronEnd: '<path d="M9 18l6-6-6-6"/>',
  chevronStart: '<path d="M15 18l-6-6 6-6"/>',
  chevronNext: '<path d="M9 6l6 6-6 6"/>',
  chevronPrev: '<path d="M15 6l-6 6 6 6"/>',
  chevronDown: '<path d="M6 9l6 6 6-6"/>',
  chevronUp: '<path d="M18 15l-6-6-6 6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  trashSmall: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  document: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M8 13h8M8 17h5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.4"/><circle cx="4.5" cy="12" r="1.4"/><circle cx="4.5" cy="18" r="1.4"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-1"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9a5 5 0 0 0 0 10h1"/>',
  move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  cursor: '<path d="M3 3l7.07 17 2.51-7.39L20 10.07z"/>',
  relayout: '<path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16"/>',
  addActivity: '<rect x="4" y="7" width="16" height="10" rx="2"/><path d="M12 10v4M10 12h4" stroke-width="2.2"/>',
  junction: '<path d="M12 3l9 9-9 9-9-9z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  userBust: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
  warning: '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  info: '<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14L21 3"/>',
  subprocess: '<path d="M3 3h7v7H3zM14 14h7v7h-7zM14 3l7 7M10 14l-7 7"/>',
  backToStep: '<path d="M9 14l-4-4 4-4"/><path d="M5 10h9a4 4 0 0 1 0 8h-1"/>',
  tip: '<path d="M9 11V6a2 2 0 1 1 4 0v9"/><path d="M13 12h3a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-4l-4-4-2-4a1.5 1.5 0 0 1 2.4-1.8L9 13"/>',
  process: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M8 9h8M8 13h5"/>',
  subprocessArrow: '<path d="M4 4v7a4 4 0 0 0 4 4h9"/><path d="M14 11l4 4-4 4"/>',
  dots: '<circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/>'
};

/** The nine department glyphs (ui/src/lib/departments.ts), verbatim. */
const InjaDeptIcons = {
  management: 'M4 21V5l8-2v18M12 21V9l6 2v10M8 8h.01M8 12h.01M8 16h.01',
  accounting: 'M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3zM9 8h6M9 12h6',
  warehouse: 'M3 8l9-4 9 4v8l-9 4-9-4V8zM3 8l9 4 9-4M12 12v9',
  procurement: 'M3 4h2l2 12h11l2-8H6M9 20a1 1 0 1 0 .01 0M17 20a1 1 0 1 0 .01 0',
  cooking: 'M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 1 1 1.5 2 1.5-1-2 0-4 1-6.5z',
  preparation: 'M4 20l7-7M14 4l4 4-8 8-3-1 1-3z',
  dining: 'M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9',
  cashier: 'M3 6h18v12H3zM3 10h18M7 15h4',
  logistics: 'M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18a1.5 1.5 0 1 0 .01 0M18 18a1.5 1.5 0 1 0 .01 0'
};

/** Which accent each department carries (violet or coral), verbatim. */
const InjaDeptAccent = {
  management: 'violet',
  accounting: 'coral',
  warehouse: 'violet',
  procurement: 'coral',
  cooking: 'coral',
  preparation: 'violet',
  dining: 'coral',
  cashier: 'violet',
  logistics: 'coral'
};
function Icon({
  name,
  d,
  size = 16,
  strokeWidth = 2,
  fill = 'none',
  style,
  ...rest
}) {
  const markup = d ? '<path d="' + d + '"/>' : InjaIcons[name];
  return /*#__PURE__*/React.createElement("svg", _extends({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: fill,
    stroke: fill === 'currentColor' ? 'none' : 'currentColor',
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    style: {
      flex: 'none',
      display: 'block',
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: markup
    }
  }, rest));
}
Object.assign(__ds_scope, { InjaIcons, InjaDeptIcons, InjaDeptAccent, Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Inline "work in progress" ring, sized in em so it tracks the button's text. */
function Spinner({
  size = '1.05em',
  style
}) {
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    style: {
      width: size,
      height: size,
      flex: 'none',
      animation: 'inja-spin 1s linear infinite',
      ...style
    }
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "12",
    r: "9",
    stroke: "currentColor",
    strokeWidth: "3",
    opacity: ".25"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M21 12a9 9 0 0 0-9-9",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round"
  }));
}
const VARIANTS = {
  coral: {
    background: 'var(--coral)',
    color: '#fff',
    border: 0,
    boxShadow: 'var(--shadow-coral)'
  },
  violet: {
    background: 'var(--violet)',
    color: '#fff',
    border: 0,
    boxShadow: 'var(--shadow-violet)'
  },
  green: {
    background: 'var(--green)',
    color: '#fff',
    border: 0,
    boxShadow: 'var(--shadow-green)'
  },
  ghost: {
    background: '#fff',
    color: 'var(--violet)',
    border: '1.5px solid var(--line)'
  },
  danger: {
    background: 'var(--tile-c2)',
    color: 'var(--conflict)',
    border: '1.5px solid var(--border-danger)'
  }
};
const SIZES = {
  sm: {
    padding: '9px 14px',
    fontSize: 'var(--fs-sm2)'
  },
  md: {
    padding: '11px 16px',
    fontSize: 'var(--fs-sm)'
  },
  lg: {
    padding: '14px 18px',
    fontSize: '14.5px'
  }
};
function Button({
  variant = 'ghost',
  size = 'md',
  icon,
  loading = false,
  loadingLabel,
  disabled,
  block,
  style,
  children,
  ...rest
}) {
  const v = VARIANTS[variant] ?? VARIANTS.ghost;
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled || loading,
    "aria-busy": loading || undefined,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-bold)',
      borderRadius: 'var(--radius-md)',
      cursor: loading ? 'progress' : 'pointer',
      width: block ? '100%' : undefined,
      whiteSpace: 'nowrap',
      transition: 'filter var(--duration), background var(--duration)',
      opacity: disabled && !loading ? .6 : 1,
      ...SIZES[size],
      ...v,
      ...style
    }
  }, rest), loading ? /*#__PURE__*/React.createElement(Spinner, null) : icon ? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 15,
    strokeWidth: 2.2
  }) : null, loading && loadingLabel !== undefined ? loadingLabel : children);
}
Object.assign(__ds_scope, { Spinner, Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconTile.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const ACCENTS = {
  violet: {
    background: 'var(--tile-v)',
    color: 'var(--violet)'
  },
  coral: {
    background: 'var(--tile-c)',
    color: 'var(--conflict)'
  },
  warn: {
    background: 'var(--tile-warn)',
    color: 'var(--warn)'
  },
  ok: {
    background: 'var(--tile-ok)',
    color: 'var(--green)'
  }
};

/** The rounded square that carries a department glyph (48px, 14px radius) — also
 *  used at 34–40px for menu rows and dialog headers. */
function IconTile({
  dept,
  name,
  d,
  accent,
  size = 48,
  radius = 'var(--radius-tile)',
  style,
  children,
  ...rest
}) {
  const a = ACCENTS[accent ?? (dept ? __ds_scope.InjaDeptAccent[dept] : 'violet')] ?? ACCENTS.violet;
  const path = d ?? (dept ? __ds_scope.InjaDeptIcons[dept] : undefined);
  return /*#__PURE__*/React.createElement("div", _extends({
    style: {
      width: size,
      height: size,
      flex: 'none',
      borderRadius: radius,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      ...a,
      ...style
    }
  }, rest), children ?? /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: name,
    d: path,
    size: Math.round(size / 2),
    strokeWidth: 1.9
  }));
}
Object.assign(__ds_scope, { IconTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconTile.jsx", error: String((e && e.message) || e) }); }

// components/core/IdBadge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Every process / node id in the product is latin and monospace, pinned dir="ltr"
 *  inside the RTL layout. tone="violet" marks the id of the thing being looked at. */
function IdBadge({
  tone = 'muted',
  children,
  style,
  ...rest
}) {
  const t = tone === 'violet' ? {
    background: 'var(--violet)',
    color: '#fff'
  } : {
    background: 'var(--tile-v2)',
    color: 'var(--text-muted)'
  };
  return /*#__PURE__*/React.createElement("span", _extends({
    dir: "ltr",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-xxs)',
      padding: '2px 8px',
      borderRadius: 'var(--radius-badge)',
      whiteSpace: 'nowrap',
      ...t,
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IdBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IdBadge.jsx", error: String((e && e.message) || e) }); }

// components/core/ProcessTag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The derived state tag on a process row (lib/format.ts deriveTag): one of
 *  tombstone / sub / conflict / kpi / plain, in that precedence. */
const TAGS = {
  sub: {
    color: 'var(--warn)',
    background: 'var(--tile-warn)'
  },
  conflict: {
    color: 'var(--conflict)',
    background: 'var(--tile-c)'
  },
  kpi: {
    color: 'var(--violet)',
    background: 'var(--tile-v)'
  },
  plain: {
    color: 'var(--violet)',
    background: 'var(--tile-v)'
  },
  tombstone: {
    color: 'var(--text-muted)',
    background: 'var(--tile-dead)'
  }
};
function ProcessTag({
  kind = 'plain',
  children,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("span", _extends({
    style: {
      fontSize: 'var(--fs-micro)',
      padding: '2px 8px',
      borderRadius: 999,
      fontWeight: 'var(--fw-semibold)',
      whiteSpace: 'nowrap',
      ...TAGS[kind],
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { ProcessTag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/ProcessTag.jsx", error: String((e && e.message) || e) }); }

// components/feedback/ConflictCard.jsx
try { (() => {
/** A pending extraction conflict: current value beside the proposed one, then accept
 *  / reject. Nothing is written until the reader decides. */
function ConflictCard({
  nodeId,
  field,
  source,
  current,
  proposed,
  onAccept,
  onReject,
  action,
  compact = false,
  style
}) {
  const box = (bg, border, label, labelColor, text, textColor, bold) => /*#__PURE__*/React.createElement("div", {
    style: {
      background: bg,
      border: '1px solid ' + border,
      borderRadius: compact ? 'var(--radius-sm)' : 'var(--radius-control)',
      padding: compact ? '8px 10px' : '10px 12px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: compact ? 9.5 : 10,
      color: labelColor,
      marginBottom: 3
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: compact ? 'var(--fs-sm2)' : 'var(--fs-sm2)',
      color: textColor,
      lineHeight: 'var(--lh-snug)',
      whiteSpace: 'pre-line',
      fontWeight: bold ? 'var(--fw-semibold)' : undefined
    }
  }, text));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid ' + (compact ? 'var(--border-danger)' : 'var(--warm)'),
      borderRadius: compact ? 'var(--radius-md)' : 'var(--radius-tile)',
      padding: compact ? 12 : 16,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: compact ? 9 : 12
    }
  }, nodeId && /*#__PURE__*/React.createElement(__ds_scope.IdBadge, null, nodeId), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-xs)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--ink)'
    }
  }, field), source && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-micro)',
      color: 'var(--text-faint)'
    }
  }, source), action && /*#__PURE__*/React.createElement("span", {
    style: {
      marginInlineStart: 'auto'
    }
  }, action)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: compact ? 'flex' : 'grid',
      flexDirection: 'column',
      gridTemplateColumns: compact ? undefined : '1fr 1fr',
      gap: compact ? 7 : 10,
      marginBottom: compact ? 10 : 14
    }
  }, box('var(--value-current)', 'var(--border-current)', 'مقدار فعلی', 'var(--text-faint)', current, 'var(--text-current)', false), box('var(--tile-c2)', 'var(--border-danger)', 'پیشنهاد جدید', 'var(--conflict)', proposed, 'var(--text-proposed)', true)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: compact ? 8 : 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onAccept,
    style: {
      flex: 1,
      padding: compact ? '8px 0' : '10px 0',
      border: 0,
      borderRadius: 'var(--radius-sm)',
      background: 'var(--green)',
      color: '#fff',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-sm2)',
      cursor: 'pointer'
    }
  }, compact ? 'پذیرش' : 'پذیرش پیشنهاد'), /*#__PURE__*/React.createElement("button", {
    onClick: onReject,
    style: {
      flex: 1,
      padding: compact ? '8px 0' : '10px 0',
      border: '1.5px solid var(--line)',
      borderRadius: 'var(--radius-sm)',
      background: '#fff',
      color: 'var(--text-muted)',
      fontFamily: 'var(--font-sans)',
      fontWeight: 'var(--fw-semibold)',
      fontSize: 'var(--fs-sm2)',
      cursor: 'pointer'
    }
  }, compact ? 'رد' : 'رد کردن')));
}
Object.assign(__ds_scope, { ConflictCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/ConflictCard.jsx", error: String((e && e.message) || e) }); }

// components/feedback/EmptyState.jsx
try { (() => {
/** What a surface says when it has nothing: dashed for "not recorded yet",
 *  plain card for "your filter matched nothing". */
function EmptyState({
  children,
  note,
  variant = 'card',
  style
}) {
  const dashed = variant === 'dashed';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px ' + (dashed ? 'dashed var(--line)' : 'solid var(--warm)'),
      borderRadius: dashed ? 'var(--radius-tile)' : 'var(--radius-card)',
      padding: dashed ? 20 : '48px 20px',
      textAlign: 'center',
      color: 'var(--text-faint)',
      fontSize: 'var(--fs-sm2)',
      lineHeight: 'var(--lh-relaxed)',
      ...style
    }
  }, children, note && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4,
      fontSize: 'var(--fs-xxs)'
    }
  }, note));
}
Object.assign(__ds_scope, { EmptyState });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/EmptyState.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
/** Every dialog in the panel: violet-ink scrim, cream sheet, white header strip with
 *  a warm bottom border, and a footer of two equal-width buttons. */
function Modal({
  title,
  subtitle,
  icon,
  width = 440,
  radius = 'var(--radius-panel)',
  blurScrim = false,
  onClose,
  footer,
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    dir: "rtl",
    onClick: onClose,
    style: {
      position: 'fixed',
      inset: 0,
      background: 'var(--scrim)',
      backdropFilter: blurScrim ? 'var(--blur-scrim)' : undefined,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      zIndex: 50
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: e => e.stopPropagation(),
    style: {
      width,
      maxWidth: '100%',
      maxHeight: '86vh',
      background: 'var(--bg)',
      borderRadius: radius,
      overflow: 'hidden',
      boxShadow: 'var(--shadow-modal)',
      display: 'flex',
      flexDirection: 'column',
      ...style
    }
  }, (title || icon) && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '20px 22px',
      background: '#fff',
      borderBottom: '1px solid var(--warm)',
      flex: 'none'
    }
  }, icon, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-h4)',
      color: 'var(--ink)'
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, subtitle)), onClose && /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "\u0628\u0633\u062A\u0646 \u067E\u0646\u062C\u0631\u0647",
    style: {
      width: 32,
      height: 32,
      flex: 'none',
      background: 'var(--tile-v2)',
      borderRadius: 'var(--radius-sm)',
      border: 0,
      color: 'var(--text-muted)',
      fontSize: 18,
      cursor: 'pointer'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: 22,
      overflow: 'auto'
    }
  }, children), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      padding: '0 22px 22px',
      flex: 'none'
    }
  }, footer)));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Toast.jsx
try { (() => {
/** Confirmation of a write that already happened: ink pill, green check, bottom
 *  centre, gone after 2.6s. Never used for errors — those are dialog text. */
function Toast({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'fixed',
      bottom: 24,
      left: '50%',
      transform: 'translateX(-50%)',
      background: 'var(--ink)',
      color: '#fff',
      padding: '12px 20px',
      borderRadius: 'var(--radius-md)',
      fontSize: 'var(--fs-sm)',
      fontWeight: 'var(--fw-semibold)',
      boxShadow: 'var(--shadow-modal)',
      zIndex: 60,
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      animation: 'inja-toast-in var(--duration) ease-out',
      ...style
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "16",
    height: "16",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--toast-check)",
    strokeWidth: "2.4",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6L9 17l-5-5"
  })), children);
}
Object.assign(__ds_scope, { Toast });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Toast.jsx", error: String((e && e.message) || e) }); }

// components/flow/ActivityNode.jsx
try { (() => {
/** An IDEF3 activity box on the flow canvas: 170px wide, centred, id badge over the
 *  label, actor beneath. A box that owns a sub-process is violet-tinted and carries
 *  the green "click to enter" pill; open conflicts show a coral count. */
function ActivityNode({
  id,
  label,
  actor,
  conflicts = 0,
  hasSub = false,
  highlighted = false,
  onOpenDetail,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    dir: "rtl",
    style: {
      position: 'relative',
      width: 170,
      textAlign: 'center',
      padding: '8px 12px',
      background: hasSub ? '#F3EEFC' : '#fff',
      border: '1px solid ' + (hasSub ? 'var(--line)' : 'var(--warm)'),
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-card)',
      outline: highlighted ? '2px solid var(--violet)' : undefined,
      outlineOffset: 2,
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onOpenDetail,
    title: "\u062C\u0632\u0626\u06CC\u0627\u062A",
    "aria-label": "\u062C\u0632\u0626\u06CC\u0627\u062A",
    style: {
      position: 'absolute',
      top: 4,
      insetInlineEnd: 4,
      width: 17,
      height: 17,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: 0,
      background: 'transparent',
      borderRadius: 4,
      color: 'var(--text-muted)',
      fontSize: 10,
      cursor: 'pointer'
    }
  }, "\u22EF"), conflicts > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 4,
      right: 4,
      minWidth: 17,
      height: 17,
      padding: '0 4px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--coral)',
      color: '#fff',
      borderRadius: '50%',
      fontSize: 9.5,
      fontWeight: 'var(--fw-extrabold)'
    }
  }, "! ", __ds_scope.toFa(conflicts)), /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-xxs)',
      padding: '2px 8px',
      borderRadius: 'var(--radius-badge)',
      background: 'var(--tile-v2)',
      color: 'var(--text-muted)'
    }
  }, id), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-sm2)',
      color: 'var(--ink)',
      lineHeight: 'var(--lh-tight)',
      marginTop: 4,
      overflowWrap: 'break-word'
    }
  }, label), actor && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      marginTop: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 15,
      height: 15,
      borderRadius: '50%',
      background: 'var(--tile-v)',
      color: 'var(--violet)',
      fontSize: 8,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'var(--fw-bold)'
    }
  }, "\u06F0"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-micro)',
      color: 'var(--text-muted)',
      overflowWrap: 'break-word'
    }
  }, actor)), hasSub && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      marginTop: 6,
      fontSize: 9,
      color: 'var(--green)',
      background: 'var(--tile-ok)',
      padding: '2px 8px',
      borderRadius: 999,
      fontWeight: 'var(--fw-semibold)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      fontSize: 10,
      lineHeight: 1
    }
  }, "\u2039"), "\u0632\u06CC\u0631\u0641\u0631\u0622\u06CC\u0646\u062F \u2014 \u0628\u0631\u0627\u06CC \u0648\u0631\u0648\u062F \u06A9\u0644\u06CC\u06A9 \u06A9\u0646\u06CC\u062F"));
}
Object.assign(__ds_scope, { ActivityNode });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/flow/ActivityNode.jsx", error: String((e && e.message) || e) }); }

// components/flow/DetailDrawer.jsx
try { (() => {
const IcomRow = ({
  label,
  items = [],
  kind
}) => /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 'var(--fs-micro)',
    color: 'var(--text-faint)',
    marginBottom: 6
  }
}, label), /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 6
  }
}, items.map((t, i) => /*#__PURE__*/React.createElement(__ds_scope.Chip, {
  key: i,
  kind: kind
}, t))));

/** The 340px panel that slides over the canvas with one node's detail. Below 560px
 *  the same panel becomes a bottom sheet covering the lower 58%, so the diagram
 *  stays visible above it. */
function DetailDrawer({
  id,
  label,
  actor,
  description,
  icom,
  source,
  children,
  onClose,
  footer,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    "data-drawer": true,
    style: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: 'var(--width-drawer)',
      background: '#fff',
      borderInlineEnd: '1px solid var(--warm)',
      boxShadow: 'var(--shadow-drawer)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 15,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '16px 18px',
      borderBottom: '1px solid var(--line-soft)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    dir: "ltr",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-xxs)',
      padding: '2px 8px',
      borderRadius: 'var(--radius-badge)',
      background: 'var(--violet)',
      color: '#fff'
    }
  }, id), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    title: "\u0628\u0633\u062A\u0646",
    "aria-label": "\u0628\u0633\u062A\u0646",
    style: {
      width: 28,
      height: 28,
      background: 'var(--tile-v2)',
      borderRadius: 8,
      border: 0,
      color: 'var(--text-muted)',
      fontSize: 18,
      cursor: 'pointer'
    }
  }, "\xD7")), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-h5)',
      color: 'var(--ink)',
      lineHeight: 'var(--lh-tight)'
    }
  }, label), actor && /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      padding: '10px 12px',
      background: 'var(--tile-v4)',
      borderRadius: 'var(--radius-control)'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "15",
    height: "15",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "var(--violet)",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "12",
    cy: "8",
    r: "4"
  }), /*#__PURE__*/React.createElement("path", {
    d: "M4 21a8 8 0 0 1 16 0"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-sm2)',
      color: 'var(--violet)',
      fontWeight: 'var(--fw-semibold)'
    }
  }, actor)), description && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xxs)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-muted)',
      marginTop: 18,
      marginBottom: 6
    }
  }, "\u062A\u0648\u0636\u06CC\u062D\u0627\u062A"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      color: 'var(--text-current)',
      lineHeight: 'var(--lh-relaxed)'
    }
  }, description)), icom && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xxs)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-muted)',
      marginTop: 18,
      marginBottom: 8
    }
  }, "\u0627\u0637\u0644\u0627\u0639\u0627\u062A ICOM"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(IcomRow, {
    label: "\u0648\u0631\u0648\u062F\u06CC\u200C\u0647\u0627",
    items: icom.inputs,
    kind: "input"
  }), /*#__PURE__*/React.createElement(IcomRow, {
    label: "\u06A9\u0646\u062A\u0631\u0644\u200C\u0647\u0627",
    items: icom.controls,
    kind: "control"
  }), /*#__PURE__*/React.createElement(IcomRow, {
    label: "\u062E\u0631\u0648\u062C\u06CC\u200C\u0647\u0627",
    items: icom.outputs,
    kind: "output"
  }), /*#__PURE__*/React.createElement(IcomRow, {
    label: "\u0645\u06A9\u0627\u0646\u06CC\u0632\u0645\u200C\u0647\u0627",
    items: icom.mechanisms,
    kind: "mech"
  }))), children, source && /*#__PURE__*/React.createElement("div", {
    dir: "ltr",
    style: {
      fontSize: 'var(--fs-micro)',
      color: 'var(--text-ghost)',
      marginTop: 20,
      borderTop: '1px dashed var(--border-current)',
      paddingTop: 12
    }
  }, "source: ", source)), footer && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 18px',
      borderTop: '1px solid var(--line-soft)'
    }
  }, footer));
}
Object.assign(__ds_scope, { DetailDrawer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/flow/DetailDrawer.jsx", error: String((e && e.message) || e) }); }

// components/flow/JunctionNode.jsx
try { (() => {
/** IDEF3 logic gate: a 44px square rotated 45°, labelled XOR / AND / OR.
 *  Colours come straight from ui/src/flow/nodes/junction-colors.ts. */
const COLOR = {
  XOR: 'var(--junction-xor)',
  AND: 'var(--junction-and)',
  OR: 'var(--junction-or)'
};
function JunctionNode({
  type = 'XOR',
  highlighted = false,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 44,
      height: 44,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      transform: 'rotate(45deg)',
      borderRadius: 4,
      background: COLOR[type],
      outline: highlighted ? '2px solid var(--violet)' : undefined,
      outlineOffset: 2
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 10.5,
      pointerEvents: 'none'
    }
  }, type));
}

/** The XOR/AND/OR key that sits in the corner of the canvas. */
function JunctionLegend({
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'inline-flex',
      gap: 14,
      background: '#fff',
      border: '1px solid var(--warm)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 14px',
      fontSize: 'var(--fs-xxs)',
      color: 'var(--text-muted)',
      ...style
    }
  }, ['XOR', 'AND', 'OR'].map(t => /*#__PURE__*/React.createElement("span", {
    key: t,
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 11,
      height: 11,
      transform: 'rotate(45deg)',
      display: 'inline-block',
      background: COLOR[t]
    }
  }), t)));
}
Object.assign(__ds_scope, { JunctionNode, JunctionLegend });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/flow/JunctionNode.jsx", error: String((e && e.message) || e) }); }

// components/flow/TerminalNode.jsx
try { (() => {
/** The pill at each end of a flow: start is brand violet, end is deep ink. */
function TerminalNode({
  kind = 'start',
  label,
  highlighted = false,
  style
}) {
  const start = kind === 'start';
  return /*#__PURE__*/React.createElement("div", {
    dir: "rtl",
    style: {
      display: 'inline-block',
      padding: '8px 20px',
      borderRadius: 999,
      background: start ? 'var(--violet)' : 'var(--ink)',
      color: '#fff',
      fontSize: 'var(--fs-sm2)',
      fontWeight: 'var(--fw-bold)',
      boxShadow: start ? 'var(--shadow-violet)' : undefined,
      outline: highlighted ? '2px solid ' + (start ? 'var(--coral)' : 'var(--violet)') : undefined,
      outlineOffset: 2,
      ...style
    }
  }, label ?? (start ? 'شروع' : 'پایان'));
}
Object.assign(__ds_scope, { TerminalNode });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/flow/TerminalNode.jsx", error: String((e && e.message) || e) }); }

// components/forms/ListEditor.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Repeating single-line values (ICOM lists, duties, KPIs): one row per item with a
 *  coral × to remove, and a dashed violet «افزودن» that appends an empty row. */
function ListEditor({
  label,
  items = [],
  onChange,
  placeholder,
  addLabel = 'افزودن',
  style
}) {
  const set = next => onChange && onChange(next);
  return /*#__PURE__*/React.createElement("div", {
    style: style
  }, label && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--ink)',
      marginBottom: 8
    }
  }, label), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, items.map((it, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      display: 'flex',
      gap: 6,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: it,
    placeholder: placeholder,
    onChange: e => set(items.map((x, k) => k === i ? e.target.value : x)),
    style: {
      flex: 1,
      minWidth: 0,
      padding: '8px 12px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-sm2)',
      color: 'var(--ink)',
      background: '#fff',
      border: '1.5px solid var(--line)',
      borderRadius: 'var(--radius-sm)',
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement("button", {
    onClick: () => set(items.filter((_, k) => k !== i)),
    title: "\u062D\u0630\u0641",
    "aria-label": "\u062D\u0630\u0641",
    style: {
      width: 30,
      height: 30,
      flex: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '1.5px solid var(--border-danger)',
      background: 'var(--tile-c2)',
      color: 'var(--conflict)',
      borderRadius: 'var(--radius-sm)',
      cursor: 'pointer',
      fontSize: 16,
      lineHeight: 1
    }
  }, "\xD7"))), /*#__PURE__*/React.createElement("button", {
    onClick: () => set([...items, '']),
    style: {
      alignSelf: 'flex-start',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-xxs)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--violet)',
      border: '1.5px dashed var(--line-dashed)',
      background: 'var(--tile-v4)',
      borderRadius: 'var(--radius-sm)',
      padding: '6px 12px',
      cursor: 'pointer'
    }
  }, addLabel)));
}

/** The bare dashed add-affordance, for sections that append a whole card. */
function AddButton({
  children = 'افزودن',
  filled = false,
  style,
  ...rest
}) {
  return /*#__PURE__*/React.createElement("button", _extends({
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-sm2)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--violet)',
      border: '1.5px dashed var(--line-dashed)',
      background: filled ? 'var(--tile-v4)' : 'transparent',
      borderRadius: 'var(--radius-control)',
      padding: '6px 12px',
      cursor: 'pointer',
      ...style
    }
  }, rest), children);
}
Object.assign(__ds_scope, { ListEditor, AddButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/ListEditor.jsx", error: String((e && e.message) || e) }); }

// components/forms/SearchField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** The list search: full-width, 13px, magnifier inset on the leading (right) side. */
function SearchField({
  placeholder = 'جست‌وجو…',
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      insetInlineStart: 15,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--text-faint)',
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "search",
    size: 16
  })), /*#__PURE__*/React.createElement("input", _extends({
    placeholder: placeholder,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '13px 44px',
      fontSize: 'var(--fs-sm)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--ink)',
      background: '#fff',
      border: '1.5px solid ' + (focus ? 'var(--coral)' : 'var(--line)'),
      borderRadius: 'var(--radius-lg)',
      outline: 'none'
    }
  }, rest)));
}
Object.assign(__ds_scope, { SearchField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SearchField.jsx", error: String((e && e.message) || e) }); }

// components/forms/TextField.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Label + input, as every write surface in the panel draws it: 1.5px violet-tinted
 *  border that turns coral on focus. multiline switches to a resizable textarea. */
function TextField({
  label,
  hint,
  multiline = false,
  rows = 3,
  size = 'md',
  invalid = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const pad = size === 'sm' ? '8px 12px' : size === 'lg' ? '13px 14px' : '10px 14px';
  const fs = size === 'sm' ? 'var(--fs-sm2)' : size === 'lg' ? 'var(--fs-body)' : 'var(--fs-sm)';
  const Tag = multiline ? 'textarea' : 'input';
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      ...style
    }
  }, label && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 'var(--fs-xxs)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-muted)',
      marginBottom: 6
    }
  }, label), /*#__PURE__*/React.createElement(Tag, _extends({
    rows: multiline ? rows : undefined,
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: pad,
      fontSize: fs,
      fontFamily: 'var(--font-sans)',
      color: 'var(--ink)',
      background: '#fff',
      border: '1.5px solid ' + (invalid ? 'var(--conflict)' : focus ? 'var(--coral)' : 'var(--line)'),
      borderRadius: 'var(--radius-control)',
      outline: 'none',
      resize: multiline ? 'vertical' : undefined,
      lineHeight: 'var(--lh-normal)'
    }
  }, rest)), hint && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 'var(--fs-xxs)',
      color: 'var(--text-muted)',
      marginTop: 7,
      lineHeight: 'var(--lh-relaxed)'
    }
  }, hint));
}
Object.assign(__ds_scope, { TextField });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/TextField.jsx", error: String((e && e.message) || e) }); }

// components/guide/BranchGroup.jsx
try { (() => {
/** A junction, written out for staff: a coral-tinted group holding one white card per
 *  branch. XOR «فقط یکی از این حالت‌ها», AND «همهٔ این کارها», OR «یک یا چند مورد». */
const GLYPH = {
  XOR: 'X',
  AND: '&',
  OR: 'O'
};
function BranchGroup({
  type = 'XOR',
  title,
  branches = [],
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      border: '2px solid var(--steps-group-border)',
      borderRadius: 'var(--radius-doc)',
      background: 'var(--steps-group-bg)',
      padding: 16,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 17,
      color: 'var(--conflict)',
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 34,
      height: 34,
      flex: 'none',
      borderRadius: 'var(--radius-input)',
      background: 'var(--coral)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-lg)'
    }
  }, GLYPH[type]), title), branches.map((b, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      background: '#fff',
      border: '2px solid var(--warm)',
      borderRadius: 'var(--radius-tile)',
      padding: 14,
      marginBottom: i === branches.length - 1 ? 0 : 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 9,
      fontSize: 'var(--fs-doc-body)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--ink)',
      marginBottom: 12,
      lineHeight: 1.8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 26,
      height: 26,
      flex: 'none',
      borderRadius: 8,
      background: 'var(--tile-warn)',
      color: 'var(--warn)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-sm)',
      marginTop: 3
    }
  }, __ds_scope.toFa(i + 1)), b.label ? 'اگر: ' + b.label : 'حالت ' + __ds_scope.toFa(i + 1)), b.children ?? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-doc-body)',
      color: 'var(--green)',
      background: 'var(--tile-ok)',
      borderRadius: 'var(--radius-md)',
      padding: '11px 15px',
      fontWeight: 'var(--fw-bold)'
    }
  }, "\u06A9\u0627\u0631\u06CC \u0644\u0627\u0632\u0645 \u0646\u06CC\u0633\u062A"))));
}

/** The green «کار تمام شد» marker that closes every guide page. */
function EndMark({
  children = 'کار تمام شد',
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      background: 'var(--tile-ok)',
      border: '2px solid var(--border-ok)',
      borderRadius: 'var(--radius-card)',
      padding: '16px 18px',
      fontSize: 'var(--fs-doc-step)',
      fontWeight: 'var(--fw-extrabold)',
      color: 'var(--green)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 38,
      height: 38,
      flex: 'none',
      borderRadius: '50%',
      background: 'var(--green)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "20",
    height: "20",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "3",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true
  }, /*#__PURE__*/React.createElement("path", {
    d: "M20 6L9 17l-5-5"
  }))), children);
}
Object.assign(__ds_scope, { BranchGroup, EndMark });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/guide/BranchGroup.jsx", error: String((e && e.message) || e) }); }

// components/guide/StepCard.jsx
try { (() => {
/** One numbered step of the staff guide document. Bigger type than the panel (18px
 *  label, 42px numeral) because it is read on a phone on the floor. A step that owns
 *  a sub-process turns amber and navigates instead of expanding. */
function StepCard({
  num,
  label,
  actor,
  description,
  condition,
  backTo,
  hasSub = false,
  open = false,
  onToggle,
  style
}) {
  const sub = hasSub;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: sub ? 'var(--steps-sub-bg)' : '#fff',
      border: '2px solid ' + (sub ? 'var(--steps-sub-border)' : open ? 'var(--violet)' : 'var(--warm)'),
      borderRadius: 'var(--radius-card)',
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onToggle,
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 15,
      width: '100%',
      textAlign: 'right',
      background: 'none',
      border: 'none',
      padding: '16px 18px',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 42,
      height: 42,
      flex: 'none',
      borderRadius: 'var(--radius-md)',
      background: sub ? 'var(--warn)' : 'var(--violet)',
      color: '#fff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-doc-step)',
      marginTop: 1
    }
  }, __ds_scope.toFa(num)), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-doc-step)',
      lineHeight: 1.8,
      color: 'var(--ink)'
    }
  }, label), (condition || backTo || sub) && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 7,
      marginTop: 9
    }
  }, condition && /*#__PURE__*/React.createElement(Badge, {
    tone: "cond"
  }, "\u0627\u06AF\u0631: ", condition), backTo && /*#__PURE__*/React.createElement(Badge, {
    tone: "back"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "backToStep",
    size: 16
  }), "\u0628\u0631\u06AF\u0631\u062F \u0628\u0647 \u0645\u0631\u062D\u0644\u0647\u0654 ", __ds_scope.toFa(backTo)), sub && /*#__PURE__*/React.createElement(Badge, {
    tone: "sub"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevronEnd",
    size: 20,
    strokeWidth: 2.6
  }), "\u0645\u0631\u0627\u062D\u0644 \u0627\u06CC\u0646 \u06A9\u0627\u0631 \u0631\u0627 \u0628\u0628\u06CC\u0646"))), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 'none',
      color: 'var(--violet)',
      display: 'flex',
      marginTop: 9,
      transition: 'transform var(--duration-chev)',
      transform: open ? 'rotate(-90deg)' : undefined
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevronStart",
    size: 20,
    strokeWidth: 2.6
  }))), open && !sub && /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '15px 18px 18px',
      margin: '0 18px',
      borderTop: '2px dashed var(--hair)'
    }
  }, actor && /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 'var(--fs-sm)',
      fontWeight: 'var(--fw-extrabold)',
      color: 'var(--text-muted)',
      marginBottom: 5
    }
  }, "\u0627\u06CC\u0646 \u06A9\u0627\u0631 \u0631\u0627 \u0686\u0647 \u06A9\u0633\u06CC \u0627\u0646\u062C\u0627\u0645 \u0645\u06CC\u200C\u062F\u0647\u062F\u061F"), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 'var(--fs-doc-body)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--violet)',
      background: 'var(--tile-v)',
      borderRadius: 'var(--radius-md)',
      padding: '8px 14px'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "userBust",
    size: 19
  }), actor)), description && /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 'var(--fs-sm)',
      fontWeight: 'var(--fw-extrabold)',
      color: 'var(--text-muted)',
      marginBottom: 5
    }
  }, "\u062A\u0648\u0636\u06CC\u062D \u06A9\u0627\u0631"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-doc-body)',
      color: 'var(--text-body)',
      lineHeight: 'var(--lh-looser)'
    }
  }, description))));
}
function Badge({
  tone,
  children
}) {
  const tones = {
    cond: {
      color: 'var(--warn)',
      background: 'var(--tile-warn)'
    },
    back: {
      color: 'var(--conflict)',
      background: 'var(--tile-c)'
    },
    sub: {
      color: '#fff',
      background: 'var(--violet)'
    }
  };
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 13.5,
      fontWeight: 'var(--fw-bold)',
      borderRadius: 'var(--radius-pill)',
      padding: '4px 12px',
      ...tones[tone]
    }
  }, children);
}
Object.assign(__ds_scope, { StepCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/guide/StepCard.jsx", error: String((e && e.message) || e) }); }

// components/shell/ToolGroup.jsx
try { (() => {
/** The segmented cluster on the flow toolbar: a --tile-v2 tray, 5px padding, holding
 *  white 34px buttons. Used for undo/redo, pointer mode, layout, and add-node. */
function ToolGroup({
  children,
  gap = 3,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap,
      background: 'var(--tile-v2)',
      borderRadius: 'var(--radius-md)',
      padding: 5,
      ...style
    }
  }, children);
}
function ToolButton({
  icon,
  label,
  active = false,
  disabled = false,
  title,
  onClick,
  style
}) {
  const wide = !!label;
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    disabled: disabled,
    title: title,
    "aria-label": title,
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      width: wide ? undefined : 34,
      height: wide ? undefined : 34,
      padding: wide ? '7px 11px' : 0,
      borderRadius: 'var(--radius-sm)',
      border: 0,
      background: active ? 'var(--violet)' : '#fff',
      color: disabled ? 'var(--text-disabled)' : active ? '#fff' : 'var(--violet)',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-sm2)',
      fontWeight: 'var(--fw-semibold)',
      cursor: disabled ? 'default' : 'pointer',
      whiteSpace: 'nowrap',
      ...style
    }
  }, icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: wide ? 14 : 16,
    strokeWidth: 2.2
  }), label);
}

/** The thin divider between two buttons inside a group. */
function ToolDivider() {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 18,
      background: '#D9CEF0'
    }
  });
}
Object.assign(__ds_scope, { ToolGroup, ToolButton, ToolDivider });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/ToolGroup.jsx", error: String((e && e.message) || e) }); }

// components/shell/TopBar.jsx
try { (() => {
/** The app bar: logo + brand block, a hairline, back, breadcrumb, then the review
 *  inbox (with its coral count badge) and the user avatar. 38px logo, 11px radius. */
function TopBar({
  logoSrc,
  brand = 'اینجا فست‌فود',
  tagline = 'سامانهٔ فرآیندها',
  pending = 0,
  avatar = 'آ',
  onLogoClick,
  onInbox,
  back,
  breadcrumb,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      padding: '12px var(--pad-topbar)',
      background: '#fff',
      borderBottom: '1px solid var(--warm)',
      flex: 'none',
      zIndex: 20,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: onLogoClick,
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: 'pointer'
    }
  }, logoSrc ? /*#__PURE__*/React.createElement("img", {
    src: logoSrc,
    alt: "",
    style: {
      width: 38,
      height: 38,
      borderRadius: 11,
      objectFit: 'cover'
    }
  }) : /*#__PURE__*/React.createElement("div", {
    style: {
      width: 38,
      height: 38,
      borderRadius: 11,
      background: 'var(--violet)',
      color: 'var(--coral)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 11
    }
  }, "INJA"), /*#__PURE__*/React.createElement("div", {
    style: {
      lineHeight: 1.25
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-body)',
      color: 'var(--ink)'
    }
  }, brand), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-micro)',
      color: 'var(--text-muted)'
    }
  }, tagline))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 1,
      height: 26,
      background: '#EDE5F5',
      margin: '0 4px'
    }
  }), back, breadcrumb, /*#__PURE__*/React.createElement("div", {
    style: {
      marginInlineStart: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onInbox,
    title: "\u0635\u0646\u062F\u0648\u0642 \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC",
    style: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 13px',
      fontFamily: 'var(--font-sans)',
      fontSize: 'var(--fs-sm2)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--violet)',
      background: '#fff',
      border: '1.5px solid var(--line)',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "inbox",
    size: 16
  }), "\u0635\u0646\u062F\u0648\u0642 \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC", pending > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: -6,
      left: -6,
      minWidth: 19,
      height: 19,
      padding: '0 4px',
      background: 'var(--coral)',
      color: '#fff',
      borderRadius: '50%',
      fontSize: 'var(--fs-micro)',
      fontWeight: 'var(--fw-bold)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      border: '2px solid #fff'
    }
  }, __ds_scope.toFa(pending))), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      borderRadius: 'var(--radius-control)',
      background: 'var(--tile-v)',
      color: 'var(--violet)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-sm)'
    }
  }, avatar)));
}

/** «دپارتمان‌ها / سالن / پذیرش مهمان» — the trail, last crumb ink and semibold. */
function Breadcrumb({
  crumbs = [],
  onNavigate,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 'var(--fs-sm2)',
      color: 'var(--text-muted)',
      flexWrap: 'wrap',
      ...style
    }
  }, crumbs.map((c, i) => {
    const last = i === crumbs.length - 1;
    return /*#__PURE__*/React.createElement("span", {
      key: c.label + i,
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 6
      }
    }, i > 0 && /*#__PURE__*/React.createElement("span", {
      style: {
        color: 'var(--text-faint)'
      }
    }, "/"), /*#__PURE__*/React.createElement("a", {
      onClick: () => onNavigate && onNavigate(c, i),
      style: {
        cursor: 'pointer',
        color: last ? 'var(--ink)' : 'var(--text-muted)',
        fontWeight: last ? 'var(--fw-semibold)' : undefined
      }
    }, c.label));
  }));
}
Object.assign(__ds_scope, { TopBar, Breadcrumb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/shell/TopBar.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/DepartmentCard.jsx
try { (() => {
/** The feature card of the departments grid: 4px accent bar, ghosted index numeral,
 *  glyph tile, count chips, and a footer CTA with a circular chevron. Sits on the
 *  dark violet screen, so the card itself is cream. */
function DepartmentCard({
  code,
  name,
  index = 1,
  count = 0,
  subs = 0,
  conflicts = 0,
  cta = 'مشاهدهٔ فرآیندها',
  onClick,
  style
}) {
  const isCoral = __ds_scope.InjaDeptAccent[code] === 'coral';
  const accent = isCoral ? 'var(--conflict)' : 'var(--violet)';
  return /*#__PURE__*/React.createElement(__ds_scope.Card, {
    onDark: true,
    hoverLift: true,
    radius: "var(--radius-card-lg)",
    onClick: onClick,
    style: {
      position: 'relative',
      overflow: 'hidden',
      padding: 22,
      cursor: 'pointer',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 0,
      insetInline: 0,
      height: 4,
      background: accent
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      top: 14,
      left: 20,
      fontSize: 46,
      fontWeight: 'var(--fw-extrabold)',
      lineHeight: 1,
      pointerEvents: 'none',
      color: isCoral ? 'var(--dept-numeral-coral)' : 'var(--dept-numeral-violet)'
    }
  }, __ds_scope.pad2Fa(index)), /*#__PURE__*/React.createElement(__ds_scope.IconTile, {
    dept: code
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 18,
      color: 'var(--ink)',
      marginTop: 16
    }
  }, "\u062F\u067E\u0627\u0631\u062A\u0645\u0627\u0646 ", name), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      flexWrap: 'wrap',
      marginTop: 11,
      minHeight: 24
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 'var(--fs-xs)',
      fontWeight: 'var(--fw-semibold)',
      color: '#6B5CA5',
      background: 'var(--tile-v3)',
      padding: '4px 10px',
      borderRadius: 'var(--radius-pill)'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "file",
    size: 12
  }), __ds_scope.toFa(count), " \u0641\u0631\u0622\u06CC\u0646\u062F"), subs > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-xxs)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--warn)',
      background: 'var(--tile-warn)',
      padding: '4px 9px',
      borderRadius: 'var(--radius-pill)'
    }
  }, __ds_scope.toFa(subs), " \u0632\u06CC\u0631\u0641\u0631\u0622\u06CC\u0646\u062F"), conflicts > 0 && /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 'var(--fs-xxs)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--conflict)',
      background: 'var(--tile-c)',
      padding: '4px 9px',
      borderRadius: 'var(--radius-pill)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 6,
      height: 6,
      borderRadius: '50%',
      background: 'var(--coral)'
    }
  }), __ds_scope.toFa(conflicts), " \u062A\u0639\u0627\u0631\u0636")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 16,
      paddingTop: 15,
      borderTop: '1px solid var(--hair)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-sm2)',
      fontWeight: 'var(--fw-bold)',
      color: accent
    }
  }, cta), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 34,
      height: 34,
      flex: 'none',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: accent,
      background: isCoral ? '#FFF0EE' : '#F3EDFC'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "chevronStart",
    size: 16,
    strokeWidth: 2.4
  }))));
}
Object.assign(__ds_scope, { DepartmentCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/DepartmentCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/Idef0Diagram.jsx
try { (() => {
const Side = ({
  caption,
  items,
  kind,
  column,
  direction = 'column'
}) => /*#__PURE__*/React.createElement("div", {
  style: {
    gridColumn: column,
    textAlign: 'center',
    minWidth: 0
  }
}, caption && /*#__PURE__*/React.createElement("div", {
  style: {
    fontSize: 'var(--fs-xxs)',
    color: 'var(--text-muted)',
    marginBottom: 6
  }
}, caption), /*#__PURE__*/React.createElement("div", {
  style: {
    display: 'flex',
    flexDirection: direction,
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: direction === 'row' ? 'wrap' : undefined
  }
}, items.map((t, i) => /*#__PURE__*/React.createElement(__ds_scope.Chip, {
  key: i,
  kind: kind
}, t))));

/** The A-0 context box of a process: controls above, inputs entering from the right
 *  (RTL), outputs leaving left, mechanisms below. */
function Idef0Diagram({
  name,
  id,
  icom = {
    inputs: [],
    controls: [],
    outputs: [],
    mechanisms: []
  },
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    dir: "rtl",
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1.4fr 1fr',
      gap: 14,
      alignItems: 'center',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: 2,
      gridRow: 1,
      textAlign: 'center',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xxs)',
      color: 'var(--text-muted)',
      marginBottom: 6
    }
  }, "\u06A9\u0646\u062A\u0631\u0644\u200C\u0647\u0627 \u2193"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'center'
    }
  }, icom.controls.map((t, i) => /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    key: i,
    kind: "control"
  }, t)))), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: 3,
      gridRow: 2
    }
  }, /*#__PURE__*/React.createElement(Side, {
    caption: "\u0648\u0631\u0648\u062F\u06CC\u200C\u0647\u0627 \u2192",
    items: icom.inputs,
    kind: "input"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: 2,
      gridRow: 2,
      background: 'var(--violet)',
      borderRadius: 'var(--radius-tile)',
      padding: '22px 16px',
      textAlign: 'center',
      color: '#fff',
      boxShadow: 'var(--shadow-violet)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-lg)'
    }
  }, name), /*#__PURE__*/React.createElement("div", {
    dir: "ltr",
    style: {
      fontFamily: 'var(--font-mono)',
      fontSize: 'var(--fs-xxs)',
      color: 'var(--violet-on-violet)',
      marginTop: 6
    }
  }, "A-0 \xB7 ", id)), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: 1,
      gridRow: 2
    }
  }, /*#__PURE__*/React.createElement(Side, {
    caption: "\u2190 \u062E\u0631\u0648\u062C\u06CC\u200C\u0647\u0627",
    items: icom.outputs,
    kind: "output"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      gridColumn: 2,
      gridRow: 3,
      textAlign: 'center',
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: 6,
      justifyContent: 'center'
    }
  }, icom.mechanisms.map((t, i) => /*#__PURE__*/React.createElement(__ds_scope.Chip, {
    key: i,
    kind: "mech"
  }, t))), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xxs)',
      color: 'var(--text-muted)',
      marginTop: 6
    }
  }, "\u2191 \u0645\u06A9\u0627\u0646\u06CC\u0632\u0645\u200C\u0647\u0627")));
}
Object.assign(__ds_scope, { Idef0Diagram });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/Idef0Diagram.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/KpiCard.jsx
try { (() => {
/** A KPI on the process summary: name, optional coral target chip, definition. */
function KpiCard({
  name,
  target,
  definition,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--warm)',
      borderRadius: 'var(--radius-tile)',
      padding: '16px 18px',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-body)',
      color: 'var(--ink)'
    }
  }, name), target && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--conflict)',
      background: 'var(--tile-c)',
      padding: '2px 10px',
      borderRadius: 'var(--radius-control)',
      flex: 'none'
    }
  }, target)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-muted)',
      marginTop: 8,
      lineHeight: 'var(--lh-relaxed)'
    }
  }, definition));
}
Object.assign(__ds_scope, { KpiCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/KpiCard.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/ProcessRow.jsx
try { (() => {
/** One row of the process list: order position, id, name, derived tag, summary,
 *  activity count, then the two navigations and the destructive icon button. */
function ProcessRow({
  id,
  name,
  summary,
  position,
  tag,
  activities = 0,
  tombstoned = false,
  supersededBy = [],
  onSummary,
  onFlow,
  onDelete,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '1px solid var(--warm)',
      borderRadius: 'var(--radius-card)',
      padding: '17px 19px',
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      boxShadow: 'var(--shadow-card)',
      opacity: tombstoned ? .6 : 1,
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap'
    }
  }, position != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-sm2)',
      color: 'var(--violet)',
      minWidth: 18,
      textAlign: 'center',
      flex: 'none'
    }
  }, __ds_scope.toFa(position)), /*#__PURE__*/React.createElement(__ds_scope.IdBadge, null, id), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-lg)',
      color: 'var(--ink)'
    }
  }, name), tag && /*#__PURE__*/React.createElement(__ds_scope.ProcessTag, {
    kind: tag.kind
  }, tag.label)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      color: 'var(--text-muted)',
      marginTop: 6,
      lineHeight: 'var(--lh-snug)'
    }
  }, summary), tombstoned && supersededBy.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      color: 'var(--text-muted)',
      marginTop: 6,
      display: 'flex',
      gap: 8,
      alignItems: 'center',
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("span", null, "\u062C\u0627\u0646\u0634\u06CC\u0646:"), supersededBy.map(h => /*#__PURE__*/React.createElement("span", {
    key: h,
    dir: "ltr",
    style: {
      fontFamily: 'var(--font-mono)',
      color: 'var(--violet)',
      textDecoration: 'underline dotted'
    }
  }, h)))), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      flex: 'none',
      minWidth: 52
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 17,
      color: 'var(--violet)'
    }
  }, __ds_scope.toFa(activities)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10,
      color: 'var(--text-faint)'
    }
  }, "\u0641\u0639\u0627\u0644\u06CC\u062A")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 8,
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "ghost",
    size: "sm",
    onClick: onSummary
  }, "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u06A9\u0644\u06CC"), /*#__PURE__*/React.createElement(__ds_scope.Button, {
    variant: "violet",
    size: "sm",
    onClick: onFlow
  }, "\u0641\u0644\u0648\u0686\u0627\u0631\u062A"), /*#__PURE__*/React.createElement("button", {
    onClick: onDelete,
    title: tombstoned ? 'حذف دائمی فرآیند' : 'حذف فرآیند',
    "aria-label": "\u062D\u0630\u0641 \u0641\u0631\u0622\u06CC\u0646\u062F",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 38,
      flex: 'none',
      border: '1.5px solid var(--border-danger)',
      background: 'var(--tile-c2)',
      borderRadius: 'var(--radius-input)',
      color: 'var(--conflict)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "trash",
    size: 16
  }))));
}
Object.assign(__ds_scope, { ProcessRow });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/ProcessRow.jsx", error: String((e && e.message) || e) }); }

// components/surfaces/StatCard.jsx
try { (() => {
/** The small header statistic on the departments screen: big extrabold value,
 *  11.5px semibold caption. Cream on the dark screen; add a coral dot when the
 *  value is an open-conflict count above zero. */
function StatCard({
  value,
  label,
  tone = 'violet',
  dot = false,
  style
}) {
  const color = tone === 'coral' ? 'var(--conflict)' : tone === 'ok' ? 'var(--green)' : tone === 'ink' ? 'var(--ink)' : 'var(--violet)';
  return /*#__PURE__*/React.createElement("div", {
    style: {
      background: 'var(--bg)',
      border: '1px solid var(--warm)',
      borderRadius: 'var(--radius-card)',
      padding: '14px 20px',
      minWidth: 96,
      boxShadow: 'var(--shadow-stat-dark)',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 27,
      lineHeight: 1,
      color
    }
  }, value), dot && /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--coral)',
      boxShadow: 'var(--ring-conflict-dot)'
    }
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xs)',
      color: 'var(--text-muted)',
      marginTop: 5,
      fontWeight: 'var(--fw-semibold)'
    }
  }, label));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/surfaces/StatCard.jsx", error: String((e && e.message) || e) }); }

// ui_kits/panel/DepartmentInfo.jsx
try { (() => {
const {
  Button,
  Card,
  IconTile,
  Icon,
  EmptyState
} = window.InjaFoodDesignSystem_1ef55d;
const toFaI = x => String(x).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
function DepartmentInfoScreen({
  dept,
  overview
}) {
  const [open, setOpen] = React.useState(new Set([0]));
  const toggle = i => setOpen(s => {
    const n = new Set(s);
    n.has(i) ? n.delete(i) : n.add(i);
    return n;
  });
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '30px 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-list)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(IconTile, {
    dept: dept.code
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-h2)',
      color: 'var(--ink)'
    }
  }, overview.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      color: 'var(--text-faint)',
      marginTop: 4
    }
  }, "\u0622\u062E\u0631\u06CC\u0646 \u0628\u0647\u200C\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC: ", overview.updated_at))), /*#__PURE__*/React.createElement(Button, {
    variant: "violet"
  }, "\u0648\u06CC\u0631\u0627\u06CC\u0634")), /*#__PURE__*/React.createElement("section", {
    style: {
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-lg)',
      color: 'var(--ink)',
      marginBottom: 12
    }
  }, "\u0645\u0639\u0631\u0641\u06CC \u062F\u067E\u0627\u0631\u062A\u0645\u0627\u0646"), /*#__PURE__*/React.createElement(Card, {
    padding: "16px 18px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-body)',
      color: 'var(--text-muted)',
      lineHeight: 'var(--lh-relaxed)',
      whiteSpace: 'pre-line'
    }
  }, overview.description))), /*#__PURE__*/React.createElement("section", {
    style: {
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-lg)',
      color: 'var(--ink)',
      marginBottom: 12
    }
  }, "\u0648\u0627\u062D\u062F\u0647\u0627\u06CC \u0632\u06CC\u0631\u0645\u062C\u0645\u0648\u0639\u0647"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12
    }
  }, overview.sub_units.map((s, i) => /*#__PURE__*/React.createElement(Card, {
    key: i,
    padding: "15px 17px"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-body)',
      color: 'var(--ink)'
    }
  }, s.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-body)',
      color: 'var(--text-muted)',
      marginTop: 6,
      lineHeight: 'var(--lh-relaxed)'
    }
  }, s.description))))), /*#__PURE__*/React.createElement("section", {
    style: {
      marginBottom: 28
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-lg)',
      color: 'var(--ink)',
      marginBottom: 12
    }
  }, "\u067E\u0631\u0633\u0646\u0644 \u0648 \u0634\u0631\u062D \u0648\u0638\u0627\u06CC\u0641"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, overview.personnel.map((pr, i) => {
    const isOpen = open.has(i);
    return /*#__PURE__*/React.createElement(Card, {
      key: i,
      padding: "16px 18px"
    }, /*#__PURE__*/React.createElement("button", {
      onClick: () => toggle(i),
      "aria-expanded": isOpen,
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        textAlign: 'right',
        background: 'none',
        border: 0,
        padding: 0,
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontWeight: 'var(--fw-bold)',
        fontSize: 'var(--fs-body)',
        color: 'var(--ink)'
      }
    }, pr.role), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flex: 'none',
        color: 'var(--text-muted)'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        fontSize: 'var(--fs-xxs)',
        fontWeight: 'var(--fw-semibold)'
      }
    }, toFaI(pr.duties.length), " \u0648\u0638\u06CC\u0641\u0647 \xB7 ", toFaI(pr.kpi.length), " \u0634\u0627\u062E\u0635"), /*#__PURE__*/React.createElement("span", {
      style: {
        display: 'flex',
        transition: 'transform var(--duration)',
        transform: isOpen ? 'rotate(180deg)' : undefined
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "chevronDown",
      size: 16,
      strokeWidth: 2.2
    })))), isOpen && /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 12
      }
    }, pr.duties.map((d, j) => /*#__PURE__*/React.createElement(Pill, {
      key: j
    }, d))), /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--fs-xxs)',
        fontWeight: 'var(--fw-semibold)',
        color: 'var(--text-muted)',
        marginTop: 14,
        marginBottom: 6
      }
    }, "\u0634\u0627\u062E\u0635\u200C\u0647\u0627\u06CC \u06A9\u0644\u06CC\u062F\u06CC \u0639\u0645\u0644\u06A9\u0631\u062F"), pr.kpi.length ? /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6
      }
    }, pr.kpi.map((k, j) => /*#__PURE__*/React.createElement(Pill, {
      key: j
    }, k))) : /*#__PURE__*/React.createElement("div", {
      style: {
        fontSize: 'var(--fs-sm2)',
        color: 'var(--text-faint)',
        padding: '4px 2px'
      }
    }, "\u0634\u0627\u062E\u0635\u06CC \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A.")));
  })))));
}
function Pill({
  children
}) {
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: 'var(--violet)',
      background: 'var(--tile-v2)',
      padding: '6px 12px',
      borderRadius: 999,
      lineHeight: 'var(--lh-relaxed)'
    }
  }, children);
}
Object.assign(window, {
  DepartmentInfoScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/panel/DepartmentInfo.jsx", error: String((e && e.message) || e) }); }

// ui_kits/panel/Departments.jsx
try { (() => {
const {
  DepartmentCard,
  StatCard,
  Fa
} = window.InjaFoodDesignSystem_1ef55d;
const toFa = x => String(x).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
function DepartmentsScreen({
  departments,
  onOpen
}) {
  const totalProc = departments.reduce((a, d) => a + d.count, 0);
  const totalConflicts = departments.reduce((a, d) => a + d.conflicts, 0);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '38px 40px 48px',
      background: 'var(--ink)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-departments)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 24,
      flexWrap: 'wrap',
      marginBottom: 30
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 11
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 2,
      background: 'var(--coral)',
      borderRadius: 2
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 'var(--fs-xs)',
      fontWeight: 'var(--fw-bold)',
      letterSpacing: 'var(--tracking-eyebrow)',
      color: 'var(--violet-on-dark)'
    }
  }, "INJA FOOD \xB7 \u0645\u0633\u062A\u0646\u062F\u0633\u0627\u0632\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-display)',
      color: 'var(--bg)',
      letterSpacing: 'var(--tracking-display)'
    }
  }, "\u062F\u067E\u0627\u0631\u062A\u0645\u0627\u0646\u200C\u0647\u0627"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-body)',
      color: 'var(--violet-on-dark-body)',
      marginTop: 8,
      maxWidth: 440,
      lineHeight: 'var(--lh-normal)'
    }
  }, "\u0646\u0642\u0634\u0647\u0654 \u0641\u0631\u0622\u06CC\u0646\u062F\u0647\u0627\u06CC \u0645\u062C\u0645\u0648\u0639\u0647 \u0628\u0647 \u062A\u0641\u06A9\u06CC\u06A9 \u0648\u0627\u062D\u062F. \u06CC\u06A9 \u062F\u067E\u0627\u0631\u062A\u0645\u0627\u0646 \u0631\u0627 \u0628\u0631\u0627\u06CC \u0645\u0631\u0648\u0631 \u0641\u0631\u0622\u06CC\u0646\u062F\u0647\u0627\u06CC \u0645\u0633\u062A\u0646\u062F\u0634\u062F\u0647\u060C \u06A9\u0627\u0631\u062A \u062E\u0644\u0627\u0635\u0647 \u0648 \u0641\u0644\u0648\u0686\u0627\u0631\u062A \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 12,
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    value: toFa(totalProc),
    label: "\u0641\u0631\u0622\u06CC\u0646\u062F \u0645\u0633\u062A\u0646\u062F",
    tone: "violet"
  }), /*#__PURE__*/React.createElement(StatCard, {
    value: toFa(departments.length),
    label: "\u062F\u067E\u0627\u0631\u062A\u0645\u0627\u0646",
    tone: "ink"
  }), /*#__PURE__*/React.createElement(StatCard, {
    value: toFa(totalConflicts),
    label: "\u062A\u0639\u0627\u0631\u0636 \u0628\u0627\u0632",
    tone: totalConflicts ? 'coral' : 'ok',
    dot: totalConflicts > 0
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gap: 18
    }
  }, departments.map((d, i) => /*#__PURE__*/React.createElement(DepartmentCard, {
    key: d.code,
    code: d.code,
    name: d.name,
    index: i + 1,
    count: d.count,
    subs: d.subs,
    conflicts: d.conflicts,
    onClick: () => onOpen(d)
  })))));
}
Object.assign(window, {
  DepartmentsScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/panel/Departments.jsx", error: String((e && e.message) || e) }); }

// ui_kits/panel/FlowScreen.jsx
try { (() => {
const DS = window.InjaFoodDesignSystem_1ef55d;
const {
  Button,
  IdBadge,
  ActivityNode,
  TerminalNode,
  JunctionNode,
  JunctionLegend,
  DetailDrawer,
  ToolGroup,
  ToolButton,
  ToolDivider,
  ConflictCard,
  Icon
} = DS;
function FlowScreen({
  flow,
  onOpenSub,
  onToast
}) {
  const [editing, setEditing] = React.useState(false);
  const [mode, setMode] = React.useState('pan');
  const [detailId, setDetailId] = React.useState(null);
  const [sizes, setSizes] = React.useState({});
  const refs = React.useRef({});
  React.useLayoutEffect(() => {
    const next = {};
    for (const n of flow.nodes) {
      const el = refs.current[n.id];
      if (el) next[n.id] = {
        w: el.offsetWidth,
        h: el.offsetHeight
      };
    }
    setSizes(next);
  }, [flow]);
  const node = flow.nodes.find(n => n.id === detailId);
  const conflicts = flow.pending.filter(p => p.node === detailId);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '11px 22px',
      background: '#fff',
      borderBottom: '1px solid var(--warm)',
      flex: 'none'
    }
  }, !editing && /*#__PURE__*/React.createElement(ToolGroup, null, /*#__PURE__*/React.createElement(ToolButton, {
    icon: "chevronNext",
    title: "\u0641\u0631\u0622\u06CC\u0646\u062F \u0628\u0639\u062F\u06CC"
  }), /*#__PURE__*/React.createElement(ToolDivider, null), /*#__PURE__*/React.createElement(ToolButton, {
    icon: "chevronPrev",
    title: "\u0641\u0631\u0622\u06CC\u0646\u062F \u0642\u0628\u0644\u06CC",
    disabled: true
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(IdBadge, {
    tone: "violet"
  }, flow.id), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-lg)',
      color: 'var(--ink)'
    }
  }, flow.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      marginInlineStart: 'auto',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, !editing ? /*#__PURE__*/React.createElement(Button, {
    variant: "violet",
    onClick: () => setEditing(true)
  }, "\u0648\u06CC\u0631\u0627\u06CC\u0634") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(ToolGroup, null, /*#__PURE__*/React.createElement(ToolButton, {
    icon: "undo",
    title: "\u0648\u0627\u06AF\u0631\u062F",
    disabled: true
  }), /*#__PURE__*/React.createElement(ToolButton, {
    icon: "redo",
    title: "\u0627\u0632\u0646\u0648",
    disabled: true
  })), /*#__PURE__*/React.createElement(ToolGroup, null, /*#__PURE__*/React.createElement(ToolButton, {
    icon: "move",
    title: "\u062D\u0627\u0644\u062A \u062C\u0627\u0628\u0647\u200C\u062C\u0627\u06CC\u06CC",
    active: mode === 'pan',
    onClick: () => setMode('pan')
  }), /*#__PURE__*/React.createElement(ToolButton, {
    icon: "cursor",
    title: "\u062D\u0627\u0644\u062A \u0627\u0646\u062A\u062E\u0627\u0628",
    active: mode === 'select',
    onClick: () => setMode('select')
  })), /*#__PURE__*/React.createElement(ToolGroup, {
    gap: 7
  }, /*#__PURE__*/React.createElement(ToolButton, {
    icon: "relayout",
    label: "\u0686\u06CC\u062F\u0645\u0627\u0646"
  })), /*#__PURE__*/React.createElement(ToolGroup, {
    gap: 7
  }, /*#__PURE__*/React.createElement(ToolButton, {
    icon: "addActivity",
    label: "\u0641\u0639\u0627\u0644\u06CC\u062A"
  }), /*#__PURE__*/React.createElement(ToolButton, {
    icon: "junction",
    label: "\u0627\u062A\u0635\u0627\u0644"
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    onClick: () => setEditing(false)
  }, "\u0627\u0646\u0635\u0631\u0627\u0641"), /*#__PURE__*/React.createElement(Button, {
    variant: "green",
    size: "sm",
    icon: "check",
    onClick: () => {
      setEditing(false);
      onToast('فلوچارت ذخیره شد');
    }
  }, "\u0630\u062E\u06CC\u0631\u0647")))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minHeight: 0,
      position: 'relative',
      overflow: 'auto',
      backgroundImage: 'radial-gradient(#c9c2d6 1px, transparent 1px)',
      backgroundSize: '20px 20px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      width: 1340,
      height: 420,
      margin: '20px 0'
    }
  }, /*#__PURE__*/React.createElement(Edges, {
    flow: flow,
    sizes: sizes
  }), flow.nodes.map(n => /*#__PURE__*/React.createElement("div", {
    key: n.id,
    ref: el => {
      refs.current[n.id] = el;
    },
    onClick: () => {
      if (n.type === 'activity') {
        if (n.subprocess && !editing) onOpenSub(n.subprocess);else setDetailId(n.id);
      } else if (n.type === 'junction') setDetailId(n.id);
    },
    style: {
      position: 'absolute',
      left: n.pos.x,
      top: n.pos.y,
      cursor: 'pointer'
    }
  }, n.type === 'activity' && /*#__PURE__*/React.createElement(ActivityNode, {
    id: n.id,
    label: n.label,
    actor: n.actor,
    conflicts: n.conflicts ?? 0,
    hasSub: !!n.subprocess,
    highlighted: detailId === n.id,
    onOpenDetail: e => {
      setDetailId(n.id);
    }
  }), n.type === 'junction' && /*#__PURE__*/React.createElement(JunctionNode, {
    type: n.junctionType,
    highlighted: detailId === n.id
  }), (n.type === 'start' || n.type === 'end') && /*#__PURE__*/React.createElement(TerminalNode, {
    kind: n.type,
    label: n.label
  })))), /*#__PURE__*/React.createElement(JunctionLegend, {
    style: {
      position: 'absolute',
      bottom: 16,
      right: 16
    }
  }), /*#__PURE__*/React.createElement(Zoom, null), node && /*#__PURE__*/React.createElement(DetailDrawer, {
    id: node.id,
    label: node.label ?? 'دروازهٔ منطقی ' + node.junctionType,
    actor: node.actor,
    description: node.description,
    icom: node.icom,
    source: node.source,
    onClose: () => setDetailId(null),
    footer: editing ? /*#__PURE__*/React.createElement("button", {
      style: {
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '10px 0',
        borderRadius: 'var(--radius-input)',
        border: '1.5px solid var(--border-danger)',
        background: 'var(--tile-c2)',
        color: 'var(--conflict)',
        fontWeight: 'var(--fw-bold)',
        fontSize: 'var(--fs-sm2)',
        fontFamily: 'var(--font-sans)',
        cursor: 'pointer'
      }
    }, /*#__PURE__*/React.createElement(Icon, {
      name: "trashSmall",
      size: 15
    }), "\u062D\u0630\u0641 \u0627\u06CC\u0646 \u06AF\u0631\u0647") : null,
    style: {
      position: 'fixed',
      top: 118,
      bottom: 0
    }
  }, conflicts.length > 0 && /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      fontSize: 'var(--fs-xxs)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--conflict)',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "warning",
    size: 13,
    strokeWidth: 2.2
  }), "\u062A\u0639\u0627\u0631\u0636\u200C\u0647\u0627\u06CC \u0627\u06CC\u0646 \u0628\u0627\u06A9\u0633 (", '۰۱۲۳۴۵۶۷۸۹'[conflicts.length], ")"), conflicts.map((c, i) => /*#__PURE__*/React.createElement(ConflictCard, {
    key: i,
    compact: true,
    field: c.field,
    source: c.source,
    current: c.current,
    proposed: c.proposed,
    onAccept: () => onToast('پیشنهاد پذیرفته شد'),
    onReject: () => onToast('پیشنهاد رد شد'),
    style: {
      marginBottom: 10
    }
  }))))));
}

/** The edges: same stroke (#9B86D9), 2px, closed arrowhead, and white-ish label box
 *  as ui/src/flow/edges/edge-style.ts defines for screen and print alike. */
function Edges({
  flow,
  sizes
}) {
  const at = id => {
    const n = flow.nodes.find(x => x.id === id);
    const s = sizes[id] ?? {
      w: 170,
      h: 60
    };
    return {
      x: n.pos.x,
      y: n.pos.y,
      w: s.w,
      h: s.h
    };
  };
  return /*#__PURE__*/React.createElement("svg", {
    width: "1340",
    height: "420",
    style: {
      position: 'absolute',
      inset: 0,
      pointerEvents: 'none',
      overflow: 'visible'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("marker", {
    id: "inja-arrow",
    viewBox: "0 0 10 10",
    refX: "8",
    refY: "5",
    markerWidth: "6",
    markerHeight: "6",
    orient: "auto-start-reverse"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M0 0 L10 5 L0 10 z",
    fill: "#9B86D9"
  }))), flow.edges.map((e, i) => {
    const a = at(e.from),
      b = at(e.to);
    const x1 = a.x + a.w,
      y1 = a.y + a.h / 2,
      x2 = b.x,
      y2 = b.y + b.h / 2;
    const dx = Math.max(30, (x2 - x1) / 2);
    const d = 'M' + x1 + ',' + y1 + ' C' + (x1 + dx) + ',' + y1 + ' ' + (x2 - dx) + ',' + y2 + ' ' + x2 + ',' + y2;
    const mx = (x1 + x2) / 2,
      my = (y1 + y2) / 2;
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("path", {
      d: d,
      fill: "none",
      stroke: "#9B86D9",
      strokeWidth: "2",
      markerEnd: "url(#inja-arrow)"
    }), /*#__PURE__*/React.createElement("circle", {
      cx: x1,
      cy: y1,
      r: "4",
      fill: "#fff",
      stroke: "#9B86D9",
      strokeWidth: "1.5"
    }), e.label && /*#__PURE__*/React.createElement("foreignObject", {
      x: mx - 60,
      y: my - 14,
      width: "120",
      height: "28"
    }, /*#__PURE__*/React.createElement("div", {
      style: {
        display: 'flex',
        justifyContent: 'center'
      }
    }, /*#__PURE__*/React.createElement("span", {
      style: {
        background: 'rgba(255,255,255,.9)',
        color: 'var(--ink)',
        fontSize: 11,
        padding: '2px 8px',
        borderRadius: 6,
        fontFamily: 'var(--font-sans)',
        whiteSpace: 'nowrap'
      }
    }, e.label))));
  }));
}

/** React Flow's own zoom cluster, bottom-left. */
function Zoom() {
  const btn = {
    width: 26,
    height: 26,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#fefefe',
    border: 0,
    borderBottom: '1px solid #eee',
    color: '#555',
    cursor: 'pointer',
    fontSize: 13
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      bottom: 16,
      left: 16,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 0 2px 1px rgba(0,0,0,.08)',
      borderRadius: 2,
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("button", {
    style: btn
  }, "+"), /*#__PURE__*/React.createElement("button", {
    style: btn
  }, "\u2212"), /*#__PURE__*/React.createElement("button", {
    style: {
      ...btn,
      borderBottom: 0
    }
  }, "\u2922"));
}
Object.assign(window, {
  FlowScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/panel/FlowScreen.jsx", error: String((e && e.message) || e) }); }

// ui_kits/panel/Login.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const {
  Button,
  TextField
} = window.InjaFoodDesignSystem_1ef55d;
function LoginScreen({
  onLogin
}) {
  const [err, setErr] = React.useState(false);
  return /*#__PURE__*/React.createElement("div", {
    style: {
      minHeight: '100%',
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--login-bg)',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      width: 420,
      height: 420,
      borderRadius: '50%',
      background: 'var(--login-orb)',
      opacity: .55,
      top: -140,
      left: -110
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'absolute',
      width: 300,
      height: 300,
      borderRadius: '50%',
      background: 'var(--login-orb)',
      opacity: .5,
      bottom: -120,
      right: -90
    }
  }), /*#__PURE__*/React.createElement("form", {
    onSubmit: e => {
      e.preventDefault();
      onLogin();
    },
    style: {
      position: 'relative',
      width: 380,
      background: 'var(--bg)',
      borderRadius: 'var(--radius-panel)',
      padding: 32,
      boxShadow: 'var(--shadow-modal)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 14,
      marginBottom: 24
    }
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/inja-logo.jpg",
    alt: "\u0627\u06CC\u0646\u062C\u0627 \u0641\u0633\u062A\u200C\u0641\u0648\u062F",
    style: {
      width: 76,
      height: 76,
      borderRadius: 20,
      objectFit: 'cover'
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 19,
      color: 'var(--ink)'
    }
  }, "\u0627\u06CC\u0646\u062C\u0627 \u0641\u0633\u062A\u200C\u0641\u0648\u062F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      color: 'var(--text-muted)',
      marginTop: 4
    }
  }, "\u0633\u0627\u0645\u0627\u0646\u0647\u0654 \u0645\u0633\u062A\u0646\u062F\u0633\u0627\u0632\u06CC \u0641\u0631\u0622\u06CC\u0646\u062F\u0647\u0627"))), /*#__PURE__*/React.createElement(Label, null, "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC"), /*#__PURE__*/React.createElement(Input, {
    defaultValue: "analyst",
    placeholder: "analyst"
  }), /*#__PURE__*/React.createElement(Label, null, "\u06AF\u0630\u0631\u0648\u0627\u0698\u0647"), /*#__PURE__*/React.createElement(Input, {
    type: "password",
    placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
  }), err && /*#__PURE__*/React.createElement("div", {
    style: {
      color: 'var(--conflict)',
      fontSize: 12,
      marginBottom: 8
    }
  }, "\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u06AF\u0630\u0631\u0648\u0627\u0698\u0647 \u0646\u0627\u062F\u0631\u0633\u062A \u0627\u0633\u062A"), /*#__PURE__*/React.createElement(Button, {
    variant: "coral",
    type: "submit",
    block: true,
    size: "lg",
    style: {
      marginTop: 8
    }
  }, "\u0648\u0631\u0648\u062F \u0628\u0647 \u0633\u0627\u0645\u0627\u0646\u0647"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      marginTop: 16,
      fontSize: 11,
      color: 'var(--text-faint)'
    }
  }, "\u062F\u0633\u062A\u0631\u0633\u06CC \u062A\u06A9\u200C\u06A9\u0627\u0631\u0628\u0631\u0647 \xB7 \u0645\u062D\u0627\u0641\u0638\u062A\u200C\u0634\u062F\u0647 \u0628\u0627 \u0646\u0627\u0645\u200C\u06A9\u0627\u0631\u0628\u0631\u06CC \u0648 \u06AF\u0630\u0631\u0648\u0627\u0698\u0647")));
}
function Label({
  children
}) {
  return /*#__PURE__*/React.createElement("label", {
    style: {
      display: 'block',
      fontSize: 'var(--fs-sm2)',
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--violet)',
      marginBottom: 6
    }
  }, children);
}
function Input(props) {
  const [focus, setFocus] = React.useState(false);
  return /*#__PURE__*/React.createElement("input", _extends({}, props, {
    onFocus: () => setFocus(true),
    onBlur: () => setFocus(false),
    style: {
      width: '100%',
      boxSizing: 'border-box',
      padding: '12px 14px',
      border: '1.5px solid ' + (focus ? 'var(--coral)' : 'var(--line)'),
      borderRadius: 'var(--radius-md)',
      fontSize: 'var(--fs-body)',
      fontFamily: 'var(--font-sans)',
      color: 'var(--ink)',
      background: '#fff',
      outline: 'none',
      marginBottom: 16
    }
  }));
}
Object.assign(window, {
  LoginScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/panel/Login.jsx", error: String((e && e.message) || e) }); }

// ui_kits/panel/Modals.jsx
try { (() => {
const {
  Modal,
  Button,
  IdBadge,
  ConflictCard,
  IconTile,
  TextField,
  Icon,
  ProcessTag
} = window.InjaFoodDesignSystem_1ef55d;
const toFaM = x => String(x).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
function CreateProcessModal({
  deptName,
  nextId,
  onClose,
  onCreate
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    title: "\u0627\u06CC\u062C\u0627\u062F \u0641\u0631\u0622\u06CC\u0646\u062F \u062C\u062F\u06CC\u062F",
    subtitle: "\u0634\u0646\u0627\u0633\u0647 \u0628\u0647\u200C\u0635\u0648\u0631\u062A \u062E\u0648\u062F\u06A9\u0627\u0631 \u062A\u0648\u0633\u0637 \u0633\u0627\u0645\u0627\u0646\u0647 \u062A\u062E\u0635\u06CC\u0635 \u0645\u06CC\u200C\u06CC\u0627\u0628\u062F.",
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      block: true,
      onClick: onClose
    }, "\u0627\u0646\u0635\u0631\u0627\u0641"), /*#__PURE__*/React.createElement(Button, {
      variant: "coral",
      block: true,
      onClick: onCreate
    }, "\u0627\u06CC\u062C\u0627\u062F \u0648 \u0648\u06CC\u0631\u0627\u06CC\u0634"))
  }, /*#__PURE__*/React.createElement(FieldLabel, null, "\u062F\u067E\u0627\u0631\u062A\u0645\u0627\u0646"), /*#__PURE__*/React.createElement(Readonly, null, deptName), /*#__PURE__*/React.createElement(TextField, {
    label: "\u0646\u0627\u0645 \u0641\u0631\u0622\u06CC\u0646\u062F",
    placeholder: "\u0645\u062B\u0644\u0627\u064B: \u0641\u0631\u0622\u06CC\u0646\u062F \u06A9\u0646\u062A\u0631\u0644 \u06A9\u06CC\u0641\u06CC\u062A",
    style: {
      marginTop: 12
    }
  }), /*#__PURE__*/React.createElement(FieldLabel, {
    style: {
      marginTop: 12
    }
  }, "\u0634\u0646\u0627\u0633\u0647\u0654 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u06CC \u0633\u0627\u0645\u0627\u0646\u0647"), /*#__PURE__*/React.createElement(Readonly, {
    mono: true
  }, nextId));
}
function DeleteProcessModal({
  proc,
  onClose,
  onConfirm
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    width: 440,
    onClose: null,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
      onClick: onClose,
      style: ghostBtn
    }, "\u0627\u0646\u0635\u0631\u0627\u0641"), /*#__PURE__*/React.createElement("button", {
      onClick: onConfirm,
      style: dangerBtn
    }, "\u062D\u0630\u0641 \u06A9\u0627\u0645\u0644 \u0641\u0631\u0622\u06CC\u0646\u062F"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      paddingBottom: 4
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-h4)',
      color: 'var(--ink)',
      marginBottom: 8
    }
  }, "\u062D\u0630\u0641 \u06A9\u0627\u0645\u0644 \u0641\u0631\u0622\u06CC\u0646\u062F \xAB", proc.name, "\xBB\u061F"), /*#__PURE__*/React.createElement("div", {
    style: {
      marginBottom: 10
    }
  }, /*#__PURE__*/React.createElement(IdBadge, null, proc.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-muted)',
      lineHeight: 2
    }
  }, "\u06A9\u0644 \u0641\u0631\u0622\u06CC\u0646\u062F \u0647\u0645\u0631\u0627\u0647 \u0628\u0627 \u0641\u0644\u0648\u0686\u0627\u0631\u062A\u060C \u06AF\u0631\u0647\u200C\u0647\u0627\u060C KPI\u0647\u0627 \u0648 \u062A\u0639\u0627\u0631\u0636\u200C\u0647\u0627\u06CC\u0634 ", /*#__PURE__*/React.createElement("b", null, "\u0628\u0631\u0627\u06CC \u0647\u0645\u06CC\u0634\u0647 \u0648 \u0628\u062F\u0648\u0646 \u0627\u0645\u06A9\u0627\u0646 \u0628\u0627\u0632\u06CC\u0627\u0628\u06CC"), " \u062D\u0630\u0641 \u0645\u06CC\u200C\u0634\u0648\u062F \u0648 \u0627\u0632 \u0641\u0647\u0631\u0633\u062A \u062E\u0627\u0631\u062C \u0645\u06CC\u200C\u06AF\u0631\u062F\u062F. \u0634\u0646\u0627\u0633\u0647\u0654 \u0627\u06CC\u0646 \u0641\u0631\u0622\u06CC\u0646\u062F \u0646\u06CC\u0632 \u062F\u06CC\u06AF\u0631 \u0647\u0631\u06AF\u0632 \u062F\u0648\u0628\u0627\u0631\u0647 \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0646\u0645\u06CC\u200C\u0634\u0648\u062F.")));
}
function ReorderModal({
  deptName,
  processes,
  onClose,
  onSave
}) {
  const [seq, setSeq] = React.useState(processes.filter(p => !p.tombstoned));
  const [from, setFrom] = React.useState(null);
  const move = (a, b) => {
    if (a === b || b < 0 || b >= seq.length) return;
    const n = [...seq];
    const [r] = n.splice(a, 1);
    n.splice(b, 0, r);
    setSeq(n);
  };
  return /*#__PURE__*/React.createElement(Modal, {
    width: 560,
    title: 'ترتیب فرآیندهای ' + deptName,
    subtitle: toFaM(seq.length) + ' فرآیند · هر ردیف را بکشید و در جای دلخواه رها کنید.',
    onClose: onClose,
    footer: /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement(Button, {
      variant: "coral",
      block: true,
      onClick: onSave
    }, "\u0630\u062E\u06CC\u0631\u0647\u0654 \u062A\u0631\u062A\u06CC\u0628"), /*#__PURE__*/React.createElement(Button, {
      variant: "ghost",
      block: true,
      onClick: onClose
    }, "\u0627\u0646\u0635\u0631\u0627\u0641"))
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 6
    }
  }, seq.map((p, i) => /*#__PURE__*/React.createElement("div", {
    key: p.id,
    draggable: true,
    onDragStart: () => setFrom(i),
    onDragOver: e => e.preventDefault(),
    onDrop: () => {
      if (from !== null) move(from, i);
      setFrom(null);
    },
    onDragEnd: () => setFrom(null),
    style: {
      background: '#fff',
      border: '1px solid ' + (from === i ? 'var(--coral)' : 'var(--warm)'),
      borderRadius: 'var(--radius-md)',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      cursor: 'grab',
      opacity: from === i ? .4 : 1
    }
  }, /*#__PURE__*/React.createElement("span", {
    "aria-hidden": true,
    style: {
      color: 'var(--text-faint)',
      fontSize: 15,
      lineHeight: 1,
      userSelect: 'none'
    }
  }, "\u28FF"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-sm2)',
      color: 'var(--violet)',
      minWidth: 20,
      textAlign: 'center'
    }
  }, toFaM(i + 1)), /*#__PURE__*/React.createElement(IdBadge, null, p.id), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-sm2)',
      color: 'var(--ink)',
      flex: 1,
      minWidth: 0,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, p.name), p.tag && p.tag.kind === 'sub' && /*#__PURE__*/React.createElement(ProcessTag, {
    kind: "sub"
  }, "\u0632\u06CC\u0631\u0641\u0631\u0622\u06CC\u0646\u062F")))));
}
function InboxModal({
  rows,
  onClose,
  onDecide
}) {
  return /*#__PURE__*/React.createElement(Modal, {
    width: 640,
    radius: "var(--radius-card-lg)",
    title: "\u0635\u0646\u062F\u0648\u0642 \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC \u062A\u0639\u0627\u0631\u0636\u200C\u0647\u0627",
    subtitle: "\u0645\u0642\u062F\u0627\u0631 \u0641\u0639\u0644\u06CC \u062F\u0631 \u0628\u0631\u0627\u0628\u0631 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F \u2014 \u062A\u0627 \u062A\u0635\u0645\u06CC\u0645 \u0634\u0645\u0627 \u0645\u0642\u062F\u0627\u0631 \u0627\u0635\u0644\u06CC \u062F\u0633\u062A\u200C\u0646\u062E\u0648\u0631\u062F\u0647 \u0645\u06CC\u200C\u0645\u0627\u0646\u062F.",
    onClose: onClose
  }, rows.length === 0 ? /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '40px 0',
      color: 'var(--text-faint)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      fontWeight: 'var(--fw-semibold)',
      color: 'var(--text-muted)'
    }
  }, "\u062A\u0639\u0627\u0631\u0636 \u0628\u0627\u0632\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      marginTop: 4
    }
  }, "\u0647\u0645\u0647\u0654 \u067E\u06CC\u0634\u0646\u0647\u0627\u062F\u0647\u0627 \u0631\u0633\u06CC\u062F\u06AF\u06CC \u0634\u062F\u0647\u200C\u0627\u0646\u062F.")) : /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, rows.map((c, i) => /*#__PURE__*/React.createElement(ConflictCard, {
    key: i,
    nodeId: c.node,
    field: c.field,
    source: c.source,
    current: c.current,
    proposed: c.proposed,
    onAccept: () => onDecide('accept'),
    onReject: () => onDecide('reject'),
    action: /*#__PURE__*/React.createElement("button", {
      style: {
        fontSize: 'var(--fs-xxs)',
        fontWeight: 'var(--fw-semibold)',
        color: 'var(--violet)',
        border: '1.5px solid var(--line)',
        background: '#fff',
        borderRadius: 8,
        padding: '6px 10px',
        cursor: 'pointer',
        fontFamily: 'var(--font-sans)'
      }
    }, "\u0645\u0634\u0627\u0647\u062F\u0647 \u062F\u0631 \u0641\u0644\u0648\u0686\u0627\u0631\u062A")
  }))));
}
function ExportModal({
  kind,
  onClose
}) {
  const [ready, setReady] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setReady(true), 1400);
    return () => clearTimeout(t);
  }, []);
  const title = kind === 'steps' ? 'راهنمای گام‌به‌گام کار — برای پرسنل' : 'خروجی مستندات کامل — سند رسمی';
  const url = 'https://inja.local/exports/' + (kind === 'steps' ? 'steps' : 'flowchart') + '-dining-7f3a91.html';
  return /*#__PURE__*/React.createElement(Modal, {
    width: 520,
    radius: "var(--radius-card-lg)",
    blurScrim: true,
    onClose: onClose,
    title: ready ? 'خروجی آماده شد' : 'در حال آماده‌سازی خروجی…',
    subtitle: title,
    icon: /*#__PURE__*/React.createElement(IconTile, {
      name: ready ? 'check' : 'relayout',
      accent: ready ? 'ok' : 'violet',
      size: 40,
      radius: "var(--radius-md)"
    })
  }, !ready ? /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-muted)',
      lineHeight: 2
    }
  }, "\u0641\u0627\u06CC\u0644 \u062E\u0631\u0648\u062C\u06CC \u062F\u0631 \u062D\u0627\u0644 \u0633\u0627\u062E\u062A\u0647\u200C\u0634\u062F\u0646 \u0627\u0633\u062A\u061B \u0627\u06CC\u0646 \u067E\u0646\u062C\u0631\u0647 \u0628\u0647\u200C\u0645\u062D\u0636 \u0622\u0645\u0627\u062F\u0647\u200C\u0634\u062F\u0646\u060C \u0644\u06CC\u0646\u06A9 \u0631\u0627 \u0646\u0634\u0627\u0646 \u0645\u06CC\u200C\u062F\u0647\u062F.") : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm2)',
      color: 'var(--text-muted)',
      marginBottom: 10
    }
  }, "\u0644\u06CC\u0646\u06A9 \u0641\u0627\u06CC\u0644 HTML \u062E\u0631\u0648\u062C\u06CC:"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      alignItems: 'center'
    }
  }, /*#__PURE__*/React.createElement("input", {
    value: url,
    readOnly: true,
    dir: "ltr",
    style: {
      flex: 1,
      minWidth: 0,
      boxSizing: 'border-box',
      padding: '12px 14px',
      border: '1.5px solid var(--line)',
      borderRadius: 'var(--radius-md)',
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      color: 'var(--ink)',
      background: '#fff',
      outline: 'none'
    }
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    icon: "copy",
    onClick: () => setCopied(true)
  }, copied ? 'کپی شد' : 'کپی لینک')), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xs)',
      color: 'var(--text-faint)',
      marginTop: 12,
      lineHeight: 2
    }
  }, "\u0627\u06CC\u0646 \u0641\u0627\u06CC\u0644 \u06A9\u0627\u0645\u0644\u0627\u064B \u0645\u0633\u062A\u0642\u0644 \u0627\u0633\u062A \u0648 \u0628\u062F\u0648\u0646 \u0627\u06CC\u0646\u062A\u0631\u0646\u062A \u0647\u0645 \u0628\u0627\u0632 \u0645\u06CC\u200C\u0634\u0648\u062F."), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xs)',
      color: 'var(--text-faint)',
      lineHeight: 2
    }
  }, "\u06AF\u06CC\u0631\u0646\u062F\u0647\u0654 \u0627\u06CC\u0646 \u0644\u06CC\u0646\u06A9 \u0628\u0631\u0627\u06CC \u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u0622\u0646 \u0628\u0647 \u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u0648 \u06AF\u0630\u0631\u0648\u0627\u0698\u0647\u0654 \u0645\u0634\u062A\u0631\u06A9 \u062E\u0631\u0648\u062C\u06CC\u200C\u0647\u0627 \u0646\u06CC\u0627\u0632 \u062F\u0627\u0631\u062F \u0648 \u0627\u06CC\u0646 \u0644\u06CC\u0646\u06A9 \u0628\u0627 \u062E\u0631\u0648\u062C\u06CC \u0628\u0639\u062F\u06CC \u062C\u0627\u06CC\u06AF\u0632\u06CC\u0646 \u0645\u06CC\u200C\u06AF\u0631\u062F\u062F."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      marginTop: 20
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    style: ghostBtn
  }, "\u0628\u0633\u062A\u0646"), /*#__PURE__*/React.createElement("a", {
    href: "../staff-guide/index.html",
    target: "_blank",
    rel: "noopener",
    style: {
      flex: 1,
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: '12px 0',
      borderRadius: 'var(--radius-md)',
      background: 'var(--violet)',
      color: '#fff',
      fontWeight: 'var(--fw-bold)',
      fontSize: 14,
      textDecoration: 'none',
      boxShadow: 'var(--shadow-violet)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "external",
    size: 15,
    strokeWidth: 2.2
  }), "\u0628\u0627\u0632 \u06A9\u0631\u062F\u0646 \u062E\u0631\u0648\u062C\u06CC"))));
}
const ghostBtn = {
  flex: 1,
  padding: '12px 0',
  border: '1.5px solid var(--line)',
  background: '#fff',
  borderRadius: 'var(--radius-md)',
  fontSize: 14,
  fontWeight: 'var(--fw-bold)',
  color: 'var(--text-dialog-ghost)',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)'
};
const dangerBtn = {
  flex: 1,
  padding: '12px 0',
  border: 0,
  background: 'var(--conflict)',
  borderRadius: 'var(--radius-md)',
  fontSize: 14,
  fontWeight: 'var(--fw-bold)',
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'var(--font-sans)'
};
function FieldLabel({
  children,
  style
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-xxs)',
      fontWeight: 'var(--fw-bold)',
      color: 'var(--text-muted)',
      marginBottom: 6,
      ...style
    }
  }, children);
}
function Readonly({
  children,
  mono
}) {
  return /*#__PURE__*/React.createElement("div", {
    dir: mono ? 'ltr' : undefined,
    style: {
      padding: '10px 12px',
      borderRadius: 'var(--radius-control)',
      background: 'var(--tile-v2)',
      color: mono ? 'var(--violet)' : 'var(--text-muted)',
      fontSize: 'var(--fs-sm)',
      fontFamily: mono ? 'var(--font-mono)' : undefined
    }
  }, children);
}
Object.assign(window, {
  CreateProcessModal,
  DeleteProcessModal,
  ReorderModal,
  InboxModal,
  ExportModal
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/panel/Modals.jsx", error: String((e && e.message) || e) }); }

// ui_kits/panel/ProcessList.jsx
try { (() => {
const {
  Button,
  SearchField,
  ProcessRow,
  EmptyState,
  IconTile,
  Icon,
  IdBadge
} = window.InjaFoodDesignSystem_1ef55d;
const toFaL = x => String(x).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
function ProcessListScreen({
  dept,
  processes,
  onSummary,
  onFlow,
  onInfo,
  onCreate,
  onReorder,
  onDelete,
  onExport
}) {
  const [q, setQ] = React.useState('');
  const [menu, setMenu] = React.useState(false);
  const list = processes.filter(p => !q.trim() || p.name.includes(q.trim()) || p.id.includes(q.trim()));
  const pos = new Map();
  processes.filter(p => !p.tombstoned).forEach((p, i) => pos.set(p.id, i + 1));
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '30px 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-list)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(IconTile, {
    dept: dept.code
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-h2)',
      color: 'var(--ink)'
    }
  }, "\u062F\u067E\u0627\u0631\u062A\u0645\u0627\u0646 ", dept.name)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-sm)',
      color: 'var(--text-muted)',
      marginTop: 8
    }
  }, toFaL(dept.count), " \u0641\u0631\u0622\u06CC\u0646\u062F \u0645\u0633\u062A\u0646\u062F\u0634\u062F\u0647 \xB7 \u0628\u0631\u0627\u06CC \u0645\u0634\u0627\u0647\u062F\u0647\u0654 \u06A9\u0627\u0631\u062A \u062E\u0644\u0627\u0635\u0647 \u0648 \u0641\u0644\u0648\u0686\u0627\u0631\u062A \u0631\u0648\u06CC \u0647\u0631 \u0641\u0631\u0622\u06CC\u0646\u062F \u0628\u0632\u0646\u06CC\u062F.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flex: 'none',
      position: 'relative'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: onReorder
  }, "\u062A\u0631\u062A\u06CC\u0628 \u0641\u0631\u0622\u06CC\u0646\u062F\u0647\u0627"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    onClick: onInfo
  }, "\u0627\u0637\u0644\u0627\u0639\u0627\u062A \u062F\u067E\u0627\u0631\u062A\u0645\u0627\u0646"), /*#__PURE__*/React.createElement(Button, {
    variant: "coral",
    onClick: onCreate
  }, "\u0641\u0631\u0622\u06CC\u0646\u062F \u062C\u062F\u06CC\u062F"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setMenu(!menu),
    title: "\u062E\u0631\u0648\u062C\u06CC\u200C\u0647\u0627",
    "aria-label": "\u062E\u0631\u0648\u062C\u06CC\u200C\u0647\u0627",
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: 42,
      height: 42,
      border: '1.5px solid var(--line)',
      background: '#fff',
      color: 'var(--violet)',
      borderRadius: 'var(--radius-md)',
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "dots",
    size: 18,
    fill: "currentColor"
  })), menu && /*#__PURE__*/React.createElement("div", {
    role: "menu",
    style: {
      position: 'absolute',
      top: 'calc(100% + 8px)',
      insetInlineEnd: 0,
      width: 288,
      background: '#fff',
      border: '1px solid var(--line)',
      borderRadius: 'var(--radius-tile)',
      boxShadow: 'var(--shadow-modal)',
      zIndex: 40,
      padding: 7
    }
  }, /*#__PURE__*/React.createElement(MenuRow, {
    icon: "document",
    tile: "v",
    label: "\u062E\u0631\u0648\u062C\u06CC \u0645\u0633\u062A\u0646\u062F\u0627\u062A \u06A9\u0627\u0645\u0644",
    hint: "\u0633\u0646\u062F \u0631\u0633\u0645\u06CC \u0628\u0627 \u0641\u0644\u0648\u0686\u0627\u0631\u062A \u062A\u0639\u0627\u0645\u0644\u06CC",
    onClick: () => {
      setMenu(false);
      onExport('flowchart');
    }
  }), /*#__PURE__*/React.createElement(MenuRow, {
    icon: "list",
    tile: "warn",
    label: "\u062E\u0631\u0648\u062C\u06CC \u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u06AF\u0627\u0645\u200C\u0628\u0647\u200C\u06AF\u0627\u0645",
    hint: "\u0641\u0647\u0631\u0633\u062A \u0633\u0627\u062F\u0647 \u0648 \u062E\u0648\u0627\u0646\u0627 \u0628\u0631\u0627\u06CC \u067E\u0631\u0633\u0646\u0644",
    onClick: () => {
      setMenu(false);
      onExport('steps');
    }
  })))), /*#__PURE__*/React.createElement(SearchField, {
    placeholder: "\u062C\u0633\u062A\u200C\u0648\u062C\u0648 \u0628\u0631\u0627\u0633\u0627\u0633 \u0646\u0627\u0645 \u06CC\u0627 \u0634\u0646\u0627\u0633\u0647\u0654 \u0641\u0631\u0622\u06CC\u0646\u062F\u2026",
    value: q,
    onChange: e => setQ(e.target.value),
    style: {
      marginBottom: 16
    }
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, list.length === 0 && /*#__PURE__*/React.createElement(EmptyState, null, "\u0641\u0631\u0622\u06CC\u0646\u062F\u06CC \u0628\u0627 \u0627\u06CC\u0646 \u0646\u0627\u0645 \u067E\u06CC\u062F\u0627 \u0646\u0634\u062F"), list.map(p => /*#__PURE__*/React.createElement(ProcessRow, {
    key: p.id,
    id: p.id,
    name: p.name,
    summary: p.summary,
    position: pos.get(p.id),
    tag: p.tag,
    activities: p.activities,
    tombstoned: p.tombstoned,
    supersededBy: p.superseded_by,
    onSummary: () => onSummary(p),
    onFlow: () => onFlow(p),
    onDelete: () => onDelete(p)
  })))));
}
function MenuRow({
  icon,
  tile,
  label,
  hint,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    role: "menuitem",
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      gap: 11,
      width: '100%',
      textAlign: 'right',
      padding: '11px 12px',
      borderRadius: 'var(--radius-control)',
      border: 0,
      background: h ? 'var(--tile-v2)' : 'transparent',
      cursor: 'pointer',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement(IconTile, {
    name: icon,
    accent: tile === 'warn' ? 'warn' : 'violet',
    size: 34,
    radius: "var(--radius-control)"
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontWeight: 'var(--fw-bold)',
      fontSize: 13.5,
      color: 'var(--ink)'
    }
  }, label), /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 'var(--fs-xs)',
      color: 'var(--text-muted)',
      marginTop: 3,
      lineHeight: 'var(--lh-relaxed)'
    }
  }, hint)));
}
Object.assign(window, {
  ProcessListScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/panel/ProcessList.jsx", error: String((e && e.message) || e) }); }

// ui_kits/panel/Summary.jsx
try { (() => {
const {
  Button,
  IdBadge,
  Card,
  Idef0Diagram,
  KpiCard,
  EmptyState
} = window.InjaFoodDesignSystem_1ef55d;
function SummaryScreen({
  proc,
  onFlow
}) {
  return /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflow: 'auto',
      padding: '30px 40px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-summary)',
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
      marginBottom: 22
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement(IdBadge, {
    tone: "violet"
  }, proc.id)), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 'var(--fs-h1)',
      color: 'var(--ink)'
    }
  }, proc.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 'var(--fs-lg)',
      color: 'var(--text-muted)',
      marginTop: 8,
      maxWidth: 640,
      lineHeight: 'var(--lh-relaxed)'
    }
  }, proc.summary)), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: 10,
      flex: 'none'
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "\u0648\u06CC\u0631\u0627\u06CC\u0634 \u0627\u0637\u0644\u0627\u0639\u0627\u062A"), /*#__PURE__*/React.createElement(Button, {
    variant: "coral",
    onClick: onFlow
  }, "\u0645\u0634\u0627\u0647\u062F\u0647\u0654 \u0641\u0644\u0648\u0686\u0627\u0631\u062A"))), /*#__PURE__*/React.createElement(Card, {
    radius: "var(--radius-doc)",
    padding: 24,
    style: {
      marginBottom: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-body)',
      color: 'var(--violet)',
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 8,
      height: 8,
      background: 'var(--coral)',
      borderRadius: '50%'
    }
  }), "\u0646\u0645\u0627\u06CC IDEF0 \u0633\u0637\u062D \u0641\u0631\u0622\u06CC\u0646\u062F (A-0)"), /*#__PURE__*/React.createElement(Idef0Diagram, {
    name: proc.name,
    id: proc.id,
    icom: proc.idef0
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-bold)',
      fontSize: 'var(--fs-lg)',
      color: 'var(--ink)',
      marginBottom: 12
    }
  }, "\u0634\u0627\u062E\u0635\u200C\u0647\u0627\u06CC \u06A9\u0644\u06CC\u062F\u06CC \u0639\u0645\u0644\u06A9\u0631\u062F (KPI)"), proc.kpis.length ? /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 14
    }
  }, proc.kpis.map((k, i) => /*#__PURE__*/React.createElement(KpiCard, {
    key: i,
    name: k.name,
    target: k.target,
    definition: k.definition
  }))) : /*#__PURE__*/React.createElement(EmptyState, {
    variant: "dashed"
  }, "\u0634\u0627\u062E\u0635\u06CC \u0628\u0631\u0627\u06CC \u0627\u06CC\u0646 \u0641\u0631\u0622\u06CC\u0646\u062F \u062B\u0628\u062A \u0646\u0634\u062F\u0647 \u0627\u0633\u062A. (\u0633\u0627\u0645\u0627\u0646\u0647 \u0627\u0637\u0644\u0627\u0639\u0627\u062A \u0631\u0627 \u0646\u0645\u06CC\u200C\u0633\u0627\u0632\u062F\u061B \u0641\u0642\u0637 \u0627\u0632 \u0645\u062D\u062A\u0648\u0627\u06CC \u0648\u0627\u0642\u0639\u06CC \u062C\u0644\u0633\u0647 \u067E\u0631 \u0645\u06CC\u200C\u0634\u0648\u062F.)")));
}
Object.assign(window, {
  SummaryScreen
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/panel/Summary.jsx", error: String((e && e.message) || e) }); }

// ui_kits/panel/data.js
try { (() => {
/* Sample content for the panel recreation. Shapes follow schemas/process.schema.json
   and schemas/overview.schema.json; the text is illustrative, not real Inja data. */
window.PANEL_DATA = {
  departments: [{
    code: 'management',
    name: 'مدیریت',
    count: 4,
    subs: 0,
    conflicts: 0
  }, {
    code: 'accounting',
    name: 'حسابداری',
    count: 6,
    subs: 1,
    conflicts: 0
  }, {
    code: 'warehouse',
    name: 'انبار',
    count: 5,
    subs: 0,
    conflicts: 1
  }, {
    code: 'procurement',
    name: 'خرید',
    count: 4,
    subs: 0,
    conflicts: 0
  }, {
    code: 'cooking',
    name: 'پخت',
    count: 8,
    subs: 2,
    conflicts: 0
  }, {
    code: 'preparation',
    name: 'آماده‌سازی',
    count: 6,
    subs: 1,
    conflicts: 0
  }, {
    code: 'dining',
    name: 'سالن',
    count: 9,
    subs: 2,
    conflicts: 2
  }, {
    code: 'cashier',
    name: 'صندوق',
    count: 4,
    subs: 0,
    conflicts: 0
  }, {
    code: 'logistics',
    name: 'پشتیبانی',
    count: 2,
    subs: 0,
    conflicts: 0
  }],
  processes: {
    dining: [{
      id: 'dining-001',
      name: 'آماده‌سازی و شروع شیفت سالن',
      summary: 'از ورود پرسنل تا آمادگی کامل میزها پیش از باز شدن رستوران.',
      activities: 8,
      tag: {
        label: 'مستند',
        kind: 'plain'
      }
    }, {
      id: 'dining-002',
      name: 'چیدمان و کنترل میزها',
      summary: 'کنترل تمیزی، ست کردن سرویس و کنترل تعداد صندلی‌ها.',
      activities: 6,
      tag: {
        label: 'دارای KPI',
        kind: 'kpi'
      }
    }, {
      id: 'dining-003',
      name: 'پذیرش مهمان',
      summary: 'از ورود مهمان تا نشستن سر میز و تحویل منو.',
      activities: 11,
      tag: {
        label: '۲ تعارض',
        kind: 'conflict'
      }
    }, {
      id: 'dining-004',
      name: 'ثبت و پیگیری سفارش',
      summary: 'ثبت سفارش روی صندوق، ارسال به آشپزخانه و پیگیری زمان آماده‌سازی.',
      activities: 9,
      tag: {
        label: 'مستند',
        kind: 'plain'
      }
    }, {
      id: 'dining-005',
      name: 'تحویل سفارش سر میز',
      summary: 'برداشت سفارش از پاس و تحویل به مهمان.',
      activities: 5,
      tag: {
        label: 'زیرفرآیند',
        kind: 'sub'
      }
    }, {
      id: 'dining-006',
      name: 'رسیدگی به شکایت مهمان',
      summary: 'شنیدن شکایت، جبران و ثبت در گزارش شیفت.',
      activities: 7,
      tag: {
        label: 'مستند',
        kind: 'plain'
      }
    }, {
      id: 'dining-007',
      name: 'تسویه و بدرقهٔ مهمان',
      summary: 'صدور صورت‌حساب، دریافت وجه و بدرقهٔ مهمان.',
      activities: 6,
      tag: {
        label: 'دارای KPI',
        kind: 'kpi'
      }
    }, {
      id: 'dining-008',
      name: 'جمع‌آوری و بازچینی میز',
      summary: 'پس از خروج مهمان، جمع‌آوری سرویس و آماده‌سازی برای مهمان بعدی.',
      activities: 4,
      tag: {
        label: 'زیرفرآیند',
        kind: 'sub'
      }
    }, {
      id: 'dining-009',
      name: 'بستن شیفت سالن',
      summary: 'تحویل صندوق، گزارش شیفت و خاموش کردن تجهیزات.',
      activities: 7,
      tag: {
        label: 'باطل‌شده',
        kind: 'tombstone'
      },
      tombstoned: true,
      superseded_by: ['dining-010']
    }]
  },
  summary: {
    'dining-003': {
      id: 'dining-003',
      name: 'پذیرش مهمان',
      department: 'dining',
      summary: 'از لحظهٔ ورود مهمان تا نشستن سر میز و تحویل منو؛ شامل بررسی ظرفیت سالن و مدیریت صف در ساعات اوج.',
      idef0: {
        inputs: ['مهمان ورودی', 'رزرو تلفنی'],
        controls: ['ظرفیت سالن', 'سیاست مدیریت صف'],
        outputs: ['میز اشغال‌شده', 'منوی تحویل‌شده'],
        mechanisms: ['میزبان', 'تخته وضعیت میزها']
      },
      kpis: [{
        name: 'زمان انتظار مهمان',
        target: 'زیر ۵ دقیقه',
        definition: 'فاصلهٔ ورود مهمان تا نشستن سر میز، در ساعات اوج اندازه‌گیری می‌شود.'
      }, {
        name: 'نرخ ترک صف',
        target: 'زیر ۳٪',
        definition: 'نسبت مهمانانی که پیش از نشستن سالن را ترک می‌کنند به کل ورودی‌ها.'
      }]
    }
  },
  overview: {
    dining: {
      name: 'دپارتمان سالن',
      updated_at: '۱۴۰۳/۰۹/۱۲',
      description: 'سالن، نقطهٔ تماس مستقیم مجموعه با مهمان است. مسئولیت این دپارتمان از لحظهٔ ورود مهمان آغاز می‌شود و تا بدرقهٔ او و بازچینی میز ادامه دارد.\nهماهنگی با آشپزخانه و صندوق در ساعات اوج، اصلی‌ترین وظیفهٔ سرپرست شیفت است.',
      sub_units: [{
        name: 'میزبانی',
        description: 'پذیرش، مدیریت صف و اختصاص میز به مهمان.'
      }, {
        name: 'سرویس میز',
        description: 'ثبت سفارش، تحویل غذا و رسیدگی به درخواست‌های میز.'
      }, {
        name: 'بازچینی',
        description: 'جمع‌آوری سرویس و آماده‌سازی میز برای مهمان بعدی.'
      }],
      personnel: [{
        role: 'سرپرست شیفت سالن',
        duties: ['تقسیم کار میان گارسون‌ها', 'کنترل زمان تحویل سفارش‌ها', 'رسیدگی به شکایت مهمان', 'تهیهٔ گزارش پایان شیفت'],
        kpi: ['میانگین زمان تحویل سفارش', 'تعداد شکایت ثبت‌شده در شیفت']
      }, {
        role: 'میزبان',
        duties: ['استقبال از مهمان', 'مدیریت صف و اعلام زمان انتظار', 'اختصاص میز بر اساس ظرفیت'],
        kpi: ['زمان انتظار مهمان']
      }, {
        role: 'گارسون',
        duties: ['ثبت سفارش میز', 'تحویل سفارش از پاس', 'بازچینی میز پس از خروج مهمان'],
        kpi: []
      }]
    }
  },
  flow: {
    'dining-003': {
      id: 'dining-003',
      name: 'پذیرش مهمان',
      nodes: [{
        id: 'start',
        type: 'start',
        label: 'ورود مهمان',
        pos: {
          x: 30,
          y: 150
        }
      }, {
        id: 'dining-003-n010',
        type: 'activity',
        label: 'استقبال و احوال‌پرسی',
        actor: 'میزبان',
        pos: {
          x: 170,
          y: 130
        },
        description: 'میزبان در ورودی از مهمان استقبال می‌کند و تعداد نفرات را می‌پرسد.',
        icom: {
          inputs: ['مهمان ورودی'],
          controls: ['دستورالعمل استقبال'],
          outputs: ['تعداد نفرات'],
          mechanisms: ['میزبان']
        },
        source: 'meeting-1403-08-21'
      }, {
        id: 'dining-003-n011',
        type: 'activity',
        label: 'بررسی ظرفیت سالن',
        actor: 'میزبان',
        pos: {
          x: 380,
          y: 130
        },
        conflicts: 2,
        description: 'وضعیت میزها روی تخته کنترل و میز مناسب انتخاب می‌شود.',
        icom: {
          inputs: ['تعداد نفرات'],
          controls: ['ظرفیت سالن'],
          outputs: ['وضعیت میز'],
          mechanisms: ['تخته وضعیت میزها']
        },
        source: 'meeting-1403-09-12'
      }, {
        id: 'dining-003-j1',
        type: 'junction',
        junctionType: 'XOR',
        pos: {
          x: 600,
          y: 148
        }
      }, {
        id: 'dining-003-n012',
        type: 'activity',
        label: 'راهنمایی به میز',
        actor: 'میزبان',
        pos: {
          x: 700,
          y: 40
        },
        description: 'مهمان تا میز همراهی می‌شود و منو تحویل داده می‌شود.',
        icom: {
          inputs: ['وضعیت میز'],
          controls: [],
          outputs: ['میز اشغال‌شده'],
          mechanisms: ['میزبان']
        },
        source: 'meeting-1403-08-21'
      }, {
        id: 'dining-003-n013',
        type: 'activity',
        label: 'مدیریت صف انتظار',
        actor: 'سرپرست شیفت',
        pos: {
          x: 700,
          y: 240
        },
        description: 'نام مهمان در صف ثبت و زمان تقریبی انتظار اعلام می‌شود.',
        icom: {
          inputs: ['وضعیت میز'],
          controls: ['سیاست مدیریت صف'],
          outputs: ['نوبت ثبت‌شده'],
          mechanisms: ['دفتر صف']
        },
        source: 'meeting-1403-09-12'
      }, {
        id: 'dining-003-n014',
        type: 'activity',
        label: 'ثبت و پیگیری سفارش',
        actor: 'گارسون',
        pos: {
          x: 930,
          y: 130
        },
        subprocess: 'dining-004',
        description: 'سفارش میز ثبت و به آشپزخانه ارسال می‌شود.',
        icom: {
          inputs: ['منوی تحویل‌شده'],
          controls: ['منوی روز'],
          outputs: ['فیش سفارش'],
          mechanisms: ['سامانهٔ صندوق']
        },
        source: 'meeting-1403-08-21'
      }, {
        id: 'end',
        type: 'end',
        label: 'مهمان نشسته',
        pos: {
          x: 1150,
          y: 150
        }
      }],
      edges: [{
        from: 'start',
        to: 'dining-003-n010'
      }, {
        from: 'dining-003-n010',
        to: 'dining-003-n011'
      }, {
        from: 'dining-003-n011',
        to: 'dining-003-j1'
      }, {
        from: 'dining-003-j1',
        to: 'dining-003-n012',
        label: 'میز خالی است'
      }, {
        from: 'dining-003-j1',
        to: 'dining-003-n013',
        label: 'سالن پر است'
      }, {
        from: 'dining-003-n012',
        to: 'dining-003-n014'
      }, {
        from: 'dining-003-n013',
        to: 'dining-003-n014'
      }, {
        from: 'dining-003-n014',
        to: 'end'
      }],
      pending: [{
        node: 'dining-003-n011',
        field: 'مجری فعالیت',
        source: 'meeting-1403-09-12',
        current: 'میزبان',
        proposed: 'سرپرست شیفت سالن'
      }, {
        node: 'dining-003-n011',
        field: 'توضیحات',
        source: 'meeting-1403-09-12',
        current: 'وضعیت میزها روی تخته کنترل و میز مناسب انتخاب می‌شود.',
        proposed: 'وضعیت میزها روی تخته کنترل می‌شود؛ در ساعات اوج ظرفیت رزروها هم لحاظ می‌شود.'
      }]
    }
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/panel/data.js", error: String((e && e.message) || e) }); }

// ui_kits/staff-guide/StepsApp.jsx
try { (() => {
const {
  StepCard,
  BranchGroup,
  EndMark,
  Icon
} = window.InjaFoodDesignSystem_1ef55d;
const toFaG = x => String(x).replace(/[0-9]/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
function GuideApp({
  data
}) {
  const [pid, setPid] = React.useState(null);
  const [open, setOpen] = React.useState(0);
  const page = pid ? data.pages[pid] : null;
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'sticky',
      top: 0,
      zIndex: 30,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 22px',
      background: 'var(--login-bg)',
      color: '#fff'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 'var(--fw-extrabold)',
      fontSize: 16
    }
  }, "\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u06AF\u0627\u0645\u200C\u0628\u0647\u200C\u06AF\u0627\u0645 \u06A9\u0627\u0631"), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }), /*#__PURE__*/React.createElement(TBtn, {
    onClick: () => setPid(null)
  }, "\u0641\u0647\u0631\u0633\u062A \u06A9\u0627\u0631\u0647\u0627"), /*#__PURE__*/React.createElement(TBtn, {
    onClick: () => window.print()
  }, "\u0686\u0627\u067E")), /*#__PURE__*/React.createElement("div", {
    style: {
      maxWidth: 'var(--width-doc)',
      margin: '0 auto',
      padding: '26px 20px 90px'
    }
  }, !page ? /*#__PURE__*/React.createElement(Home, {
    data: data,
    onOpen: setPid
  }) : /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setPid(null),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 8,
      fontWeight: 'var(--fw-bold)',
      fontSize: 15,
      borderRadius: 'var(--radius-md)',
      padding: '10px 16px',
      cursor: 'pointer',
      border: '2px solid var(--line)',
      background: '#fff',
      color: 'var(--violet)',
      marginBottom: 18,
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronEnd",
    size: 20,
    strokeWidth: 2.6
  }), "\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u0641\u0647\u0631\u0633\u062A \u06A9\u0627\u0631\u0647\u0627"), /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--fs-doc-title)',
      fontWeight: 'var(--fw-extrabold)',
      margin: '0 0 12px',
      lineHeight: 'var(--lh-snug)'
    }
  }, page.name), page.summary && /*#__PURE__*/React.createElement("div", {
    style: {
      background: '#fff',
      border: '2px solid var(--warm)',
      borderRadius: 'var(--radius-card)',
      padding: '18px 20px',
      fontSize: 'var(--fs-doc-body)',
      color: 'var(--text-body)',
      lineHeight: 'var(--lh-looser)',
      marginBottom: 8
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'block',
      fontSize: 13,
      fontWeight: 'var(--fw-extrabold)',
      color: 'var(--text-muted)',
      marginBottom: 8
    }
  }, "\u0627\u06CC\u0646 \u0628\u062E\u0634 \u0645\u0631\u0628\u0648\u0637 \u0628\u0647 \u0686\u06CC\u0633\u062A\u061F"), page.summary), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      background: 'var(--tile-v3)',
      borderRadius: 'var(--radius-tile)',
      padding: '12px 16px',
      fontSize: 14.5,
      color: 'var(--text-body)',
      margin: '16px 0 22px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--violet)',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "tip",
    size: 20
  })), "\u0631\u0648\u06CC \u0647\u0631 \u0645\u0631\u062D\u0644\u0647 \u0628\u0632\u0646\u06CC\u062F \u062A\u0627 \u062A\u0648\u0636\u06CC\u062D \u06A9\u0627\u0645\u0644 \u0648 \u0645\u0633\u0626\u0648\u0644 \u0622\u0646 \u0631\u0627 \u0628\u0628\u06CC\u0646\u06CC\u062F."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, page.blocks.map((b, i) => b.kind === 'group' ? /*#__PURE__*/React.createElement(BranchGroup, {
    key: i,
    type: b.type,
    title: b.title,
    branches: b.branches.map(br => ({
      label: br.label,
      children: br.steps && br.steps.length ? /*#__PURE__*/React.createElement("div", {
        style: {
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }
      }, br.steps.map(s => /*#__PURE__*/React.createElement(Step, {
        key: s.num,
        s: s,
        open: open,
        setOpen: setOpen
      }))) : undefined
    }))
  }) : /*#__PURE__*/React.createElement(Step, {
    key: b.num,
    s: b,
    open: open,
    setOpen: setOpen
  }))), /*#__PURE__*/React.createElement(EndMark, {
    style: {
      marginTop: 14
    }
  }))));
}
function Step({
  s,
  open,
  setOpen
}) {
  return /*#__PURE__*/React.createElement(StepCard, {
    num: s.num,
    label: s.label,
    actor: s.actor,
    description: s.description,
    condition: s.condition,
    backTo: s.backTo,
    hasSub: s.hasSub,
    open: open === s.num,
    onToggle: () => setOpen(open === s.num ? 0 : s.num)
  });
}
function Home({
  data,
  onOpen
}) {
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      padding: '18px 0 26px'
    }
  }, /*#__PURE__*/React.createElement("h1", {
    style: {
      fontSize: 'var(--fs-doc-h1)',
      fontWeight: 'var(--fw-extrabold)',
      margin: '0 0 10px'
    }
  }, "\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u06AF\u0627\u0645\u200C\u0628\u0647\u200C\u06AF\u0627\u0645 \u06A9\u0627\u0631"), /*#__PURE__*/React.createElement("p", {
    style: {
      fontSize: 17,
      color: 'var(--text-muted)',
      margin: 0
    }
  }, data.dept.name, " \u2014 \u0631\u0648\u06CC \u0646\u0627\u0645 \u0647\u0631 \u06A9\u0627\u0631 \u0628\u0632\u0646\u06CC\u062F \u062A\u0627 \u0645\u0631\u062D\u0644\u0647\u200C\u0628\u0647\u200C\u0645\u0631\u062D\u0644\u0647 \u0628\u0628\u06CC\u0646\u06CC\u062F.")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 12
    }
  }, data.processes.map(p => /*#__PURE__*/React.createElement(Row, {
    key: p.id,
    p: p,
    onOpen: onOpen
  }))));
}
function Row({
  p,
  onOpen
}) {
  const [h, setH] = React.useState(false);
  const sub = !!p.parent;
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => onOpen(p.id),
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 16,
      width: '100%',
      textAlign: 'right',
      background: '#fff',
      border: '2px solid ' + (h ? 'var(--violet)' : 'var(--warm)'),
      borderRadius: 'var(--radius-doc)',
      padding: '18px 20px',
      cursor: 'pointer',
      boxShadow: h ? 'var(--shadow-guide-hover)' : undefined,
      transition: 'border-color .15s, box-shadow .15s',
      fontFamily: 'var(--font-sans)'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 46,
      height: 46,
      flex: 'none',
      borderRadius: 'var(--radius-tile)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: sub ? 'var(--tile-warn)' : 'var(--tile-v)',
      color: sub ? 'var(--warn)' : 'var(--violet)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: sub ? 'subprocessArrow' : 'process',
    size: 20
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      flex: 1,
      minWidth: 0,
      fontWeight: 'var(--fw-bold)',
      fontSize: 19,
      lineHeight: 'var(--lh-normal)',
      color: 'var(--ink)'
    }
  }, p.name, /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-block',
      fontSize: 12.5,
      fontWeight: 'var(--fw-bold)',
      borderRadius: 'var(--radius-pill)',
      padding: '2px 10px',
      marginInlineStart: 9,
      verticalAlign: 'middle',
      color: sub ? 'var(--warn)' : 'var(--violet)',
      background: sub ? 'var(--tile-warn)' : 'var(--tile-v)'
    }
  }, sub ? 'زیرفرآیند' : 'فرآیند')), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 14,
      color: 'var(--text-muted)',
      fontWeight: 'var(--fw-semibold)',
      flex: 'none'
    }
  }, toFaG(p.steps), " \u0645\u0631\u062D\u0644\u0647"), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--violet)',
      flex: 'none',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "chevronStart",
    size: 20,
    strokeWidth: 2.6
  })));
}
function TBtn({
  children,
  onClick
}) {
  const [h, setH] = React.useState(false);
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    onMouseEnter: () => setH(true),
    onMouseLeave: () => setH(false),
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 7,
      fontWeight: 'var(--fw-bold)',
      fontSize: 14,
      borderRadius: 'var(--radius-input)',
      padding: '9px 15px',
      cursor: 'pointer',
      border: '1px solid rgba(255,255,255,.3)',
      background: 'rgba(255,255,255,' + (h ? '.22' : '.1') + ')',
      color: '#fff',
      fontFamily: 'var(--font-sans)'
    }
  }, children);
}
Object.assign(window, {
  GuideApp
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-guide/StepsApp.jsx", error: String((e && e.message) || e) }); }

// ui_kits/staff-guide/data.js
try { (() => {
/* Sample content for the staff-guide export document. Same department as the panel kit. */
window.GUIDE_DATA = {
  dept: {
    name: 'دپارتمان سالن'
  },
  processes: [{
    id: 'dining-001',
    name: 'آماده‌سازی و شروع شیفت سالن',
    steps: 8
  }, {
    id: 'dining-003',
    name: 'پذیرش مهمان',
    steps: 6
  }, {
    id: 'dining-004',
    name: 'ثبت و پیگیری سفارش',
    steps: 5,
    parent: true
  }, {
    id: 'dining-007',
    name: 'تسویه و بدرقهٔ مهمان',
    steps: 4
  }],
  pages: {
    'dining-003': {
      name: 'پذیرش مهمان',
      summary: 'از لحظهٔ ورود مهمان تا نشستن سر میز و تحویل منو. در ساعات اوج، مدیریت صف هم بخشی از همین کار است.',
      blocks: [{
        kind: 'step',
        num: 1,
        label: 'به مهمان خوش‌آمد بگویید و تعداد نفرات را بپرسید',
        actor: 'میزبان',
        description: 'در ورودی سالن بایستید، سلام کنید و تعداد نفرات را بپرسید. اگر مهمان رزرو دارد، نام را در دفتر رزرو پیدا کنید.'
      }, {
        kind: 'step',
        num: 2,
        label: 'وضعیت میزها را روی تخته کنترل کنید',
        actor: 'میزبان',
        description: 'تخته وضعیت میزها را ببینید و میز مناسب تعداد نفرات را انتخاب کنید. میز رزروشده را به مهمان بدون رزرو ندهید.'
      }, {
        kind: 'group',
        type: 'XOR',
        title: 'فقط یکی از این دو حالت پیش می‌آید',
        branches: [{
          label: 'میز خالی مناسب داریم',
          steps: [{
            num: 3,
            label: 'مهمان را تا میز همراهی کنید و منو را بدهید',
            actor: 'میزبان',
            description: 'مهمان را تا میز همراهی کنید، صندلی را عقب بکشید و منو را به دست هر نفر بدهید.'
          }]
        }, {
          label: 'سالن پر است',
          steps: [{
            num: 4,
            label: 'نام مهمان را در صف ثبت کنید و زمان انتظار را بگویید',
            actor: 'سرپرست شیفت سالن',
            description: 'نام و تعداد نفرات را در دفتر صف بنویسید و زمان تقریبی انتظار را صادقانه اعلام کنید.'
          }, {
            num: 5,
            label: 'به‌محض خالی شدن میز، مهمان را صدا بزنید',
            actor: 'میزبان',
            description: 'به ترتیب دفتر صف پیش بروید؛ نوبت را جابه‌جا نکنید.',
            backTo: 3
          }]
        }]
      }, {
        kind: 'step',
        num: 6,
        label: 'ثبت و پیگیری سفارش',
        hasSub: true
      }]
    }
  }
};
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/staff-guide/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Spinner = __ds_scope.Spinner;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Chip = __ds_scope.Chip;

__ds_ns.Fa = __ds_scope.Fa;

__ds_ns.InjaIcons = __ds_scope.InjaIcons;

__ds_ns.InjaDeptIcons = __ds_scope.InjaDeptIcons;

__ds_ns.InjaDeptAccent = __ds_scope.InjaDeptAccent;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconTile = __ds_scope.IconTile;

__ds_ns.IdBadge = __ds_scope.IdBadge;

__ds_ns.ProcessTag = __ds_scope.ProcessTag;

__ds_ns.ConflictCard = __ds_scope.ConflictCard;

__ds_ns.EmptyState = __ds_scope.EmptyState;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.Toast = __ds_scope.Toast;

__ds_ns.ActivityNode = __ds_scope.ActivityNode;

__ds_ns.DetailDrawer = __ds_scope.DetailDrawer;

__ds_ns.JunctionNode = __ds_scope.JunctionNode;

__ds_ns.JunctionLegend = __ds_scope.JunctionLegend;

__ds_ns.TerminalNode = __ds_scope.TerminalNode;

__ds_ns.ListEditor = __ds_scope.ListEditor;

__ds_ns.AddButton = __ds_scope.AddButton;

__ds_ns.SearchField = __ds_scope.SearchField;

__ds_ns.TextField = __ds_scope.TextField;

__ds_ns.BranchGroup = __ds_scope.BranchGroup;

__ds_ns.EndMark = __ds_scope.EndMark;

__ds_ns.StepCard = __ds_scope.StepCard;

__ds_ns.ToolGroup = __ds_scope.ToolGroup;

__ds_ns.ToolButton = __ds_scope.ToolButton;

__ds_ns.ToolDivider = __ds_scope.ToolDivider;

__ds_ns.TopBar = __ds_scope.TopBar;

__ds_ns.Breadcrumb = __ds_scope.Breadcrumb;

__ds_ns.DepartmentCard = __ds_scope.DepartmentCard;

__ds_ns.Idef0Diagram = __ds_scope.Idef0Diagram;

__ds_ns.KpiCard = __ds_scope.KpiCard;

__ds_ns.ProcessRow = __ds_scope.ProcessRow;

__ds_ns.StatCard = __ds_scope.StatCard;

})();
