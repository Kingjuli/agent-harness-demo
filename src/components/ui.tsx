import { PropsWithChildren } from "react";
import { clsx } from "clsx";

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <div
      className={clsx(
        "glass-panel rounded-2xl border border-white/70 p-5 shadow-[0_12px_30px_-18px_rgba(15,23,42,0.45)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: PropsWithChildren) {
  return <h3 className="text-xs font-bold tracking-[0.18em] text-slate-500 uppercase">{children}</h3>;
}
