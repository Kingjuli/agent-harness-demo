"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DemoUser } from "@/lib/types/domain";
import { Card, SectionTitle } from "@/components/ui";

type UsersResponse = { users: DemoUser[] };

export default function StartPage() {
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetch("/api/demo/users")
      .then((r) => r.json() as Promise<UsersResponse>)
      .then((data) => setUsers(data.users))
      .catch(() => setUsers([]));
  }, []);

  async function beginAsUser(userId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/session/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      localStorage.setItem("demo_user_id", userId);
      localStorage.setItem("demo_session_id", data.sessionId);
      router.push("/storefront");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-10 md:px-6">
      <div className="fade-rise grid gap-6 md:grid-cols-12">
        <Card className="md:col-span-7">
          <SectionTitle>Agent Harness Demo</SectionTitle>
          <h1 className="mt-3 text-4xl font-bold leading-tight text-slate-900 md:text-5xl">AI-Powered Checkout, Fully Observable</h1>
          <p className="mt-4 max-w-2xl text-base text-slate-600 md:text-lg">
            Experience a customer storefront where an AI agent guides checkout while the harness tracks workflow, tool calls, and payment state in real time.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-3 text-sm text-slate-700 sm:grid-cols-3">
            <div className="rounded-xl border border-teal-100 bg-teal-50 px-3 py-2">Live conversation orchestration</div>
            <div className="rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2">Deterministic payment simulation</div>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2">Traceable harness decisions</div>
          </div>
        </Card>

        <Card className="fade-rise md:col-span-5">
          <SectionTitle>Start Session</SectionTitle>
          <p className="mt-2 text-sm text-slate-600">Choose a demo customer profile to initialize a tracked session.</p>
          <div className="mt-4 grid gap-3">
            {users.map((u) => (
              <button
                key={u.id}
                disabled={loading}
                onClick={() => beginAsUser(u.id)}
                className="group rounded-xl border border-slate-200 bg-white/90 p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm disabled:opacity-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{u.name}</div>
                    <div className="text-sm text-slate-600">{u.email}</div>
                    <div className="mt-1 text-xs text-slate-500">Default address: {u.defaultAddress}</div>
                  </div>
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-800">Demo User</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      </div>
    </main>
  );
}
