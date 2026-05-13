import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  canChangeUsername,
  ensureUsernameLockState,
  generateUniqueUsername,
  getUsernameStatus,
  isUsernameAvailable,
  normalizeUsername,
  validateUsername,
} from "@/lib/username";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawValue = searchParams.get("value");

  if (rawValue !== null) {
    const validationError = validateUsername(rawValue);
    if (validationError) {
      return NextResponse.json({
        available: false,
        normalized: normalizeUsername(rawValue),
        error: validationError,
      });
    }

    const available = await isUsernameAvailable(rawValue, session.user.id);
    return NextResponse.json({
      available,
      normalized: normalizeUsername(rawValue),
      error: available ? null : "That username is already taken",
    });
  }

  const user = await ensureUsernameLockState(session.user.id);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const status = getUsernameStatus(user);
  const seed = session.user.name || session.user.email || session.user.id;
  const suggestion = await generateUniqueUsername(seed, session.user.id);

  return NextResponse.json({
    username: user.username,
    suggestion,
    locked: status.locked,
    canEdit: canChangeUsername(user),
    editableUntil: status.editableUntil?.toISOString() ?? null,
    needsUsername: status.needsUsername,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { username?: unknown; confirmFinalChange?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.username !== "string") {
    return NextResponse.json({ error: "Username must be a string" }, { status: 400 });
  }

  const validationError = validateUsername(body.username);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const confirmFinalChange = body.confirmFinalChange === true;
  const nextUsername = normalizeUsername(body.username);
  const current = await ensureUsernameLockState(session.user.id);

  if (!current) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (current.username === nextUsername) {
    const status = getUsernameStatus(current);
    return NextResponse.json({
      success: true,
      user: {
        username: current.username,
        editableUntil: status.editableUntil?.toISOString() ?? null,
        locked: status.locked,
      },
    });
  }

  if (!canChangeUsername(current)) {
    return NextResponse.json({ error: "This username is now permanent" }, { status: 403 });
  }

  const available = await isUsernameAvailable(nextUsername, session.user.id);
  if (!available) {
    return NextResponse.json({ error: "That username is already taken" }, { status: 409 });
  }

  const isFirstSet = !current.username;
  if (!isFirstSet && !confirmFinalChange) {
    return NextResponse.json(
      {
        error: "Changing your username now will make it permanent",
        code: "USERNAME_CHANGE_REQUIRES_CONFIRMATION",
      },
      { status: 409 }
    );
  }

  const now = new Date();
  const updated = await db.user.update({
    where: { id: session.user.id },
    data: {
      username: nextUsername,
      usernameSetAt: current.usernameSetAt ?? now,
      usernameLockedAt: isFirstSet ? null : now,
    },
    select: {
      username: true,
      usernameSetAt: true,
      usernameLockedAt: true,
    },
  });

  const status = getUsernameStatus(updated);
  return NextResponse.json({
    success: true,
    user: {
      username: updated.username,
      editableUntil: status.editableUntil?.toISOString() ?? null,
      locked: status.locked,
    },
  });
}
