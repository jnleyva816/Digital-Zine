// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boardAsset, json } from "./board-test-utils";
import { VisionBoard } from "./VisionBoard";

afterEach(() => vi.unstubAllGlobals());

describe("VisionBoard", () => {
  it("lowers the board's photo count by one when a photo is deleted (DIG-75)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ ok: true })));
    render(
      <VisionBoard
        boardId="board-1"
        initialAssets={[boardAsset("fog"), boardAsset("dune")]}
        otherBoards={[]}
        otherBoardsBytes={0}
        usedIn={{}}
        initialCursor="cursor-2"
        initialTotal={70}
      />
    );
    expect(screen.getByText(/Showing 2 of 70 photos\./)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Delete fog.jpg" }));
    await userEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(await screen.findByText(/Showing 1 of 69 photos\./)).toBeInTheDocument();
  });
});
