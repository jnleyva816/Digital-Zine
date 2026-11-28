/** Photos loaded per request on a board and in the editor's picker (DIG-29). Client-safe. */
export const BOARD_PAGE_SIZE = 60;
/** The most photos one request may ask for. */
export const BOARD_PAGE_MAX = 200;

/** Board order: position, then upload time, then id so ties never shuffle between pages. */
export const BOARD_ORDER = [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }] as const;
