import { readFileSync } from "node:fs";
import path from "node:path";

import postcss, { type AcceptedPlugin, type AtRule, type Root } from "postcss";
import tailwindcss from "tailwindcss";
import { beforeAll, describe, expect, it } from "vitest";

import tailwindConfig from "../tailwind.config";

/**
 * iOS Safari (and installed home-screen web apps) zoom into any focused field
 * whose font-size is below 16px and never zoom back out. Guard: on mobile
 * widths every text field must end up at >= 16px, even with `text-sm`.
 */

const cssPath = path.join(__dirname, "globals.css");

const SAMPLE_MARKUP = `
  <input class="text-sm" /> <input class="text-xs" /> <select class="text-sm"></select>
  <textarea class="text-sm"></textarea> <input type="checkbox" class="text-sm" />
  <p class="text-sm"></p> <input class="text-base md:text-sm" />
`;

let compiled: Root;

beforeAll(async () => {
  // Tailwind is typed against the hoisted root postcss copy, apps/web pins its own —
  // same runtime API, structurally incompatible declarations.
  const tailwind = tailwindcss({
    ...tailwindConfig,
    content: [{ raw: SAMPLE_MARKUP, extension: "html" }]
  }) as AcceptedPlugin;
  const result = await postcss([tailwind]).process(readFileSync(cssPath, "utf8"), { from: cssPath });
  compiled = result.root;
});

/** Mobile media queries: `max-width` below Tailwind's `md` breakpoint (768px). */
function mobileMediaRules(root: Root): AtRule[] {
  const rules: AtRule[] = [];
  root.walkAtRules("media", (at) => {
    const match = at.params.match(/max-width:\s*([\d.]+)px/);
    if (match && Number(match[1]) < 768) rules.push(at);
  });
  return rules;
}

/** Loads the sample markup with the compiled CSS applied as seen on a phone. */
function phoneDocument(): Document {
  const css = compiled.clone();
  // jsdom ignores @media; unwrap mobile queries so they apply, drop all others (md:, lg:, …).
  const mobile = new Set(mobileMediaRules(css));
  css.walkAtRules("media", (at) => {
    if (mobile.has(at)) at.replaceWith(at.nodes ?? []);
    else at.remove();
  });
  document.head.innerHTML = `<style>${css.toString()}</style>`;
  document.body.innerHTML = SAMPLE_MARKUP;
  return document;
}

function fontSizeOf(doc: Document, selector: string): string {
  const el = doc.querySelector(selector);
  if (!el) throw new Error(`no element for ${selector}`);
  return window.getComputedStyle(el).fontSize;
}

describe("globals.css – iOS focus zoom guard", () => {
  it("defines a mobile-only override below the md breakpoint", () => {
    expect(mobileMediaRules(compiled).length).toBeGreaterThan(0);
  });

  it.each([
    ["input.text-sm", 'input.text-sm:not([type="checkbox"])'],
    ["input.text-xs", "input.text-xs"],
    ["select.text-sm", "select.text-sm"],
    ["textarea.text-sm", "textarea.text-sm"]
  ])("raises %s to 16px on phones", (_label, selector) => {
    expect(fontSizeOf(phoneDocument(), selector)).toBe("1rem");
  });

  it("leaves non-field text-sm elements untouched", () => {
    expect(fontSizeOf(phoneDocument(), "p.text-sm")).toBe("0.875rem");
  });

  it("does not resize checkboxes", () => {
    expect(fontSizeOf(phoneDocument(), 'input[type="checkbox"]')).toBe("0.875rem");
  });
});
