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
    expect(btn.className).toContain("bg-indigo-600");
  });

  it("applies secondary variant classes", () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border-gray-300");
  });

  it("applies danger variant classes", () => {
    render(<Button variant="danger">Delete</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-red-600");
  });

  it("merges custom className without conflicts", () => {
    render(<Button className="flex-1">Submit</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("flex-1");
    expect(btn.className).toContain("bg-indigo-600");
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

  it("does not call onClick when disabled", async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(<Button disabled onClick={handleClick}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(handleClick).not.toHaveBeenCalled();
  });
});
