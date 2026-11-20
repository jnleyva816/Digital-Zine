// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./LandingPage";

describe("LandingPage (DIG-95)", () => {
  it("has one h1 that says what the app is for", () => {
    render(<LandingPage />);
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent(/photo/i);
    expect(h1[0]).toHaveTextContent(/zine/i);
  });

  it("explains how it works in three steps: collect, sequence, publish", () => {
    render(<LandingPage />);
    const section = screen.getByRole("region", { name: "How it works" });
    const steps = within(section).getAllByRole("heading", { level: 3 });
    expect(steps.map((s) => s.textContent)).toEqual(["Collect", "Sequence", "Publish"]);
  });

  it("shows the Free and Pro tiers with their prices and features", () => {
    render(<LandingPage />);
    const pricing = screen.getByRole("region", { name: "Pricing" });
    const free = within(pricing).getByRole("article", { name: "Free" });
    const pro = within(pricing).getByRole("article", { name: "Pro" });
    expect(within(free).getByText("$0")).toBeInTheDocument();
    expect(within(free).getByText("1 Vision Board")).toBeInTheDocument();
    expect(within(pro).getByText("$15")).toBeInTheDocument();
    expect(within(pro).getByText("per month")).toBeInTheDocument();
    expect(within(pro).getByText("PDF export")).toBeInTheDocument();
    expect(within(pro).getByText("Unlimited zines")).toBeInTheDocument();
  });

  it("links every call to action to a page that exists", () => {
    render(<LandingPage />);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/signin");
    const starts = screen.getAllByRole("link", { name: /start free|get pro/i });
    expect(starts.length).toBeGreaterThanOrEqual(2);
    for (const link of starts) expect(link).toHaveAttribute("href", "/signup");
    for (const link of screen.getAllByRole("link")) {
      expect(link.getAttribute("href")).toMatch(/^(\/signin|\/signup|#[a-z-]+)$/);
    }
  });

  it("describes the sample card as an illustration, not a real photo", () => {
    render(<LandingPage />);
    expect(screen.getByRole("img", { name: /sample/i })).toBeInTheDocument();
  });
});
