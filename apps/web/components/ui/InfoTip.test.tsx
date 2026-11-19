import { render, screen, waitFor, within } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { I18nProvider } from "../../lib/i18n";
import { de } from "../../lib/locales/de";
import { en } from "../../lib/locales/en";

import { InfoTip } from "./InfoTip";

function setup(topic = "dashboard.available", onParentClick?: () => void) {
  render(
    <I18nProvider>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div onClick={onParentClick}>
        <span>Verfügbar bis Monatsende</span>
        <InfoTip topic={topic} />
      </div>
    </I18nProvider>
  );
}

const trigger = () => screen.getByRole("button", { name: "Erklärung: Verfügbar bis Monatsende" });

describe("InfoTip", () => {
  it("is a button named after the explanation and shows nothing until it is used", () => {
    setup();
    expect(trigger()).toHaveAttribute("type", "button");
    expect(trigger()).toHaveAttribute("aria-haspopup", "dialog");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens a dialog with title, text, worked example and a close button", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(trigger());

    const dialog = await screen.findByRole("dialog", { name: "Verfügbar bis Monatsende" });
    expect(within(dialog).getByText(/So viel bleibt dir bis zum Monatsende/)).toBeInTheDocument();
    // The example is a small sum: label left, amount right, result last.
    expect(within(dialog).getByText("Beispiel")).toBeInTheDocument();
    expect(within(dialog).getByText("+ Einnahmen")).toBeInTheDocument();
    expect(within(dialog).getByText("3.200,00 €")).toBeInTheDocument();
    expect(within(dialog).getByText("= Verfügbar bis Monatsende")).toBeInTheDocument();
    expect(within(dialog).getByText("1.170,00 €")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Schließen" })).toBeInTheDocument();
  });

  it("closes with the close button and returns the focus to the info button", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(trigger());
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Schließen" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it("closes with Escape and returns the focus to the info button", async () => {
    const user = userEvent.setup();
    setup();

    await user.click(trigger());
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger()).toHaveFocus());
  });

  it("shows no example block for a topic without one", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <InfoTip topic="dashboard.balance" />
      </I18nProvider>
    );

    await user.click(screen.getByRole("button", { name: "Erklärung: Aktueller Kontostand" }));

    const dialog = await screen.findByRole("dialog", { name: "Aktueller Kontostand" });
    expect(within(dialog).queryByText("Beispiel")).not.toBeInTheDocument();
  });

  it("keeps taps on the button and inside the explanation away from what surrounds it", async () => {
    const user = userEvent.setup();
    const onParentClick = vi.fn();
    setup("dashboard.available", onParentClick);

    await user.click(trigger());
    await user.click(within(await screen.findByRole("dialog")).getByText(/So viel bleibt dir/));

    expect(onParentClick).not.toHaveBeenCalled();
  });
});

describe("info texts", () => {
  const topics = (messages: Record<string, string>) =>
    Object.keys(messages)
      .filter((key) => key.startsWith("info.") && key.endsWith(".title"))
      .map((key) => key.slice("info.".length, -".title".length));

  it("has a title and a body for every topic, in both languages", () => {
    expect(topics(de).length).toBeGreaterThan(0);
    expect(topics(en).sort()).toEqual(topics(de).sort());
    for (const topic of topics(de)) {
      for (const messages of [de, en]) {
        expect(messages[`info.${topic}.title`], topic).toBeTruthy();
        expect(messages[`info.${topic}.body`], topic).toBeTruthy();
      }
      // An example exists in both languages or in neither.
      expect(`info.${topic}.example` in en, topic).toBe(`info.${topic}.example` in de);
    }
  });

  it("only uses topics that exist where the buttons are placed", async () => {
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const roots = [join(__dirname, ".."), join(__dirname, "..", "..", "app")];
    const used = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) {
          if (entry !== "api" && entry !== "node_modules") walk(path);
        } else if (path.endsWith(".tsx") && !path.endsWith(".test.tsx")) {
          for (const match of readFileSync(path, "utf8").matchAll(/<InfoTip topic="([^"]+)"/g)) used.add(match[1]!);
        }
      }
    };
    roots.forEach(walk);

    expect(used.size).toBeGreaterThan(0);
    expect([...used].filter((topic) => !(`info.${topic}.title` in de))).toEqual([]);
    // And no explanation is written that no button shows.
    expect(topics(de).filter((topic) => !used.has(topic))).toEqual([]);
  });
});
