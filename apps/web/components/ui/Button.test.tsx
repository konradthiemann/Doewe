import { render, screen } from "@testing-library/react";
// eslint-disable-next-line import/no-named-as-default
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Button } from "./Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button", { name: "Click me" })).toBeInTheDocument();
  });

  it("applies primary variant classes by default", () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-brand");
  });

  it("applies secondary variant classes", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border-line-strong");
  });

  it("applies danger variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-danger");
  });

  it("merges custom className without conflicts", () => {
    render(<Button className="flex-1">Submit</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("flex-1");
    expect(btn.className).toContain("bg-brand");
  });

  it("is disabled when disabled prop is set", () => {
    render(<Button disabled>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("calls onClick handler", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it("replaces the visible label with a spinner while loading", () => {
    render(<Button loading>Saving…</Button>);
    const btn = screen.getByRole("button", { name: "Saving…" });
    const label = screen.getByText("Saving…");
    // Label stays in the DOM (keeps width + accessible name) but is hidden visually.
    expect(label.className).toContain("opacity-0");
    const spinner = btn.querySelector("svg");
    expect(spinner).not.toBeNull();
    expect(spinner?.getAttribute("class")).toContain("absolute");
  });

  it("shows the label without spinner when not loading", () => {
    render(<Button>Add</Button>);
    const btn = screen.getByRole("button");
    expect(btn.querySelector("svg")).toBeNull();
    expect(screen.getByText("Add").className).not.toContain("opacity-0");
  });

  it("is disabled and ignores clicks while loading", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button loading onClick={handleClick}>Add</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
    await user.click(btn);
    expect(handleClick).not.toHaveBeenCalled();
  });

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
