// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProfilePanel } from "./ProfilePanel";

// DIG-111: the creator picks a handle and writes a name and bio on /account.
const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const save = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole("button", { name: "Save profile" }));

describe("ProfilePanel", () => {
  it("labels every field, and says there is no public profile until a handle is picked", () => {
    render(<ProfilePanel initial={{ handle: null, name: "Ana", bio: null }} />);
    expect(screen.getByRole("heading", { name: "Public profile" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /handle/i })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: /display name/i })).toHaveValue("Ana");
    expect(screen.getByRole("textbox", { name: /bio/i })).toHaveValue("");
    expect(document.body.textContent).toMatch(/no public profile until you pick a handle/i);
    expect(screen.queryByRole("link", { name: /view your profile/i })).not.toBeInTheDocument();
  });

  it("links the profile when there is a handle", () => {
    render(<ProfilePanel initial={{ handle: "ana", name: null, bio: null }} />);
    expect(screen.getByRole("link", { name: /view your profile/i })).toHaveAttribute("href", "/u/ana");
  });

  it("explains a handle it would refuse before sending anything", async () => {
    const user = userEvent.setup();
    render(<ProfilePanel initial={{ handle: null, name: null, bio: null }} />);
    await user.type(screen.getByRole("textbox", { name: /handle/i }), "a b");
    await save(user);
    expect(screen.getByRole("textbox", { name: /handle/i })).toHaveAccessibleDescription(/letters, numbers, or underscores/i);
    expect(screen.getByRole("textbox", { name: /handle/i })).toHaveAttribute("aria-invalid", "true");
    await user.clear(screen.getByRole("textbox", { name: /handle/i }));
    await user.type(screen.getByRole("textbox", { name: /handle/i }), "admin");
    await save(user);
    expect(screen.getByRole("textbox", { name: /handle/i })).toHaveAccessibleDescription(/reserved/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts the bio down and refuses one that is too long", async () => {
    const user = userEvent.setup();
    render(<ProfilePanel initial={{ handle: null, name: null, bio: null }} />);
    await user.type(screen.getByRole("textbox", { name: /bio/i }), "Shot on film.");
    expect(document.body.textContent).toMatch(/147 characters left/);
    await user.type(screen.getByRole("textbox", { name: /bio/i }), "x".repeat(150));
    expect(document.body.textContent).toMatch(/3 characters over/);
    expect(screen.getByRole("button", { name: "Save profile" })).toBeDisabled();
  });

  it("sends the changes, shows a saving state, then says it saved and links the new profile", async () => {
    const user = userEvent.setup();
    let resolve: (r: Response) => void = () => undefined;
    fetchMock.mockReturnValue(new Promise<Response>((r) => (resolve = r)));
    render(<ProfilePanel initial={{ handle: null, name: "Ana", bio: null }} />);
    await user.type(screen.getByRole("textbox", { name: /handle/i }), "@Ana_Ruiz");
    await user.type(screen.getByRole("textbox", { name: /bio/i }), "Classic Neg.");
    await save(user);
    expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/account/profile",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ handle: "ana_ruiz", name: "Ana", bio: "Classic Neg." }) })
    );
    resolve(json(200, { profile: { handle: "ana_ruiz", name: "Ana", bio: "Classic Neg." } }));
    expect(await screen.findByRole("status")).toHaveTextContent(/saved/i);
    expect(screen.getByRole("link", { name: /view your profile/i })).toHaveAttribute("href", "/u/ana_ruiz");
    expect(screen.getByRole("textbox", { name: /handle/i })).toHaveValue("ana_ruiz");
  });

  it("shows the server's reason when a handle is taken, on the handle field", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(json(409, { error: "That handle is taken. Try another.", code: "handle_taken" }));
    render(<ProfilePanel initial={{ handle: null, name: null, bio: null }} />);
    await user.type(screen.getByRole("textbox", { name: /handle/i }), "ansel_a");
    await save(user);
    expect(await screen.findByText("That handle is taken. Try another.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /handle/i })).toHaveAccessibleDescription(/taken/i);
    expect(screen.queryByRole("link", { name: /view your profile/i })).not.toBeInTheDocument();
  });

  it("says so when the server cannot be reached, and keeps what was typed", async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new TypeError("offline"));
    render(<ProfilePanel initial={{ handle: null, name: null, bio: null }} />);
    await user.type(screen.getByRole("textbox", { name: /bio/i }), "Keep me");
    await save(user);
    expect((await screen.findAllByRole("alert")).some((a) => /could not reach the server/i.test(a.textContent ?? ""))).toBe(true);
    expect(screen.getByRole("textbox", { name: /bio/i })).toHaveValue("Keep me");
  });
});
