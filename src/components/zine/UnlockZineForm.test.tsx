// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnlockZineForm } from "./UnlockZineForm";

// DIG-112: a reader with the link enters the creator's code.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const field = () => screen.getByRole("textbox", { name: "Access code" });
const submit = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Open zine" }));

describe("UnlockZineForm", () => {
  it("asks for the code before sending anything", async () => {
    const user = userEvent.setup();
    render(<UnlockZineForm owner="abcd1234" slug="harbor" />);
    await submit(user);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(field()).toHaveAttribute("aria-invalid", "true");
    expect(field()).toHaveAccessibleDescription(/enter the code/i);
  });

  it("sends the code to that zine and reloads the page once it opens", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    render(<UnlockZineForm owner="abcd1234" slug="harbor" />);
    await user.type(field(), "harbor-dusk");
    await submit(user);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/z/abcd1234/harbor/unlock",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ code: "harbor-dusk" }) })
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("says when the code is wrong, and keeps the form", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(401, { error: "That code is not right." }));
    render(<UnlockZineForm owner="abcd1234" slug="harbor" />);
    await user.type(field(), "harbor-dawn");
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("That code is not right.");
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open zine" })).toBeEnabled();
  });

  it("shows the wait when there were too many tries", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(429, { error: "Too many tries at the code. Try again in 15 minutes.", code: "rate_limited" }));
    render(<UnlockZineForm owner="abcd1234" slug="harbor" />);
    await user.type(field(), "harbor-dawn");
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/try again in 15 minutes/i);
  });

  it("says so when the server cannot be reached", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<UnlockZineForm owner="abcd1234" slug="harbor" />);
    await user.type(field(), "harbor-dusk");
    await submit(user);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not reach/i);
  });
});
