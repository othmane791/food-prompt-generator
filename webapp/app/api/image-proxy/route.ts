import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const rawUrl = req.nextUrl.searchParams.get("url") || "";
  if (!rawUrl) {
    return NextResponse.json({ error: "Missing url query param" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!/^https?:$/i.test(target.protocol)) {
    return NextResponse.json({ error: "Only http/https URLs are allowed" }, { status: 400 });
  }

  const upstream = await fetch(target.toString(), {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PromptGeneratorBot/1.0)"
    },
    redirect: "follow"
  });

  if (!upstream.ok) {
    return NextResponse.json({ error: `Upstream image fetch failed (${upstream.status})` }, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") || "application/octet-stream";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Upstream URL is not an image" }, { status: 415 });
  }
  const body = await upstream.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
