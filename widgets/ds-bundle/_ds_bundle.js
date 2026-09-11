/* @ds-bundle: {"namespace":"BsvWidgets","components":[{"name":"Chain","sourcePath":"components/chrome/Chain/Chain.jsx"},{"name":"Device","sourcePath":"components/chrome/Device/Device.jsx"},{"name":"DevicePortRow","sourcePath":"components/general/DevicePortRow/DevicePortRow.jsx"},{"name":"Divider","sourcePath":"components/general/Divider/Divider.jsx"},{"name":"Graph","sourcePath":"components/chrome/Graph/Graph.jsx"},{"name":"GraphNode","sourcePath":"components/general/GraphNode/GraphNode.jsx"},{"name":"Knob","sourcePath":"components/controls/Knob/Knob.jsx"},{"name":"Label","sourcePath":"components/controls/Label/Label.jsx"},{"name":"Meter","sourcePath":"components/controls/Meter/Meter.jsx"},{"name":"NumberField","sourcePath":"components/controls/NumberField/NumberField.jsx"},{"name":"Panel","sourcePath":"components/chrome/Panel/Panel.jsx"},{"name":"PanelColumn","sourcePath":"components/general/PanelColumn/PanelColumn.jsx"},{"name":"Port","sourcePath":"components/chrome/Port/Port.jsx"},{"name":"Rack","sourcePath":"components/chrome/Rack/Rack.jsx"},{"name":"Row","sourcePath":"components/chrome/Row/Row.jsx"},{"name":"Segmented","sourcePath":"components/controls/Segmented/Segmented.jsx"},{"name":"Select","sourcePath":"components/controls/Select/Select.jsx"},{"name":"Slider","sourcePath":"components/controls/Slider/Slider.jsx"},{"name":"Toggle","sourcePath":"components/controls/Toggle/Toggle.jsx"},{"name":"Widget","sourcePath":"components/controls/Widget/Widget.jsx"}],"sourceHashes":{"components/chrome/Chain/Chain.jsx":"13800465a4f4","components/chrome/Chain/Chain.d.ts":"ec503db4702c","components/chrome/Chain/Chain.prompt.md":"4c3d7305c117","components/chrome/Device/Device.jsx":"c2bcfae1a61e","components/chrome/Device/Device.d.ts":"5aeb31b39cb8","components/chrome/Device/Device.prompt.md":"ce74629747f7","components/general/DevicePortRow/DevicePortRow.jsx":"f4f05444dc81","components/general/DevicePortRow/DevicePortRow.d.ts":"9ff147b1c91f","components/general/DevicePortRow/DevicePortRow.prompt.md":"5d391ebfb932","components/general/Divider/Divider.jsx":"e2af5685c78f","components/general/Divider/Divider.d.ts":"d682b131055b","components/general/Divider/Divider.prompt.md":"6b3296719c9a","components/chrome/Graph/Graph.jsx":"b1985385df4d","components/chrome/Graph/Graph.d.ts":"12c3ba2afc27","components/chrome/Graph/Graph.prompt.md":"96dab3549e4c","components/general/GraphNode/GraphNode.jsx":"a55d81f36bd6","components/general/GraphNode/GraphNode.d.ts":"22fd13575249","components/general/GraphNode/GraphNode.prompt.md":"c24a83c7e019","components/controls/Knob/Knob.jsx":"b27853424c3c","components/controls/Knob/Knob.d.ts":"3249dde11ed7","components/controls/Knob/Knob.prompt.md":"2ae7c71e6117","components/controls/Label/Label.jsx":"eb19292d5c0c","components/controls/Label/Label.d.ts":"f305c05e7ad7","components/controls/Label/Label.prompt.md":"8e1e0cff523d","components/controls/Meter/Meter.jsx":"b47eea176ac4","components/controls/Meter/Meter.d.ts":"cd7ea881e068","components/controls/Meter/Meter.prompt.md":"525dfc58676a","components/controls/NumberField/NumberField.jsx":"a7b813128ebb","components/controls/NumberField/NumberField.d.ts":"ae3ce030d2f6","components/controls/NumberField/NumberField.prompt.md":"a6715f35e83b","components/chrome/Panel/Panel.jsx":"e4ee162329bb","components/chrome/Panel/Panel.d.ts":"9ce81eb694b4","components/chrome/Panel/Panel.prompt.md":"9889b543c7fe","components/general/PanelColumn/PanelColumn.jsx":"d8a3825c718b","components/general/PanelColumn/PanelColumn.d.ts":"db25064b53c3","components/general/PanelColumn/PanelColumn.prompt.md":"3100a3b5b879","components/chrome/Port/Port.jsx":"9ccced62ebf8","components/chrome/Port/Port.d.ts":"814c7cd7aa42","components/chrome/Port/Port.prompt.md":"dbde7cb16532","components/chrome/Rack/Rack.jsx":"bec58ece4694","components/chrome/Rack/Rack.d.ts":"3b6a4c36d9c3","components/chrome/Rack/Rack.prompt.md":"45a5e0b1641f","components/chrome/Row/Row.jsx":"500c34b90064","components/chrome/Row/Row.d.ts":"bba41e9fbbfe","components/chrome/Row/Row.prompt.md":"c9fe0f9a521f","components/controls/Segmented/Segmented.jsx":"3e465433ab5c","components/controls/Segmented/Segmented.d.ts":"3ce7800c5495","components/controls/Segmented/Segmented.prompt.md":"f83a088d0a7c","components/controls/Select/Select.jsx":"935f7a8c459b","components/controls/Select/Select.d.ts":"9d5c7d3beadc","components/controls/Select/Select.prompt.md":"ca38cf409aa9","components/controls/Slider/Slider.jsx":"fb799fed094d","components/controls/Slider/Slider.d.ts":"49715e714694","components/controls/Slider/Slider.prompt.md":"0c2ec3287754","components/controls/Toggle/Toggle.jsx":"3a44169e3864","components/controls/Toggle/Toggle.d.ts":"a867c0990867","components/controls/Toggle/Toggle.prompt.md":"cbbe4631064d","components/controls/Widget/Widget.jsx":"9b0ec3d7e0c9","components/controls/Widget/Widget.d.ts":"214328631368","components/controls/Widget/Widget.prompt.md":"8c90c89efddf"},"inlinedExternals":[],"builtBy":"cc-design-sync"} */
"use strict";
var BsvWidgets = (() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __esm = (fn, res, err) => function __init() {
    if (err) throw err[0];
    try {
      return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
    } catch (e) {
      throw err = [e], e;
    }
  };
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // <define:import.meta.env>
  var init_define_import_meta_env = __esm({
    "<define:import.meta.env>"() {
    }
  });

  // shim:react-shim
  var require_react_shim = __commonJS({
    "shim:react-shim"(exports, module) {
      init_define_import_meta_env();
      var R = window.React;
      function np(p, k) {
        var o = {};
        for (var x in p) if (x !== "children") o[x] = p[x];
        if (k !== void 0) o.key = k;
        return o;
      }
      function jsx17(t, p, k) {
        var c = p && p.children;
        return c === void 0 ? R.createElement(t, np(p, k)) : R.createElement(t, np(p, k), c);
      }
      function jsxs13(t, p, k) {
        return R.createElement.apply(R, [t, np(p, k)].concat(p.children));
      }
      module.exports = R;
      module.exports.jsx = jsx17;
      module.exports.jsxs = jsxs13;
      module.exports.jsxDEV = function(t, p, k, s) {
        return (s ? jsxs13 : jsx17)(t, p, k);
      };
      module.exports.Fragment = R.Fragment;
    }
  });

  // src/index.ts
  var index_exports = {};
  __export(index_exports, {
    Chain: () => Chain,
    Device: () => Device,
    DevicePortRow: () => DevicePortRow,
    Divider: () => Divider,
    FINE_KEY: () => FINE_KEY,
    Graph: () => Graph,
    GraphContext: () => GraphContext,
    GraphNode: () => GraphNode,
    Knob: () => Knob,
    Label: () => Label,
    Meter: () => Meter,
    NumberField: () => NumberField,
    Panel: () => Panel,
    PanelColumn: () => PanelColumn,
    Port: () => Port,
    Rack: () => Rack,
    Row: () => Row,
    Segmented: () => Segmented,
    Select: () => Select,
    Slider: () => Slider,
    Toggle: () => Toggle,
    Widget: () => Widget,
    clamp: () => clamp,
    defaultOrigin: () => defaultOrigin,
    enumParam: () => enumParam,
    fillFrom: () => fillFrom,
    format: () => format,
    fractionOf: () => fractionOf,
    isFine: () => isFine,
    isSwitch: () => isSwitch,
    itemsOf: () => itemsOf,
    noteName: () => noteName,
    originFraction: () => originFraction,
    portKey: () => portKey,
    quantize: () => quantize,
    readbackTolerance: () => readbackTolerance,
    span: () => span,
    stepSize: () => stepSize,
    useParamGesture: () => useParamGesture,
    usePendingValue: () => usePendingValue,
    useReserved: () => useReserved,
    valueAt: () => valueAt,
    widestText: () => widestText
  });
  init_define_import_meta_env();

  // src/param/param.ts
  init_define_import_meta_env();
  function span(p) {
    const width = p.max - p.min;
    return Math.abs(width) < Number.EPSILON ? 1 : width;
  }
  function clamp(p, value) {
    if (Number.isNaN(value)) return p.min;
    return Math.max(p.min, Math.min(p.max, value));
  }
  function quantize(p, value) {
    let held = clamp(p, value);
    if (p.steps !== void 0 && p.steps >= 2) {
      const intervals = p.steps - 1;
      const linear = (held - p.min) / span(p);
      held = p.min + Math.round(linear * intervals) / intervals * span(p);
    }
    if (p.kind === "int" || p.kind === "enum") held = Math.round(held);
    return clamp(p, held);
  }
  function fractionOf(p, value) {
    const linear = (clamp(p, value) - p.min) / span(p);
    const held = Math.max(0, Math.min(1, linear));
    const exponent = p.exponent ?? 1;
    return exponent === 1 ? held : held ** (1 / exponent);
  }
  function valueAt(p, fraction) {
    const held = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
    const exponent = p.exponent ?? 1;
    const linear = exponent === 1 ? held : held ** exponent;
    return quantize(p, p.min + linear * span(p));
  }
  function stepSize(p, fine = false) {
    if (p.kind === "enum" || p.kind === "int") return 1;
    if (p.steps !== void 0 && p.steps >= 2) return span(p) / (p.steps - 1);
    return Math.abs(span(p)) / (fine ? 1e3 : 100);
  }
  function isSwitch(p) {
    return (p.kind === "int" || p.kind === "enum") && p.max - p.min === 1;
  }
  function enumParam(items, options = {}) {
    return {
      kind: "enum",
      min: 0,
      max: Math.max(0, items.length - 1),
      defaultValue: options.defaultIndex ?? 0,
      items,
      name: options.name
    };
  }

  // src/param/format.ts
  init_define_import_meta_env();
  var SAMPLES = 129;
  var NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  function decimalsFor(width) {
    const size = Math.abs(width);
    if (size <= 20) return 2;
    if (size <= 200) return 1;
    return 0;
  }
  function fixed(value, decimals) {
    const held = Object.is(value, -0) ? 0 : value;
    return held.toFixed(decimals);
  }
  function sprintf(pattern, value) {
    return pattern.replace(
      /%(-)?(0)?(\d+)?(?:\.(\d+))?([dfs])/,
      (_match, left, zero, width, precision, conversion) => {
        let text;
        if (conversion === "d") text = String(Math.round(value));
        else if (conversion === "f") text = value.toFixed(precision ? Number(precision) : 6);
        else text = String(value);
        const target = width ? Number(width) : 0;
        if (text.length >= target) return text;
        const pad = (zero && !left ? "0" : " ").repeat(target - text.length);
        return left ? text + pad : pad + text;
      }
    );
  }
  function noteName(value) {
    const note = Math.round(value);
    const name = NOTES[(note % 12 + 12) % 12];
    return `${name}${Math.floor(note / 12) - 2}`;
  }
  function panText(p, value) {
    const reach = Math.max(Math.abs(p.min), Math.abs(p.max), Number.EPSILON);
    const amount = Math.round(Math.abs(value) / reach * 50);
    if (amount === 0) return "C";
    return `${amount}${value < 0 ? "L" : "R"}`;
  }
  function format(p, value) {
    if (p.kind === "enum" && p.items?.length) {
      return p.items[Math.max(0, Math.min(p.items.length - 1, Math.round(value)))] ?? "";
    }
    const held = clamp(p, value);
    const decimals = decimalsFor(span(p));
    switch (p.unit ?? "native") {
      case "int":
        return String(Math.round(held));
      case "time":
        return Math.abs(held) < 1e3 ? `${fixed(held, held === Math.round(held) ? 0 : 1)} ms` : `${fixed(held / 1e3, 2)} s`;
      case "hertz":
        return Math.abs(held) < 1e3 ? `${fixed(held, decimalsFor(1e3))} Hz` : `${fixed(held / 1e3, 2)} kHz`;
      case "decibel":
        return Number.isFinite(held) ? `${fixed(held, 1)} dB` : "-inf dB";
      case "percent":
        return `${fixed(held, 0)} %`;
      case "pan":
        return panText(p, held);
      case "semitones":
        return `${held > 0 ? "+" : ""}${fixed(held, 0)} st`;
      case "midi":
        return noteName(held);
      case "custom": {
        const pattern = p.customUnit ?? "";
        if (/%[-0-9.]*[dfs]/.test(pattern)) return sprintf(pattern, held);
        return pattern ? `${fixed(held, decimals)} ${pattern}` : fixed(held, decimals);
      }
      case "float":
      case "native":
      default:
        return p.kind === "int" ? String(Math.round(held)) : fixed(held, decimals);
    }
  }
  function widestText(p) {
    if (p.kind === "enum" && p.items?.length) {
      return p.items.reduce((widest2, item) => Math.max(widest2, item.length), 0);
    }
    const reach = p.kind === "int" ? Math.round(Math.abs(span(p))) + 1 : SAMPLES;
    const count = Math.max(2, Math.min(reach, SAMPLES));
    let widest = 0;
    for (let i = 0; i < count; i += 1) {
      widest = Math.max(widest, format(p, p.min + span(p) * i / (count - 1)).length);
    }
    return widest;
  }

  // src/gesture/useParamGesture.ts
  init_define_import_meta_env();
  var import_react = __toESM(require_react_shim(), 1);

  // src/gesture/platform.ts
  init_define_import_meta_env();
  var IS_MAC = typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(
    navigator.userAgent + " " + (navigator.platform ?? "")
  );
  var FINE_KEY = IS_MAC ? "\u2318" : "Ctrl";
  function isFine(e) {
    return IS_MAC ? e.metaKey : e.ctrlKey;
  }

  // src/gesture/useParamGesture.ts
  var DEFAULT_TRAVEL = 200;
  var FINE_FACTOR = 10;
  var DEPTH_REACH = 1.5;
  function useParamGesture(options) {
    const {
      param,
      value,
      onChange,
      onRelease,
      disabled = false,
      depth,
      onDepth,
      axis = "vertical",
      anchor = "value",
      travel = DEFAULT_TRAVEL,
      label,
      display
    } = options;
    const [dragging, setDragging] = (0, import_react.useState)(false);
    const latest = (0, import_react.useRef)({ param, value, onChange, onRelease, disabled, depth, onDepth });
    latest.current = { param, value, onChange, onRelease, disabled, depth, onDepth };
    const drag = (0, import_react.useRef)(null);
    const pending = (0, import_react.useRef)(null);
    const frame = (0, import_react.useRef)(null);
    const sent = (0, import_react.useRef)(Number.NaN);
    const flush = (0, import_react.useCallback)(() => {
      frame.current = null;
      const next = pending.current;
      pending.current = null;
      if (next !== null) latest.current.onChange(next);
    }, []);
    const emit = (0, import_react.useCallback)(
      (next) => {
        if (next === sent.current) return;
        sent.current = next;
        pending.current = next;
        if (frame.current === null) frame.current = requestAnimationFrame(flush);
      },
      [flush]
    );
    (0, import_react.useEffect)(
      () => () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      },
      []
    );
    const finish = (0, import_react.useCallback)(() => {
      if (drag.current === null) return;
      drag.current = null;
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        flush();
      }
      setDragging(false);
      latest.current.onRelease?.();
    }, [flush]);
    const onPointerDown = (0, import_react.useCallback)(
      (e) => {
        const now = latest.current;
        if (now.disabled || e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture(e.pointerId);
        sent.current = now.value;
        let fraction = fractionOf(now.param, now.value);
        if (anchor === "pointer") {
          const box = e.currentTarget.getBoundingClientRect();
          const along = axis === "vertical" ? (box.bottom - e.clientY) / (box.height || 1) : (e.clientX - box.left) / (box.width || 1);
          fraction = Math.max(0, Math.min(1, along));
          emit(valueAt(now.param, fraction));
        }
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, fraction, depth: now.depth ?? 1 };
        setDragging(true);
      },
      [anchor, axis, emit]
    );
    const onPointerMove = (0, import_react.useCallback)(
      (e) => {
        const held = drag.current;
        if (held === null || held.id !== e.pointerId) return;
        const moved = axis === "vertical" ? held.y - e.clientY : e.clientX - held.x;
        held.x = e.clientX;
        held.y = e.clientY;
        const reach = travel * (isFine(e) ? FINE_FACTOR : 1);
        const now = latest.current;
        if (e.shiftKey && now.onDepth) {
          held.depth = Math.max(-1, Math.min(1, held.depth + moved / (reach * DEPTH_REACH)));
          now.onDepth(held.depth);
          return;
        }
        held.fraction = Math.max(0, Math.min(1, held.fraction + moved / reach));
        emit(valueAt(now.param, held.fraction));
      },
      [axis, emit, travel]
    );
    const onPointerUp = (0, import_react.useCallback)(
      (e) => {
        if (drag.current?.id === e.pointerId) finish();
      },
      [finish]
    );
    const onDoubleClick = (0, import_react.useCallback)((e) => {
      const now = latest.current;
      if (now.disabled) return;
      if (e.shiftKey && now.onDepth) {
        now.onDepth(0);
        finish();
        return;
      }
      emit(quantize(now.param, now.param.defaultValue));
      finish();
    }, [emit, finish]);
    const onKeyDown = (0, import_react.useCallback)(
      (e) => {
        const now = latest.current;
        if (now.disabled) return;
        const step = stepSize(now.param, isFine(e));
        let next;
        switch (e.key) {
          case "ArrowUp":
          case "ArrowRight":
            next = now.value + step;
            break;
          case "ArrowDown":
          case "ArrowLeft":
            next = now.value - step;
            break;
          case "PageUp":
            next = now.value + step * 10;
            break;
          case "PageDown":
            next = now.value - step * 10;
            break;
          case "Home":
            next = now.param.min;
            break;
          case "End":
            next = now.param.max;
            break;
          default:
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        sent.current = Number.NaN;
        emit(quantize(now.param, clamp(now.param, next)));
        now.onRelease?.();
      },
      [emit]
    );
    return {
      dragging,
      fraction: fractionOf(param, value),
      text: display ?? format(param, value),
      props: {
        role: "slider",
        tabIndex: disabled ? -1 : 0,
        "aria-label": label,
        "aria-valuemin": param.min,
        "aria-valuemax": param.max,
        "aria-valuenow": value,
        "aria-valuetext": display ?? format(param, value),
        "aria-orientation": axis,
        "aria-disabled": disabled || void 0,
        "data-dragging": dragging ? "" : void 0,
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onDoubleClick,
        onKeyDown
      }
    };
  }

  // src/gesture/usePendingValue.ts
  init_define_import_meta_env();
  var import_react2 = __toESM(require_react_shim(), 1);
  function usePendingValue(reported, options = {}) {
    const { tolerance = 1e-4, timeout = 750 } = options;
    const [pending, setPending] = (0, import_react2.useState)(null);
    const deadline = (0, import_react2.useRef)(null);
    (0, import_react2.useEffect)(() => {
      if (pending === null || reported === null) return;
      if (Math.abs(reported - pending) <= tolerance) setPending(null);
    }, [pending, reported, tolerance]);
    (0, import_react2.useEffect)(
      () => () => {
        if (deadline.current !== null) window.clearTimeout(deadline.current);
      },
      []
    );
    return {
      value: pending ?? reported,
      push(next) {
        setPending(next);
        if (deadline.current !== null) window.clearTimeout(deadline.current);
        deadline.current = window.setTimeout(() => setPending(null), timeout);
      },
      release() {
        if (deadline.current !== null) window.clearTimeout(deadline.current);
        setPending(null);
      }
    };
  }
  function readbackTolerance(min, max) {
    return Math.max(1e-4, Math.abs(max - min) / 2e3);
  }

  // src/controls/fill.ts
  init_define_import_meta_env();
  var CENTERED = 0.1;
  function defaultOrigin(param) {
    if (param.min >= 0 || param.max <= 0) return "min";
    return Math.abs(fractionOf(param, 0) - 0.5) <= CENTERED ? "center" : "min";
  }
  function originFraction(param, origin) {
    return origin === "center" ? fractionOf(param, 0) : 0;
  }
  function fillFrom(param, origin, fraction) {
    const from = originFraction(param, origin);
    return {
      "--wdg-fraction": fraction,
      "--wdg-fill-start": Math.min(fraction, from),
      "--wdg-fill-size": Math.abs(fraction - from)
    };
  }

  // src/controls/reserve.ts
  init_define_import_meta_env();
  var import_react3 = __toESM(require_react_shim(), 1);
  function useReserved(param) {
    return (0, import_react3.useMemo)(
      () => param ? { "--wdg-chars": widestText(param) } : {},
      [param]
    );
  }

  // src/controls/Widget.tsx
  init_define_import_meta_env();
  var import_jsx_runtime = __toESM(require_react_shim(), 1);
  function Widget({
    kind,
    param,
    name,
    readout,
    layout = "stacked",
    disabled = false,
    vars,
    className,
    title,
    children
  }) {
    const reserved = useReserved(param);
    return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "div",
      {
        className: `wdg wdg-widget wdg-${kind}${className ? ` ${className}` : ""}`,
        "data-layout": layout,
        ...disabled ? { "data-disabled": "" } : {},
        style: { ...reserved, ...vars },
        children: [
          name && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wdg-caption", children: name }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "wdg-body", title, children }),
          readout !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "wdg-readout", children: readout })
        ]
      }
    );
  }

  // src/controls/Knob.tsx
  init_define_import_meta_env();

  // src/controls/arc.ts
  init_define_import_meta_env();
  var DIAL_CENTER = 20;
  var DIAL_RADIUS = 15;
  var DIAL_START = -135;
  var DIAL_END = 135;
  var DIAL_VIEWBOX_TOP = 2;
  var DIAL_VIEWBOX_HEIGHT = 32;
  function dialAngle(fraction) {
    return DIAL_START + fraction * (DIAL_END - DIAL_START);
  }
  function dialPoint(degrees, radius = DIAL_RADIUS) {
    const radians = degrees * Math.PI / 180;
    return [
      DIAL_CENTER + radius * Math.sin(radians),
      DIAL_CENTER - radius * Math.cos(radians)
    ];
  }
  function dialArc(fromDegrees, toDegrees) {
    if (Math.abs(toDegrees - fromDegrees) < 0.5) return null;
    const [x0, y0] = dialPoint(fromDegrees);
    const [x1, y1] = dialPoint(toDegrees);
    const large = Math.abs(toDegrees - fromDegrees) > 180 ? 1 : 0;
    const sweep = toDegrees >= fromDegrees ? 1 : 0;
    return `M ${x0} ${y0} A ${DIAL_RADIUS} ${DIAL_RADIUS} 0 ${large} ${sweep} ${x1} ${y1}`;
  }

  // src/controls/Knob.tsx
  var import_jsx_runtime2 = __toESM(require_react_shim(), 1);
  function Knob({
    param,
    value,
    onChange,
    onRelease,
    disabled = false,
    display,
    label,
    name = param.shortName ?? param.name,
    origin = defaultOrigin(param),
    showValue = true,
    travel,
    layout,
    className,
    title
  }) {
    const gesture = useParamGesture({
      param,
      value,
      onChange,
      onRelease,
      disabled,
      axis: "vertical",
      travel,
      label: label ?? name,
      display
    });
    const angle = dialAngle(gesture.fraction);
    const from = dialAngle(originFraction(param, origin));
    const fill = dialArc(from, angle);
    const [nx, ny] = dialPoint(angle, 6);
    const [mx, my] = dialPoint(angle, 13.5);
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      Widget,
      {
        kind: "knob",
        param,
        name,
        readout: showValue ? gesture.text : void 0,
        layout,
        disabled,
        className,
        title,
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { className: "wdg-knob-dial", ...gesture.props, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { viewBox: `0 ${DIAL_VIEWBOX_TOP} 40 ${DIAL_VIEWBOX_HEIGHT}`, "aria-hidden": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { className: "wdg-knob-empty", d: dialArc(dialAngle(0), dialAngle(1)) ?? void 0 }),
          fill && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { className: "wdg-knob-fill", d: fill }),
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("line", { className: "wdg-knob-marker", x1: nx, y1: ny, x2: mx, y2: my })
        ] }) })
      }
    );
  }

  // src/controls/Slider.tsx
  init_define_import_meta_env();
  var import_jsx_runtime3 = __toESM(require_react_shim(), 1);
  function Slider({
    param,
    value,
    onChange,
    onRelease,
    depth,
    onDepth,
    live,
    disabled = false,
    display,
    label,
    name = param.shortName ?? param.name,
    orientation = "vertical",
    origin = defaultOrigin(param),
    showValue = true,
    length = 27,
    travel,
    layout,
    className,
    title
  }) {
    const gesture = useParamGesture({
      param,
      value,
      onChange,
      onRelease,
      depth,
      onDepth,
      disabled,
      axis: orientation,
      // `length` is the drawn extent, and gearing to it is right for a fader
      // whose size is its own. An `inside` one is stretched to whatever row it
      // landed in, so `length` describes nothing — 27 of them geared a 140px
      // control to 27px of drag, which is 4% of the range per pixel and a thumb
      // running five times ahead of the pointer. Fall through to the hook's own
      // travel instead, which is the 200px an unsized control assumes.
      travel: travel ?? (layout === "inside" ? void 0 : length),
      label: label ?? name,
      display
    });
    const reach = depth ?? 0;
    const far = Math.max(0, Math.min(1, gesture.fraction + reach));
    const span2 = onDepth === void 0 || reach === 0 ? null : { at: Math.min(gesture.fraction, far), size: Math.abs(far - gesture.fraction) };
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      Widget,
      {
        kind: "slider",
        param,
        name,
        readout: showValue ? gesture.text : void 0,
        layout,
        disabled,
        className: `wdg-slider-${orientation}${className ? ` ${className}` : ""}`,
        title,
        vars: {
          "--wdg-slider-length": `${length}px`,
          ...fillFrom(param, origin, gesture.fraction),
          // The span as a start and a width, both fractions, so the drawing is
          // two custom properties and no arithmetic in CSS. Clamped to the rail
          // because a range carried past the end still reads there, and stored
          // unclamped so it means something again when the value moves back.
          ...span2 === null ? {} : { "--wdg-span-at": span2.at, "--wdg-span-size": span2.size },
          ...live === void 0 ? {} : { "--wdg-live": Math.max(0, Math.min(1, live)) }
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "wdg-slider-body", ...gesture.props, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wdg-slider-fill", "aria-hidden": "true" }),
          span2 !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wdg-slider-span", "aria-hidden": "true" }),
          live !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wdg-slider-live", "aria-hidden": "true" }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "wdg-slider-thumb", "aria-hidden": "true" })
        ] })
      }
    );
  }

  // src/controls/Meter.tsx
  init_define_import_meta_env();
  var import_jsx_runtime4 = __toESM(require_react_shim(), 1);
  var clamp2 = (v) => Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
  function Meter({
    value,
    peak,
    orientation = "horizontal",
    name,
    label,
    layout,
    display,
    showValue = false,
    width,
    length,
    className,
    title
  }) {
    const level = clamp2(value);
    const held = peak === void 0 ? void 0 : clamp2(peak);
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      Widget,
      {
        kind: "meter",
        name,
        readout: showValue ? display ?? String(Math.round(level * 100)) : void 0,
        layout,
        className,
        title,
        vars: {
          ...width === void 0 ? {} : { "--wdg-meter-width": `${width}px` },
          ...length === void 0 ? {} : { "--wdg-meter-length": `${length}px` },
          "--wdg-meter-fill": level,
          ...held === void 0 ? {} : { "--wdg-meter-peak": held }
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "div",
          {
            className: `wdg-meter-body wdg-body wdg-meter-${orientation}`,
            role: "meter",
            "aria-valuenow": Math.round(level * 100),
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-label": label ?? name,
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("i", { className: "wdg-meter-level" }),
              held !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("i", { className: "wdg-meter-hold" })
            ]
          }
        )
      }
    );
  }

  // src/controls/NumberField.tsx
  init_define_import_meta_env();
  var import_react4 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime5 = __toESM(require_react_shim(), 1);
  var OPENS_EDITOR = /^[-+.0-9]$/;
  function NumberField({
    param,
    value,
    onChange,
    onRelease,
    disabled = false,
    display,
    label,
    name = param.shortName ?? param.name,
    editable = true,
    showFill = true,
    origin = defaultOrigin(param),
    width,
    travel,
    className,
    title
  }) {
    const [draft, setDraft] = (0, import_react4.useState)(null);
    const reserved = useReserved(param);
    const typeable = editable && param.kind !== "enum" && param.kind !== "blob" && !disabled;
    const gesture = useParamGesture({
      param,
      value,
      onChange,
      onRelease,
      disabled,
      axis: "horizontal",
      travel,
      label: label ?? name,
      display
    });
    const commit = (0, import_react4.useCallback)(
      (text) => {
        setDraft(null);
        const parsed = Number.parseFloat(text);
        if (Number.isNaN(parsed)) return;
        onChange(quantize(param, clamp(param, parsed)));
        onRelease?.();
      },
      [onChange, onRelease, param]
    );
    const onKeyDown = (e) => {
      if (typeable && (e.key === "Enter" || OPENS_EDITOR.test(e.key))) {
        e.preventDefault();
        e.stopPropagation();
        setDraft(e.key === "Enter" ? "" : e.key);
        return;
      }
      gesture.props.onKeyDown(e);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
      "div",
      {
        className: `wdg wdg-number${className ? ` ${className}` : ""}`,
        style: {
          ...reserved,
          ...fillFrom(param, origin, gesture.fraction),
          ...width === void 0 ? {} : { "--wdg-number-width": `${width}px` }
        },
        children: [
          name && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "wdg-caption", children: name }),
          draft === null ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: "wdg-number-body wdg-body", title, ...gesture.props, onKeyDown, children: [
            showFill && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "wdg-number-fill", "aria-hidden": "true" }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "wdg-number-text", children: gesture.text }),
            showFill && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: "wdg-number-ink", "aria-hidden": "true", children: gesture.text })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
            "input",
            {
              className: "wdg-number-body wdg-body wdg-number-input",
              ref: (node) => {
                node?.focus();
              },
              value: draft,
              "aria-label": label ?? name,
              inputMode: "decimal",
              onChange: (e) => setDraft(e.currentTarget.value),
              onBlur: (e) => commit(e.currentTarget.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") commit(e.currentTarget.value);
                else if (e.key === "Escape") setDraft(null);
                else return;
                e.preventDefault();
              }
            }
          )
        ]
      }
    );
  }

  // src/controls/Toggle.tsx
  init_define_import_meta_env();
  var import_jsx_runtime6 = __toESM(require_react_shim(), 1);
  function Toggle({
    on,
    onChange,
    disabled = false,
    label,
    name,
    momentary = false,
    width,
    className,
    title,
    children
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
      "div",
      {
        className: `wdg wdg-toggle${className ? ` ${className}` : ""}`,
        style: width === void 0 ? {} : { "--wdg-toggle-width": `${width}px` },
        children: [
          name && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: "wdg-caption", children: name }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: "wdg-toggle-body wdg-body",
              ...on ? { "data-on": "" } : {},
              "aria-pressed": momentary ? void 0 : on,
              "aria-label": label ?? name,
              disabled,
              title,
              onPointerDown: momentary ? () => onChange(true) : void 0,
              onPointerUp: momentary ? () => onChange(false) : void 0,
              onPointerLeave: momentary && on ? () => onChange(false) : void 0,
              onClick: momentary ? void 0 : () => onChange(!on),
              children
            }
          )
        ]
      }
    );
  }

  // src/controls/Segmented.tsx
  init_define_import_meta_env();
  var import_jsx_runtime7 = __toESM(require_react_shim(), 1);
  function itemsOf(param) {
    return param.items ?? [];
  }
  function Segmented({
    items,
    index,
    onChange,
    disabled = false,
    label,
    name,
    orientation = "horizontal",
    className,
    title
  }) {
    const move = (e, by) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(Math.max(0, Math.min(items.length - 1, index + by)));
    };
    return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: `wdg wdg-segmented${className ? ` ${className}` : ""}`, children: [
      name && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "wdg-caption", children: name }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
        "div",
        {
          className: `wdg-segmented-body wdg-body wdg-segmented-${orientation}`,
          role: "radiogroup",
          "aria-label": label ?? name,
          "aria-disabled": disabled || void 0,
          title,
          onKeyDown: (e) => {
            if (disabled) return;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") move(e, 1);
            else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(e, -1);
          },
          children: items.map((item, at) => /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
            "button",
            {
              type: "button",
              role: "radio",
              "aria-checked": at === index,
              tabIndex: at === index ? 0 : -1,
              disabled,
              onClick: () => onChange(at),
              children: item
            },
            item
          ))
        }
      )
    ] });
  }

  // src/controls/Select.tsx
  init_define_import_meta_env();
  var import_jsx_runtime8 = __toESM(require_react_shim(), 1);
  function Select({
    items,
    index,
    onChange,
    disabled = false,
    label,
    name,
    width,
    className,
    title
  }) {
    const chars = Math.max(0, ...items.map((item) => item.length));
    return /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
      "div",
      {
        className: `wdg wdg-select${className ? ` ${className}` : ""}`,
        style: {
          "--wdg-select-chars": chars,
          ...width === void 0 ? {} : { "--wdg-select-width": `${width}px` }
        },
        children: [
          name && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("span", { className: "wdg-caption", children: name }),
          /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
            "select",
            {
              className: "wdg-select-body wdg-body",
              value: Math.max(0, Math.min(items.length - 1, index)),
              "aria-label": label ?? name,
              disabled,
              title,
              onChange: (event) => onChange(Number(event.currentTarget.value)),
              children: items.map((item, at) => /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("option", { value: at, children: item }, `${item}-${at}`))
            }
          )
        ]
      }
    );
  }

  // src/controls/Label.tsx
  init_define_import_meta_env();
  var import_jsx_runtime9 = __toESM(require_react_shim(), 1);
  function Label({ children, heading = false, className }) {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "span",
      {
        className: `wdg wdg-label${heading ? " wdg-label-heading" : ""}${className ? ` ${className}` : ""}`,
        children
      }
    );
  }
  function Divider({
    orientation = "horizontal",
    className
  }) {
    return /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
      "span",
      {
        className: `wdg wdg-divider wdg-divider-${orientation}${className ? ` ${className}` : ""}`,
        role: "separator",
        "aria-orientation": orientation
      }
    );
  }

  // src/chrome/Chain.tsx
  init_define_import_meta_env();
  var import_react5 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime10 = __toESM(require_react_shim(), 1);
  function Chain({ children, dropAt, placeholder, rows, height, className }) {
    const devices = import_react5.Children.toArray(children);
    const marked = dropAt === void 0 ? devices : [
      ...devices.slice(0, dropAt),
      /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "wdg-chain-drop", "aria-hidden": "true" }, "wdg-drop"),
      ...devices.slice(dropAt)
    ];
    return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
      "div",
      {
        className: `wdg wdg-chain${className ? ` ${className}` : ""}`,
        style: {
          ...rows === void 0 ? {} : { "--wdg-device-rows": rows },
          ...height === void 0 ? {} : { "--wdg-chain-height": `${height}px` }
        },
        children: devices.length === 0 && placeholder !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("span", { className: "wdg-chain-empty", children: placeholder }) : marked
      }
    );
  }

  // src/chrome/Device.tsx
  init_define_import_meta_env();
  var import_jsx_runtime11 = __toESM(require_react_shim(), 1);
  function Device({
    name,
    on = true,
    onToggle,
    folded = false,
    onFold,
    selected = false,
    onSelect,
    onHotSwap,
    headerStart,
    headerAfterName,
    headerEnd,
    inlets,
    outlets,
    screen,
    chooser,
    portRows,
    children,
    vars,
    className,
    title
  }) {
    const rowAligned = portRows !== void 0;
    const ported = inlets !== void 0 || outlets !== void 0;
    const select = onSelect ? {
      tabIndex: 0,
      onPointerDown: () => onSelect(),
      onKeyDown: (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        onSelect();
      }
    } : {};
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)(
      "div",
      {
        className: `wdg wdg-device${className ? ` ${className}` : ""}`,
        ...on ? { "data-on": "" } : {},
        ...folded ? { "data-folded": "" } : {},
        ...selected ? { "data-selected": "" } : {},
        ...rowAligned ? { "data-port-layout": "rows" } : {},
        style: vars,
        title,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "wdg-device-head", ...select, children: [
            onFold && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              "button",
              {
                type: "button",
                className: "wdg-device-fold",
                "aria-expanded": !folded,
                "aria-label": `Fold ${name}`,
                onClick: () => onFold(!folded),
                children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("svg", { viewBox: "0 0 8 8", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M1.5 2.75H6.5L4 6.25Z" }) })
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
              "button",
              {
                type: "button",
                className: "wdg-device-power",
                ...on ? { "data-on": "" } : {},
                "aria-pressed": on,
                "aria-label": `${name} active`,
                onClick: () => onToggle?.(!on)
              }
            ),
            headerStart,
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("span", { className: "wdg-device-name", children: name }),
            headerAfterName,
            (onHotSwap || headerEnd) && /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("span", { className: "wdg-device-head-end", children: [
              onHotSwap && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(
                "button",
                {
                  type: "button",
                  className: "wdg-device-swap",
                  "aria-label": `Swap ${name} preset`,
                  onClick: onHotSwap,
                  children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("svg", { viewBox: "0 0 10 10", "aria-hidden": "true", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M1.5 3.5H7.5M5.75 1.75 7.5 3.5 5.75 5.25" }),
                    /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("path", { d: "M8.5 6.5H2.5M4.25 4.75 2.5 6.5 4.25 8.25" })
                  ] })
                }
              ),
              headerEnd
            ] })
          ] }),
          !folded && // The body stays the device's only child when there are no ports, so a
          // chain's height and stretch chain is exactly what it always was.
          (rowAligned ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "wdg-device-row-face", children: [
            screen !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-screen", children: screen }),
            outlets !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-outlets", children: outlets }),
            chooser !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-chooser", children: chooser }),
            children !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-body", children }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-port-rows", children: portRows })
          ] }) : ported ? /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "wdg-device-main", children: [
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-ports", "data-side": "in", children: inlets }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-body", children }),
            /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-ports", "data-side": "out", children: outlets })
          ] }) : /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-body", children }))
        ]
      }
    );
  }
  function DevicePortRow({ inlet, outlet, children, className }) {
    return /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: `wdg-device-port-row${className ? ` ${className}` : ""}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-row-port", "data-side": "in", children: inlet }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-row-control", children }),
      /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "wdg-device-row-port", "data-side": "out", children: outlet })
    ] });
  }

  // src/chrome/Graph.tsx
  init_define_import_meta_env();
  var import_react7 = __toESM(require_react_shim(), 1);

  // src/chrome/graphContext.ts
  init_define_import_meta_env();
  var import_react6 = __toESM(require_react_shim(), 1);
  function portKey(id, side) {
    return `${side} ${id}`;
  }
  var GraphContext = (0, import_react6.createContext)(null);

  // src/chrome/Graph.tsx
  var import_jsx_runtime12 = __toESM(require_react_shim(), 1);
  var NUDGE = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };
  var INTERACTIVE = 'button, input, select, textarea, a[href], [role="slider"], [role="radio"]';
  var IGNORES_ARROWS = 'input, [role="slider"], [role="radio"], .wdg-port';
  var opposite = (side) => side === "out" ? "in" : "out";
  function cordPath(a, b) {
    const reach = Math.max(30, Math.abs(b.x - a.x) * 0.5);
    return `M ${a.x} ${a.y} C ${a.x + reach} ${a.y}, ${b.x - reach} ${b.y}, ${b.x} ${b.y}`;
  }
  function Graph({
    children,
    cords,
    onConnect,
    onMove,
    onClearSelection,
    viewRef,
    minZoom = 0.25,
    maxZoom = 3,
    grid = 24,
    className
  }) {
    const viewport = (0, import_react7.useRef)(null);
    const content = (0, import_react7.useRef)(null);
    const [view, setView] = (0, import_react7.useState)({ x: 0, y: 0, k: 1 });
    const [drawing, setDrawing] = (0, import_react7.useState)(null);
    const [over, setOver] = (0, import_react7.useState)(null);
    const [panning, setPanning] = (0, import_react7.useState)(false);
    const elements = (0, import_react7.useRef)(/* @__PURE__ */ new Map());
    const spots = (0, import_react7.useRef)(/* @__PURE__ */ new Map());
    const sizes = (0, import_react7.useRef)(null);
    const [, redraw] = (0, import_react7.useState)(0);
    const now = (0, import_react7.useRef)({ view, drawing, over, onMove, onConnect });
    (0, import_react7.useImperativeHandle)(viewRef, () => ({ scale: () => now.current.view.k }), [viewRef]);
    const measure = (0, import_react7.useCallback)(() => {
      const origin = content.current?.getBoundingClientRect();
      if (!origin) return;
      const k = now.current.view.k;
      const next = /* @__PURE__ */ new Map();
      let changed = elements.current.size !== spots.current.size;
      for (const [at, { id, side, el }] of elements.current) {
        const box = el.getBoundingClientRect();
        const spot = {
          x: (box.left + box.width / 2 - origin.left) / k,
          y: (box.top + box.height / 2 - origin.top) / k,
          side,
          id
        };
        next.set(at, spot);
        const was = spots.current.get(at);
        if (!was || Math.abs(was.x - spot.x) > 0.01 || Math.abs(was.y - spot.y) > 0.01) changed = true;
      }
      spots.current = next;
      if (changed) redraw((n) => n + 1);
    }, []);
    (0, import_react7.useLayoutEffect)(() => {
      now.current = { view, drawing, over, onMove, onConnect };
      measure();
    });
    (0, import_react7.useEffect)(() => () => sizes.current?.disconnect(), []);
    const register = (0, import_react7.useCallback)(
      (id, side, el) => {
        const at = portKey(id, side);
        const held = elements.current.get(at);
        if (held) {
          sizes.current?.unobserve(held.el);
          elements.current.delete(at);
        }
        if (el) {
          sizes.current ?? (sizes.current = new ResizeObserver(() => measure()));
          elements.current.set(at, { id, side, el });
          sizes.current.observe(el);
        }
        measure();
      },
      [measure]
    );
    const toGraph = (0, import_react7.useCallback)((clientX, clientY) => {
      const origin = content.current?.getBoundingClientRect();
      if (!origin) return { x: 0, y: 0 };
      const k = now.current.view.k;
      return { x: (clientX - origin.left) / k, y: (clientY - origin.top) / k };
    }, []);
    const land = (0, import_react7.useCallback)((target) => {
      const held = now.current.drawing;
      setDrawing(null);
      if (!held || !target || target === held.at) return;
      const spot = spots.current.get(target);
      if (!spot || spot.side !== opposite(held.side)) return;
      const [from, to] = held.side === "out" ? [held.id, spot.id] : [spot.id, held.id];
      now.current.onConnect?.(from, to);
    }, []);
    const startCord = (0, import_react7.useCallback)(
      (id, side, e) => {
        setDrawing({ at: portKey(id, side), id, side, ...toGraph(e.clientX, e.clientY) });
      },
      [toGraph]
    );
    const armCord = (0, import_react7.useCallback)(
      (id, side) => {
        const at = portKey(id, side);
        if (now.current.drawing) {
          land(at);
          return;
        }
        const spot = spots.current.get(at);
        setDrawing({ at, id, side, x: spot?.x ?? 0, y: spot?.y ?? 0 });
      },
      [land]
    );
    const hoverPort = (0, import_react7.useCallback)((id, side) => {
      setOver(id !== null && side ? portKey(id, side) : null);
    }, []);
    const drawingOut = drawing !== null;
    (0, import_react7.useEffect)(() => {
      if (!drawingOut) return;
      const move = (e) => {
        setDrawing((held) => held ? { ...held, ...toGraph(e.clientX, e.clientY) } : held);
      };
      const up = () => land(now.current.over);
      const key = (e) => {
        if (e.key === "Escape") setDrawing(null);
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("keydown", key);
      return () => {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("keydown", key);
      };
    }, [drawingOut, toGraph, land]);
    (0, import_react7.useEffect)(() => {
      const el = viewport.current;
      if (!el) return;
      const wheel = (e) => {
        e.preventDefault();
        const box = el.getBoundingClientRect();
        const px = e.clientX - box.left;
        const py = e.clientY - box.top;
        setView((v) => {
          const k = Math.min(maxZoom, Math.max(minZoom, v.k * Math.exp(-e.deltaY * 15e-4)));
          if (k === v.k) return v;
          return { k, x: px - (px - v.x) / v.k * k, y: py - (py - v.y) / v.k * k };
        });
      };
      el.addEventListener("wheel", wheel, { passive: false });
      return () => el.removeEventListener("wheel", wheel);
    }, [minZoom, maxZoom]);
    const pan = (0, import_react7.useRef)(
      null
    );
    const wants = drawing ? opposite(drawing.side) : null;
    const surface = (0, import_react7.useMemo)(
      () => ({
        register,
        startCord,
        armCord,
        hoverPort,
        cordFrom: drawing?.at ?? null,
        cordWants: wants,
        cordOver: over,
        scale: () => now.current.view.k,
        moveNode: (id, x, y) => now.current.onMove?.(id, x, y)
      }),
      [register, startCord, armCord, hoverPort, drawing?.at, wants, over]
    );
    const drawn = (cords ?? []).flatMap((cord) => {
      const a = spots.current.get(portKey(cord.from, "out"));
      const b = spots.current.get(portKey(cord.to, "in"));
      return a && b ? [{ cord, d: cordPath(a, b) }] : [];
    });
    const anchor = drawing ? spots.current.get(drawing.at) : void 0;
    const loose = drawing && anchor ? drawing.side === "out" ? cordPath(anchor, { x: drawing.x, y: drawing.y, side: "in", id: "" }) : cordPath({ x: drawing.x, y: drawing.y, side: "out", id: "" }, anchor) : null;
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "div",
      {
        ref: viewport,
        className: `wdg wdg-graph${className ? ` ${className}` : ""}`,
        ...panning ? { "data-panning": "" } : {},
        style: {
          "--wdg-graph-grid": `${grid * view.k}px`,
          "--wdg-graph-x": `${view.x}px`,
          "--wdg-graph-y": `${view.y}px`
        },
        onPointerDown: (e) => {
          if (e.target !== e.currentTarget) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          pan.current = {
            id: e.pointerId,
            fromX: e.clientX,
            fromY: e.clientY,
            atX: view.x,
            atY: view.y
          };
          setPanning(true);
          onClearSelection?.();
        },
        onPointerMove: (e) => {
          const held = pan.current;
          if (!held || held.id !== e.pointerId) return;
          setView((v) => ({
            ...v,
            x: held.atX + (e.clientX - held.fromX),
            y: held.atY + (e.clientY - held.fromY)
          }));
        },
        onPointerUp: (e) => {
          if (pan.current?.id !== e.pointerId) return;
          pan.current = null;
          setPanning(false);
        },
        onPointerCancel: () => {
          pan.current = null;
          setPanning(false);
        },
        children: /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)(
          "div",
          {
            ref: content,
            className: "wdg-graph-content",
            style: { transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("svg", { className: "wdg-graph-cords", "aria-hidden": "true", children: [
                drawn.map(({ cord, d }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
                  "path",
                  {
                    className: "wdg-graph-cord",
                    d,
                    ...cord.kind === void 0 ? {} : { "data-kind": cord.kind }
                  },
                  `${cord.from} ${cord.to}`
                )),
                loose && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("path", { className: "wdg-graph-cord", "data-pending": "", d: loose })
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(GraphContext.Provider, { value: surface, children })
            ]
          }
        )
      }
    );
  }
  function GraphNode({ id, x, y, children, className }) {
    const graph = (0, import_react7.useContext)(GraphContext);
    const drag = (0, import_react7.useRef)(
      null
    );
    const down = (e) => {
      if (!graph || e.button !== 0 || e.defaultPrevented) return;
      if (e.target.closest(INTERACTIVE)) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { id: e.pointerId, fromX: e.clientX, fromY: e.clientY, atX: x, atY: y };
    };
    const move = (e) => {
      const held = drag.current;
      if (!held || held.id !== e.pointerId || !graph) return;
      const k = graph.scale();
      graph.moveNode(
        id,
        held.atX + (e.clientX - held.fromX) / k,
        held.atY + (e.clientY - held.fromY) / k
      );
    };
    const up = (e) => {
      if (drag.current?.id === e.pointerId) drag.current = null;
    };
    const key = (e) => {
      const step = NUDGE[e.key];
      if (!step || !graph) return;
      if (e.target.closest(IGNORES_ARROWS)) return;
      e.preventDefault();
      const by = e.shiftKey ? 1 : 8;
      graph.moveNode(id, x + step[0] * by, y + step[1] * by);
    };
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      "div",
      {
        className: `wdg-graph-node${className ? ` ${className}` : ""}`,
        style: { left: `${x}px`, top: `${y}px` },
        onPointerDown: down,
        onPointerMove: move,
        onPointerUp: up,
        onPointerCancel: up,
        onKeyDown: key,
        children
      }
    );
  }

  // src/chrome/Port.tsx
  init_define_import_meta_env();
  var import_react8 = __toESM(require_react_shim(), 1);
  var import_jsx_runtime13 = __toESM(require_react_shim(), 1);
  function Port({
    id,
    side,
    label,
    showLabel = true,
    kind,
    connected,
    disabled,
    className
  }) {
    const graph = (0, import_react8.useContext)(GraphContext);
    const ref = (0, import_react8.useRef)(null);
    const register = graph?.register;
    const at = portKey(id, side);
    (0, import_react8.useEffect)(() => {
      if (!register) return;
      register(id, side, ref.current);
      return () => register(id, side, null);
    }, [register, id, side]);
    const down = (e) => {
      if (disabled || !graph) return;
      e.preventDefault();
      e.stopPropagation();
      graph.startCord(id, side, e);
    };
    const key = (e) => {
      if (disabled || !graph) return;
      if (e.key !== "Enter" && e.key !== " ") return;
      e.preventDefault();
      graph.armCord(id, side);
    };
    const reach = !disabled && graph?.cordWants && at !== graph.cordFrom ? graph.cordWants === side ? "open" : "shut" : void 0;
    return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("span", { className: `wdg-port-slot${className ? ` ${className}` : ""}`, "data-side": side, children: [
      /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
        "button",
        {
          ref,
          type: "button",
          className: "wdg-port",
          "data-side": side,
          ...kind === void 0 ? {} : { "data-kind": kind },
          ...connected ? { "data-connected": "" } : {},
          ...graph?.cordFrom === at ? { "data-pending": "" } : {},
          ...graph?.cordOver === at ? { "data-over": "" } : {},
          ...reach === void 0 ? {} : { "data-reach": reach },
          disabled,
          "aria-label": label ?? id,
          title: label,
          onPointerDown: down,
          onPointerEnter: () => graph?.hoverPort(id, side),
          onPointerLeave: () => graph?.hoverPort(null),
          onKeyDown: key
        }
      ),
      showLabel && label !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)("span", { className: "wdg-port-label", children: label })
    ] });
  }

  // src/chrome/Rack.tsx
  init_define_import_meta_env();
  var import_jsx_runtime14 = __toESM(require_react_shim(), 1);
  function Rack({
    macros,
    chains,
    chainAt = 0,
    onChain,
    children,
    className,
    ...device
  }) {
    const folded = device.folded ?? false;
    return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)(
      "div",
      {
        className: `wdg wdg-rack${className ? ` ${className}` : ""}`,
        ...device.on ?? true ? { "data-on": "" } : {},
        ...folded ? { "data-folded": "" } : {},
        ...device.selected ? { "data-selected": "" } : {},
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(Device, { ...device, className: "wdg-rack-face", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: "wdg-rack-panes", children: [
            macros && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "wdg-rack-macros", children: macros }),
            chains && chains.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "wdg-rack-chains", role: "radiogroup", "aria-label": `${device.name} chains`, children: chains.map((name, at) => /* @__PURE__ */ (0, import_jsx_runtime14.jsx)(
              "button",
              {
                type: "button",
                role: "radio",
                "aria-checked": at === chainAt,
                tabIndex: at === chainAt ? 0 : -1,
                onClick: () => onChain?.(at),
                children: name
              },
              name
            )) })
          ] }) }),
          children && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "wdg-rack-devices", children }),
          !folded && /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "wdg-rack-end", "aria-hidden": "true" })
        ]
      }
    );
  }

  // src/chrome/Row.tsx
  init_define_import_meta_env();
  var import_jsx_runtime15 = __toESM(require_react_shim(), 1);
  function Row({ children, gap, className }) {
    return /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
      "div",
      {
        className: `wdg wdg-row${className ? ` ${className}` : ""}`,
        style: gap === void 0 ? {} : { "--wdg-row-gap": `${gap}px` },
        children
      }
    );
  }

  // src/chrome/Panel.tsx
  init_define_import_meta_env();
  var import_jsx_runtime16 = __toESM(require_react_shim(), 1);
  function Panel({ children, rows, gap, className }) {
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
      "div",
      {
        className: `wdg wdg-panel${className ? ` ${className}` : ""}`,
        style: {
          "--wdg-panel-rows": rows,
          ...gap === void 0 ? {} : { "--wdg-panel-gap": `${gap}px` }
        },
        children
      }
    );
  }
  function PanelColumn({ children, className }) {
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: `wdg wdg-panel-column${className ? ` ${className}` : ""}`, children });
  }
  return __toCommonJS(index_exports);
})();
window.BsvWidgets=BsvWidgets.__dsMainNs?Object.assign({},BsvWidgets,BsvWidgets.__dsMainNs,{__dsMainNs:undefined}):BsvWidgets;
