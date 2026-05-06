"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionTitle } from "@/components/ui";
import { AgentChatWidget } from "@/components/chat/agent-chat-widget";
import type { DemoUser, Product } from "@/lib/types/domain";
import { PRODUCT_CATALOG } from "@/lib/data/seeds";
import { formatCurrency } from "@/lib/utils/money";

function categoryImage(category: Product["category"]): string {
  if (category === "hoodie") return "/products/hoodie.svg";
  if (category === "tshirt") return "/products/tshirt.svg";
  if (category === "jacket") return "/products/jacket.svg";
  return "/products/dress.svg";
}

function productImage(product: Product): string {
  const bySku: Record<string, string> = {
    "HD-BLK-M": "/products/essential-pullover-hoodie.svg",
    "HD-BLU-M": "/products/ocean-fleece-hoodie.svg",
    "HD-RED-L": "/products/crimson-street-hoodie.svg",
    "HD-GRY-XL": "/products/cloud-knit-hoodie.svg",
    "HD-SND-S": "/products/sandstone-lounge-hoodie.svg",
    "TS-WHT-S": "/products/studio-crew-tee.svg",
    "TS-BLK-M": "/products/midnight-soft-tee.svg",
    "TS-GRN-L": "/products/verdant-relaxed-tee.svg",
    "TS-NVY-XL": "/products/harbor-classic-tee.svg",
  };
  return bySku[product.sku] ?? categoryImage(product.category);
}

export default function StorefrontPage() {
  const [mounted, setMounted] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [userId, setUserId] = useState("");
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const router = useRouter();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSessionId(localStorage.getItem("demo_session_id") ?? "");
      setUserId(localStorage.getItem("demo_user_id") ?? "");
      setTheme((localStorage.getItem("theme_preference") as "light" | "dark" | null) ?? "light");
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!mounted) return;
    if (!sessionId || !userId) router.push("/start");
  }, [mounted, router, sessionId, userId]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetch("/api/demo/users")
      .then((res) => res.json() as Promise<{ users: DemoUser[] }>)
      .then((data) => {
        if (cancelled) return;
        setCurrentUser(data.users.find((u) => u.id === userId) ?? null);
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const featuredCatalog = useMemo(() => PRODUCT_CATALOG.slice(0, 8), []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme_preference", next);
  }

  return (
    <main className="min-h-screen py-4 md:py-6">
      <div className="w-full px-5 md:px-10">
        <header className="app-surface mb-3 flex items-center justify-between rounded-md px-3 py-2">
          <div className="flex items-center gap-3">
            <h1 className="text-base font-semibold md:text-lg">Moringa Apparrels</h1>
            <span className="app-muted hidden text-sm md:inline">Women & Men</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={toggleTheme} className="app-soft rounded-md px-3 py-1.5 text-xs font-medium md:text-sm">
              {theme === "light" ? "Dark" : "Light"}
            </button>
            <div className="group relative">
              <div className="app-soft flex items-center gap-2 rounded-md px-2.5 py-1.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-semibold text-white">
                  {(currentUser?.name?.trim()?.charAt(0) || "U").toUpperCase()}
                </span>
                <svg viewBox="0 0 24 24" className="h-4 w-4 app-muted" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                <span className="text-xs font-medium md:text-sm">{currentUser?.name ?? "User"}</span>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem("demo_session_id");
                  localStorage.removeItem("demo_user_id");
                  setSessionId("");
                  router.push("/start");
                }}
                className="app-surface absolute top-full right-0 mt-1 hidden rounded-md px-3 py-2 text-xs font-medium shadow-xl group-hover:block md:text-sm"
              >
                Switch User
              </button>
            </div>
          </div>
        </header>

      </div>

      <div className="mx-auto w-full max-w-[1320px] px-5 md:px-10">
        <section className="mb-4 grid gap-4 md:grid-cols-12">
          <div className="md:col-span-8">
            <div className="app-surface relative overflow-hidden rounded-lg p-5 shadow-[0_22px_48px_-30px_rgba(15,23,42,0.35)] md:p-7">
              <div className="absolute inset-0 opacity-40">
                <Image src="/products/jacket.svg" alt="Moringa hero" fill priority className="object-cover object-right" sizes="100vw" />
              </div>
              <div className="relative max-w-lg">
                <p className="app-muted text-xs font-semibold tracking-wide uppercase">New Season Arrivals</p>
                <h2 className="mt-2 text-3xl font-bold leading-tight md:text-4xl">Everyday Pieces, Elevated Fit</h2>
                <p className="app-muted mt-2 text-sm md:text-base">Discover easy layers, clean tailoring, and comfortable essentials made for workdays and weekends.</p>
                <div className="mt-4 flex gap-2">
                  <button className="rounded-md bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-white md:text-sm">Shop New In</button>
                  <button className="app-soft rounded-md px-3.5 py-2 text-xs font-semibold md:text-sm">Shop Best Sellers</button>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-4">
            <Card>
              <SectionTitle>Why Shop With Us</SectionTitle>
              <div className="mt-2.5 space-y-2.5">
                <div className="app-soft rounded-md px-3 py-2">
                  <p className="text-sm font-semibold">Premium Everyday Fabrics</p>
                  <p className="app-muted text-xs">Soft breathable blends for all-day comfort.</p>
                </div>
                <div className="app-soft rounded-md px-3 py-2">
                  <p className="text-sm font-semibold">Fast Dispatch</p>
                  <p className="app-muted text-xs">Order before 3pm for same-day Nairobi dispatch.</p>
                </div>
                <div className="app-soft rounded-md px-3 py-2">
                  <p className="text-sm font-semibold">Easy Size Exchange</p>
                  <p className="app-muted text-xs">Quick exchange support to get your fit right.</p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <Card>
          <div className="mb-3 flex items-end justify-between">
            <div>
              <SectionTitle>Featured Collection</SectionTitle>
              <p className="app-muted mt-1 text-xs md:text-sm">Our most-loved styles this week.</p>
            </div>
            <span className="app-muted text-xs">{featuredCatalog.length} items</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featuredCatalog.map((p) => (
              <article key={p.sku} className="app-surface group overflow-hidden rounded-lg shadow-[0_14px_28px_-22px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5">
                <div className="app-soft relative h-36 w-full overflow-hidden md:h-40">
                  <Image src={productImage(p)} alt={p.name} fill className="object-cover transition duration-300 group-hover:scale-105" sizes="(max-width: 1024px) 50vw, 25vw" />
                </div>
                <div className="p-2.5 md:p-3">
                  <p className="text-sm font-semibold md:text-base">{p.name}</p>
                  <p className="app-muted text-xs md:text-sm">
                    {p.color} · {p.size}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <p className="text-sm font-bold md:text-base">{formatCurrency(p.priceCents)}</p>
                    <button
                      onClick={() =>
                        window.dispatchEvent(
                          new CustomEvent("moringa:chat-intent", {
                            detail: { prompt: `Add ${p.name} (${p.color}, size ${p.size}) to my cart.` },
                          }),
                        )
                      }
                      className="app-soft rounded-md px-2 py-1 text-xs font-semibold"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </Card>
      </div>
      <AgentChatWidget />
    </main>
  );
}
