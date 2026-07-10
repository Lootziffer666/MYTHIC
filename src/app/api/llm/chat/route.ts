import { NextResponse } from "next/server";
import { getDefaultProvider, getProviderSecret, listProviders } from "@/lib/settings";

// Runtime: Node (server-side fetch to the user's chosen provider only).
export const runtime = "nodejs";

/**
 * Local BYOK LLM proxy. MYTHIC forwards the chat request to the provider the
 * user configured — no analytics, no logging of content, no third parties.
 * The only egress is the provider base URL the user set in Settings.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const providerId = body.provider;
  const provider = providerId
    ? listProviders().find((p) => p.id === providerId) ?? null
    : getDefaultProvider() ?? listProviders()[0] ?? null;

  if (!provider) {
    return NextResponse.json(
      { error: "No LLM provider configured. Add one in Settings (BYOK)." },
      { status: 400 }
    );
  }
  const apiKey = getProviderSecret(provider.id);
  if (!apiKey) {
    return NextResponse.json({ error: "Provider has no API key stored." }, { status: 400 });
  }

  const baseUrl = provider.baseUrl.replace(/\/$/, "");
  const upstream = `${baseUrl}/chat/completions`;

  try {
    const upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: body.model || provider.model,
        messages: body.messages ?? [],
        temperature: body.temperature ?? 0.7,
        stream: body.stream ?? false,
      }),
    });

    const text = await upstreamRes.text();
    return new NextResponse(text, {
      status: upstreamRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Upstream error: ${message}` }, { status: 502 });
  }
}
