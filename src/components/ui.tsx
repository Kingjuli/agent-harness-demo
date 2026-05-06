import { PropsWithChildren } from "react";
import { clsx } from "clsx";

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={clsx(
        "glass-panel app-surface rounded-lg p-5 shadow-[0_18px_40px_-26px_rgba(15,23,42,0.35)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <h3 className="app-muted text-sm font-semibold tracking-wide uppercase">{children}</h3>;
}
