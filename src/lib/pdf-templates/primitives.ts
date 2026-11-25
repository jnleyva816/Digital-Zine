import type * as Pdf from "@react-pdf/renderer";

/**
 * react-pdf's drawing elements, by the names its renderer knows them by (DIG-71). The templates use these
 * instead of importing the renderer, so the editor can draw the same templates in the browser without
 * shipping it. `primitives.test.ts` checks them against react-pdf.
 */
export const View = "VIEW" as unknown as typeof Pdf.View;
export const Text = "TEXT" as unknown as typeof Pdf.Text;
export const Image = "IMAGE" as unknown as typeof Pdf.Image;
export const Svg = "SVG" as unknown as typeof Pdf.Svg;
export const Rect = "RECT" as unknown as typeof Pdf.Rect;
export const Polygon = "POLYGON" as unknown as typeof Pdf.Polygon;
