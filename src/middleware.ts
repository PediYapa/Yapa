import { updateSession } from "@/lib/supabase/middleware";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // A API pública (/api/v1) autentica por Bearer token próprio, não por sessão.
  // Os webhooks (/api/webhooks) autenticam por token no path — provedores externos
  // (ex.: Z-API) chamam sem sessão de usuário.
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/v1/") || pathname.startsWith("/api/webhooks/")) {
    return NextResponse.next();
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|js|css|ico|txt|xml|woff|woff2|ttf)$).*)",
  ],
};
