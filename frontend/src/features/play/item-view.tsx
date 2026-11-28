import type { ReactNode } from "react";
import type { Item } from "@/features/play/api";
import { useLocale } from "@/lib/i18n/locale";

/** A flag as an image sized by `width`/`height` and `className`, any other item as its label. */
export function ItemView({
  item,
  alt,
  width,
  height,
  className,
}: {
  item: Item;
  alt: string;
  width: number;
  height: number;
  className?: string;
}): ReactNode {
  const { locale } = useLocale();
  if (item.kind === "flag") {
    return (
      <img
        src={`/flags/${item.flagKey}.svg`}
        alt={alt}
        width={width}
        height={height}
        draggable={false}
        className={className}
      />
    );
  }
  return <span>{item.text[locale]}</span>;
}
