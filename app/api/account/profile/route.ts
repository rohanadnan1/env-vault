import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { isAvatarValue } from "@/lib/avatars";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: unknown; image?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: { name?: string | null; image?: string | null } = {};

  if (Object.prototype.hasOwnProperty.call(body, "name")) {
    if (typeof body.name !== "string") {
      return NextResponse.json({ error: "Name must be a string" }, { status: 400 });
    }
    const trimmed = body.name.trim();
    updates.name = trimmed.length > 0 ? trimmed : null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "image")) {
    if (typeof body.image !== "string") {
      return NextResponse.json({ error: "Image must be a string" }, { status: 400 });
    }
    if (body.image !== "" && !isAvatarValue(body.image)) {
      return NextResponse.json({ error: "Invalid avatar selection" }, { status: 400 });
    }
    updates.image = body.image === "" ? null : body.image;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  try {
    const user = await db.user.update({
      where: { id: session.user.id },
      data: updates,
      select: { name: true, image: true },
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
