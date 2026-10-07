import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CollapsibleSection } from "./CollapsibleSection";

function setup(props: Partial<React.ComponentProps<typeof CollapsibleSection>> = {}) {
  return render(
    <CollapsibleSection id="filters" title="Filters" {...props}>
      <p>Panel content</p>
    </CollapsibleSection>
  );
}

describe("CollapsibleSection", () => {
  it("is closed by default with the title visible and children not in the DOM", () => {
    setup();
    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Filters")).toBeVisible();
    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
  });

  it("labels the section by its heading", () => {
    setup();
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading).toHaveAttribute("id", "filters-heading");
    expect(screen.getByRole("region", { name: "Filters" })).toBeInTheDocument();
  });

  it("opens on click and closes on a second click", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", { name: "Filters" });

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Panel content")).toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Panel content")).not.toBeInTheDocument();
  });

  it("opens with Enter when the button is focused", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", { name: "Filters" });
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Panel content")).toBeVisible();
  });

  it("opens with Space when the button is focused", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", { name: "Filters" });
    toggle.focus();
    await user.keyboard(" ");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Panel content")).toBeVisible();
  });

  it("starts open when defaultOpen is true", () => {
    setup({ defaultOpen: true });
    expect(screen.getByRole("button", { name: "Filters" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Panel content")).toBeVisible();
  });

  it("renders headerAside", () => {
    setup({ headerAside: <span>3 active</span> });
    expect(screen.getByText("3 active")).toBeInTheDocument();
  });

  it("points aria-controls at the panel id when open", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", { name: "Filters" });
    expect(toggle).toHaveAttribute("aria-controls", "filters-panel");
    await user.click(toggle);
    const panel = document.getElementById("filters-panel");
    expect(panel).not.toBeNull();
    expect(panel).toContainElement(screen.getByText("Panel content"));
  });
});
