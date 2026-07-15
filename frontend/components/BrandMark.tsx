import { APP_ICON_SRC, APP_NAME } from "@/lib/brand";

type BrandMarkProps = {
  size?: number;
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
};

export default function BrandMark({
  size = 36,
  showWordmark = true,
  className = "",
  wordmarkClassName = "",
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center gap-3 ${className}`.trim()}>
      <img
        src={APP_ICON_SRC}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-xl"
        aria-hidden
      />
      {showWordmark ? (
        <span
          className={
            wordmarkClassName ||
            "font-display text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50"
          }
        >
          {APP_NAME}
        </span>
      ) : null}
    </span>
  );
}
