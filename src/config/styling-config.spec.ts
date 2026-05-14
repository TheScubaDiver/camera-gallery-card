import { describe, expect, it } from "vitest";
import {
  CARD_HEIGHT_DEFAULT,
  DEFAULT_BAR_OPACITY,
  PILL_SIZE_DEFAULT,
  ROW_GAP_DEFAULT,
  THUMB_RADIUS,
} from "../const";
import {
  type ColorControl,
  type RadiusControl,
  type SelectControl,
  type SliderControl,
  STYLE_SECTIONS,
  genStyleSectionDefaults,
} from "./styling-config";

const allControls = () => STYLE_SECTIONS.flatMap((s) => s.controls);

const colors = (): ColorControl[] =>
  allControls().filter((c): c is ColorControl => c.type === "color");
const radii = (): RadiusControl[] =>
  allControls().filter((c): c is RadiusControl => c.type === "radius");
const sliders = (): SliderControl[] =>
  allControls().filter((c): c is SliderControl => c.type === "slider");
const selects = (): SelectControl[] =>
  allControls().filter((c): c is SelectControl => c.type === "select");

describe("STYLE_SECTIONS structural invariants", () => {
  it("every section has a unique id", () => {
    const ids = STYLE_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every section has a non-empty label and an mdi: icon", () => {
    for (const s of STYLE_SECTIONS) {
      expect(s.label.trim().length).toBeGreaterThan(0);
      expect(s.icon.startsWith("mdi:")).toBe(true);
    }
  });

  it("every section has at least one control", () => {
    for (const s of STYLE_SECTIONS) {
      expect(s.controls.length).toBeGreaterThan(0);
    }
  });

  it("every CSS variable is unique across the array", () => {
    const vars = [...colors(), ...radii()].map((c) => c.variable);
    expect(new Set(vars).size).toBe(vars.length);
  });

  it("every variable lives in the --cgc-* namespace (audit A1)", () => {
    for (const c of [...colors(), ...radii()]) {
      expect(c.variable).toMatch(/^--cgc-/);
    }
  });

  it("every config key is unique across slider + select controls", () => {
    const keys = [...sliders(), ...selects()].map((c) => c.configKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("slider/radius min < max", () => {
    for (const c of [...sliders(), ...radii()]) {
      expect(c.min).toBeLessThan(c.max);
    }
  });

  it("slider/radius default falls within [min, max]", () => {
    for (const c of [...sliders(), ...radii()]) {
      expect(c.default).toBeGreaterThanOrEqual(c.min);
      expect(c.default).toBeLessThanOrEqual(c.max);
    }
  });

  it("every select has ≥1 option with unique values", () => {
    for (const c of selects()) {
      expect(c.options.length).toBeGreaterThan(0);
      const values = c.options.map((o) => o.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("color hostIds are unique", () => {
    const ids = colors().map((c) => c.hostId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("slider DOM ids and valIds are unique within their kind", () => {
    const ids = sliders().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    const valIds = sliders().map((c) => c.valId);
    expect(new Set(valIds).size).toBe(valIds.length);
  });
});

describe("STYLE_SECTIONS ↔ const.ts cross-checks", () => {
  it("bar_opacity slider default tracks DEFAULT_BAR_OPACITY (audit A2)", () => {
    const c = sliders().find((s) => s.configKey === "bar_opacity");
    expect(c?.default).toBe(DEFAULT_BAR_OPACITY);
  });

  it("--cgc-pill-size radius default tracks PILL_SIZE_DEFAULT", () => {
    const c = radii().find((r) => r.variable === "--cgc-pill-size");
    expect(c?.default).toBe(PILL_SIZE_DEFAULT);
  });

  it("--cgc-thumb-radius default tracks THUMB_RADIUS", () => {
    const c = radii().find((r) => r.variable === "--cgc-thumb-radius");
    expect(c?.default).toBe(THUMB_RADIUS);
  });

  it("row_gap slider default tracks ROW_GAP_DEFAULT", () => {
    const c = sliders().find((s) => s.configKey === "row_gap");
    expect(c?.default).toBe(ROW_GAP_DEFAULT);
  });

  it("card_height slider default tracks CARD_HEIGHT_DEFAULT", () => {
    const c = sliders().find((s) => s.configKey === "card_height");
    expect(c?.default).toBe(CARD_HEIGHT_DEFAULT);
  });
});

describe("genStyleSectionDefaults", () => {
  it("emits one declaration per radius control with `${default}px`", () => {
    const out = genStyleSectionDefaults();
    for (const r of radii()) {
      expect(out).toContain(`${r.variable}: ${r.default}px;`);
    }
  });

  it("emits no declarations for color controls", () => {
    const out = genStyleSectionDefaults();
    for (const c of colors()) {
      // Color defaults live in the `:host` HA-theme-fallback block, not here.
      expect(out).not.toContain(`${c.variable}:`);
    }
  });

  it("emits no declarations for slider/select controls (they write to config)", () => {
    const out = genStyleSectionDefaults();
    for (const s of sliders()) {
      expect(out).not.toContain(s.configKey);
    }
    for (const s of selects()) {
      expect(out).not.toContain(s.configKey);
    }
  });

  it("every emitted line is valid CSS (ends in ;)", () => {
    const out = genStyleSectionDefaults();
    for (const line of out.split("\n").filter(Boolean)) {
      expect(line.trim().endsWith(";")).toBe(true);
    }
  });

  it("emits exactly one declaration per radius control (no duplicates)", () => {
    const out = genStyleSectionDefaults();
    for (const r of radii()) {
      const occurrences = out.split(`${r.variable}:`).length - 1;
      expect(occurrences).toBe(1);
    }
  });
});

describe("SelectControl.disabledFn", () => {
  it("bar_position select is gated on controls_mode === 'fixed'", () => {
    const c = selects().find((s) => s.configKey === "bar_position");
    expect(c?.disabledFn).toBeDefined();
    expect(c?.disabledFn?.({ controls_mode: "fixed" })).toBe(true);
    expect(c?.disabledFn?.({ controls_mode: "overlay" })).toBe(false);
    expect(c?.disabledFn?.({})).toBe(false);
  });
});
