import { NextResponse } from "next/server";
import { DEMO_USERS } from "@/lib/data/seeds";

export async function GET() {
  return NextResponse.json({ users: DEMO_USERS });
}
