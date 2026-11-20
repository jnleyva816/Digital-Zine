// @vitest-environment jsdom
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoadMore } from "./LoadMore";

describe("LoadMore (DIG-47)", () => {
  it("offers to load more photos", async () => {
    const onLoadMore = vi.fn();
    render(<LoadMore sentinelRef={createRef()} loading={false} error={null} onLoadMore={onLoadMore} />);
    await userEvent.click(screen.getByRole("button", { name: "Load more photos" }));
    expect(onLoadMore).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("shows that a page is loading and cannot be pressed again", () => {
    render(<LoadMore sentinelRef={createRef()} loading error={null} onLoadMore={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Loading…" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });

  it("reports a page that failed to load, and can try again", () => {
    render(<LoadMore sentinelRef={createRef()} loading={false} error="Could not load more photos." onLoadMore={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load more photos.");
    expect(screen.getByRole("button", { name: "Load more photos" })).toBeEnabled();
  });
});
