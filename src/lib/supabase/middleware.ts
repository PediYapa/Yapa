import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/** Atualiza a sessão e aplica o gating de rotas (auth + conta desativada). */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: { schema: "yapa" },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { pathname } = request.nextUrl;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const publicPaths = ["/login", "/recuperar-senha", "/auth/callback", "/", "/terminos", "/privacidad", "/reembolsos"];
  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Não logado
  if (!user) {
    if (!isPublic) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return response; // rota pública sem sessão → segue
  }

  // Logado: o perfil precisa existir e estar ativo. Sessão sem perfil
  // (cookie velho/usuário removido) ou conta desativada → desloga, evitando
  // o loop /login → /dashboard → /login.
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("deactivated_at")
    .eq("id", user.id)
    .maybeSingle();
  const sessaoInvalida = !profile || !!profile.deactivated_at;

  if (sessaoInvalida) {
    await supabase.auth.signOut(); // limpa os cookies de sessão no `response`
    if (pathname === "/login") {
      return response; // renderiza o login com a sessão já limpa (sem redirect)
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (profile?.deactivated_at) url.searchParams.set("error", "Conta desativada pelo administrador");
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c.name, c.value, c));
    return redirect;
  }

  // Sessão válida tentando /login → dashboard
  if (pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
