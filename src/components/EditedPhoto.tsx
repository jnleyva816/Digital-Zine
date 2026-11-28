import Image from "next/image";
import { withSourceWidth } from "@/lib/media/variant-urls";
import { DEFAULT_EDIT, frameLayout, type PhotoEdit } from "@/lib/board/photo-edit";

const pct = (n: number) => `${Math.round(n * 1000) / 1000}%`;

/**
 * A photo drawn with its crop and frame (DIG-33). The element sizes itself by width and takes the
 * framed photo's aspect ratio. An unedited photo is a centred 4:5 crop, as the board always showed.
 * Works in server and client components.
 */
export function EditedPhoto({
  src,
  alt,
  edit,
  dims,
  sizes,
  blurDataUrl,
  priority = false,
  className = "",
  as: Tag = "div",
}: {
  src: string;
  alt: string;
  edit: PhotoEdit | null;
  dims: { width: number; height: number } | null;
  sizes: string;
  blurDataUrl?: string | null;
  priority?: boolean;
  className?: string;
  /** Use "span" inside buttons and other inline-only content. */
  as?: "div" | "span";
}) {
  const settings = edit ?? DEFAULT_EDIT;
  const layout = frameLayout(settings, dims);
  return (
    <Tag
      data-testid="edited-photo"
      data-ratio={settings.ratio}
      data-frame={settings.frame}
      className={`relative block w-full overflow-hidden ${className}`}
      style={{ aspectRatio: String(Math.round(layout.aspect * 10000) / 10000), backgroundColor: layout.background ?? undefined }}
    >
      <Tag
        className="absolute block overflow-hidden bg-ink-900"
        style={{ left: pct(layout.photo.left), top: pct(layout.photo.top), width: pct(layout.photo.width), height: pct(layout.photo.height) }}
      >
        <Tag
          data-testid="edited-photo-image"
          className="absolute block"
          style={{ left: pct(layout.image.left), top: pct(layout.image.top), width: pct(layout.image.width), height: pct(layout.image.height) }}
        >
          <Image
            // The photo's own width tells the image loader which copies exist (DIG-110).
            src={withSourceWidth(src, dims?.width)}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            draggable={false}
            className="object-cover"
            placeholder={blurDataUrl ? "blur" : "empty"}
            blurDataURL={blurDataUrl ?? undefined}
          />
        </Tag>
      </Tag>
    </Tag>
  );
}
