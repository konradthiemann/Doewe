import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Button } from "./Button";
import { FormActions } from "./FormActions";

describe("FormActions", () => {
  it("renders its actions stacked in a sticky footer", () => {
    render(
      <FormActions>
        <Button type="submit">Add</Button>
        <Button variant="secondary">Cancel</Button>
      </FormActions>
    );
    const footer = screen.getByTestId("form-actions");
    expect(footer.className).toContain("sticky");
    expect(footer.className).toContain("-bottom-4");
    expect(footer.className).toContain("flex-col");
    expect(footer.className).not.toContain("sm:flex-row");
    expect(footer).toContainElement(screen.getByRole("button", { name: "Add" }));
    expect(footer).toContainElement(screen.getByRole("button", { name: "Cancel" }));
  });
});
