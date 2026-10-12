import { requireAccess } from "../_shared/access.js";

export async function onRequestGet({ request, env }) {
  const auth = await requireAccess(request, env);
  if (auth.response) return auth.response;
  const url = new URL(request.url);
  const returnTo = url.searchParams.get("return_to") || "/laboratorio/";
  const destination = new URL(returnTo, url.origin);
  if (!returnTo.startsWith("/") || returnTo.startsWith("//") || destination.origin !== url.origin)
    return new Response("Invalid return path", { status: 400, headers: { "cache-control": "no-store" } });
  return Response.redirect(destination.toString(), 303);
}
