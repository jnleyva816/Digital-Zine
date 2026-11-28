// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZineAccessPanel } from "./ZineAccessPanel";

// DIG-112: the creator makes a zine private with a code, or public.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Save access" }));
const codeField = () => screen.getByRole("textbox", { name: /access code/i });

describe("ZineAccessPanel", () => {
  it("offers public and private, with public chosen for a public zine and no code field", () => {
    render(<ZineAccessPanel zineId="z1" initial={{ visibility: "public", hasAccessCode: false }} />);
    expect(screen.getByRole("group", { name: "Who can read it" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /public/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /private/i })).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /access code/i })).not.toBeInTheDocument();
  });

  it("says plainly that a code does not protect a photo address someone already has", async () => {
    const user = userEvent.setup();
    render(<ZineAccessPanel zineId="z1" initial={{ visibility: "public", hasAccessCode: false }} />);
    await user.click(screen.getByRole("radio", { name: /private/i }));
    expect(document.body.textContent).toMatch(/anyone who already has a photo's address can still open that photo/i);
  });

  it("needs a code of at least 6 characters before making a zine private", async () => {
    const user = userEvent.setup();
    render(<ZineAccessPanel zineId="z1" initial={{ visibility: "public", hasAccessCode: false }} />);
    await user.click(screen.getByRole("radio", { name: /private/i }));
    await save(user);
    expect(codeField()).toHaveAttribute("aria-invalid", "true");
    expect(codeField()).toHaveAccessibleDescription(/at least 6/i);
    await user.type(codeField(), "abc");
    await save(user);
    expect(codeField()).toHaveAccessibleDescription(/at least 6/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves private with the code and confirms it", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, { visibility: "private", hasAccessCode: true }));
    render(<ZineAccessPanel zineId="z1" initial={{ visibility: "public", hasAccessCode: false }} />);
    await user.click(screen.getByRole("radio", { name: /private/i }));
    await user.type(codeField(), "harbor-dusk");
    await save(user);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/zines/z1/access",
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ visibility: "private", code: "harbor-dusk" }) })
    );
    expect(await screen.findByRole("status")).toHaveTextContent(/private/i);
    expect(codeField()).toHaveValue("");
  });

  it("keeps the current code when a private zine is saved with the field empty, and warns that a new one signs readers out", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(200, { visibility: "private", hasAccessCode: true }));
    render(<ZineAccessPanel zineId="z1" initial={{ visibility: "private", hasAccessCode: true }} />);
    expect(codeField()).toHaveAccessibleDescription(/everyone who used the old code/i);
    await save(user);
    expect(fetchMock).toHaveBeenCalledWith("/api/zines/z1/access", expect.objectContaining({ body: JSON.stringify({ visibility: "private" }) }));
  });

  it("shows the server's error", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(400, { error: "Set a code for readers to enter." }));
    render(<ZineAccessPanel zineId="z1" initial={{ visibility: "private", hasAccessCode: true }} />);
    await save(user);
    expect(await screen.findByRole("alert")).toHaveTextContent("Set a code for readers to enter.");
  });
});
