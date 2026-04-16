import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isProtectedPath = req.nextUrl.pathname.startsWith("/dashboard") || req.nextUrl.pathname.startsWith("/projects");
  
  if (isProtectedPath && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
