import { NextRequest, NextResponse } from "next/server";
import { STYLE_RULES } from "@/lib/styleRules";

type InputType = "recipe" | "article";
type AspectRatio = "2:3" | "4:5";
type RecipeImageFocus = "step_or_ingredient" | "final_dish";

type GeneratePayload = {
  type?: InputType;
  title?: string;
  link?: string;
  aspectRatio?: AspectRatio;
  recipeImageFocus?: RecipeImageFocus;
};

type LinkExtract = {
  title: string;
  description: string;
  bodySnippet: string;
};

type GeneratedShape = {
  resolved_type?: string;
  resolved_title?: string;
  hook_options?: string[];
  image_prompts?: Array<{ name?: string; prompt?: string }>;
  caption_options?: string[];
  merged_caption_options?: string[];
  caption_only_options?: string[];
  notes?: string;
};

function normalizeType(value?: string): InputType {
  return value === "article" ? "article" : "recipe";
}

function normalizeAspectRatio(value?: string): AspectRatio {
  return value === "4:5" ? "4:5" : "2:3";
}

function normalizeRecipeImageFocus(value?: string): RecipeImageFocus {
  return value === "final_dish" ? "final_dish" : "step_or_ingredient";
}

function aspectLabel(ratio: AspectRatio): string {
  return ratio === "4:5" ? "portrait 4:5 (1080x1350)" : "portrait 2:3 (1080x1620)";
}

function extractTag(html: string, tagName: string): string {
  const re = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const m = html.match(re);
  return m ? stripHtml(m[1]).trim() : "";
}

function extractMeta(html: string, metaName: string): string {
  const nameRe = new RegExp(
    `<meta[^>]+(?:name|property)=["']${metaName}["'][^>]*content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(nameRe);
  return m ? stripHtml(m[1]).trim() : "";
}

function stripHtml(text: string): string {
  return text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchLinkData(url: string): Promise<LinkExtract> {
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; PromptGeneratorBot/1.0)"
    },
    redirect: "follow"
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch link (${res.status})`);
  }

  const html = await res.text();
  const title = extractTag(html, "title");
  const description = extractMeta(html, "description") || extractMeta(html, "og:description");
  const bodySnippet = stripHtml(html).slice(0, 1600);
  return { title, description, bodySnippet };
}

function buildUserPrompt(input: {
  type: InputType;
  title: string;
  link?: string;
  linkData?: LinkExtract;
  aspectRatio: AspectRatio;
  recipeImageFocus: RecipeImageFocus;
}): string {
  return JSON.stringify(
    {
      task: "Generate image prompts and captions for a single post.",
      input_type: input.type,
      title: input.title,
      source_link: input.link || "",
      source_preview: input.linkData || null,
      aspect_ratio: input.aspectRatio,
      aspect_format: aspectLabel(input.aspectRatio),
      recipe_image_focus: input.recipeImageFocus,
      instructions: {
        goal: "Drive clicks/comments while preserving practical cooking/food context style.",
        output_language: "English",
        include_cta: true
      }
    },
    null,
    2
  );
}

function normalizeCaption(caption: string, type: InputType): string {
  const cta = type === "recipe" ? "Full recipe 👇 💬" : "Full article 👇 💬";
  const cleaned = (caption || "")
    .replace(/\s*Full\s+(recipe|article)\s*👇\s*💬\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const body = cleaned.replace(/[.。]\s*$/, "");
  return `${body}.\n${cta}`;
}

function normalizeCaptionBody(text: string): string {
  const cleaned = (text || "")
    .replace(/\s*Full\s+(recipe|article)\s*👇\s*💬\s*/gi, " ")
    .replace(/[👇💬]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.。]\s*$/, "");
  return cleaned;
}

function clampWords(text: string, maxWords = 15): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text;
  return words.slice(0, maxWords).join(" ");
}

function buildMergedCaption(body: string, type: InputType): string {
  return normalizeCaption(body, type);
}

function uniqueNonEmpty(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const v = value.trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

function topicFromTitle(title: string, maxWords = 5): string {
  const cleaned = normalizeCaptionBody(title)
    .replace(/\b(recipe|article|how to|easy|quickly|safely)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "this";
  return words.slice(0, maxWords).join(" ").toLowerCase();
}

function houseStyleBodies(type: InputType, title: string): string[] {
  const topic = topicFromTitle(title, 5);
  if (type === "recipe") {
    return [
      `My family asks for ${topic} on repeat`,
      `Only a few ingredients and ${topic} turns out so cozy`,
      `This no-fuss ${topic} tastes like comfort food`
    ];
  }

  return [
    `I had no idea this about ${topic} until now`,
    `Most people get this wrong about ${topic}`,
    `I thought this was normal, but I was wrong about ${topic}`
  ];
}

function applyRecipeFocus(prompt: string, focus: RecipeImageFocus): string {
  const cleaned = (prompt || "").replace(/\s+/g, " ").trim();
  if (focus === "final_dish") {
    return `${cleaned} Show a finished cooked dish presentation, ready to serve.`;
  }
  return `${cleaned} Show an in-progress prep/ingredient action moment (adding, pouring, layering, mixing), before final serving; avoid finished plated dish.`;
}

function coerceGenerated(
  raw: unknown,
  type: InputType,
  title: string,
  ratio: AspectRatio,
  recipeImageFocus: RecipeImageFocus
): GeneratedShape {
  const src = (raw && typeof raw === "object" ? raw : {}) as GeneratedShape;
  const ratioText = aspectLabel(ratio);

  const hooks = Array.isArray(src.hook_options) ? src.hook_options.filter(Boolean).slice(0, 3) : [];
  const fallbackHook = `Want a smarter way to handle "${title}"?`;
  while (hooks.length < 3) hooks.push(fallbackHook);
  const shortHooks = hooks.map((h) => clampWords(normalizeCaptionBody(h), 14));

  const prompts =
    Array.isArray(src.image_prompts) && src.image_prompts.length > 0
      ? src.image_prompts
      : [
          {
            name: "photo_prompt",
            prompt: `Photorealistic kitchen scene for "${title}", warm natural light, practical close framing, realistic textures, ${ratioText}, no text overlay, no logos or watermarks.`
          },
          {
            name: "text_overlay_prompt",
            prompt: `Photorealistic kitchen scene for "${title}", warm natural light, ${ratioText}; large bold sans-serif high-contrast headline overlay (1-2 lines), centered placement, no logos or watermarks.`
          }
        ];

  const namedPrompts = prompts
    .map((p, idx) => ({
      name: p.name?.trim() || (idx === 0 ? "photo_prompt" : "text_overlay_prompt"),
      prompt: (p.prompt || "").trim()
    }))
    .filter((p) => p.prompt)
    .map((p) => {
      if (type !== "recipe") return p;
      return {
        ...p,
        prompt: applyRecipeFocus(p.prompt, recipeImageFocus)
      };
    });

  const captions = Array.isArray(src.caption_options) ? src.caption_options.filter(Boolean).slice(0, 3) : [];
  const fallbackCaption = type === "recipe" ? `${title} is easier than it looks` : `${title} can be simpler than you think`;
  while (captions.length < 3) captions.push(fallbackCaption);
  const shortCaptionBodies = captions.map((c) => clampWords(normalizeCaptionBody(c), 14));
  const houseBodies = houseStyleBodies(type, title).map((c) => clampWords(normalizeCaptionBody(c), 14));

  const captionOnlyOptions = uniqueNonEmpty([...houseBodies, ...shortCaptionBodies, ...shortHooks]).slice(0, 3);
  while (captionOnlyOptions.length < 3) captionOnlyOptions.push(clampWords(normalizeCaptionBody(fallbackCaption), 14));

  const mergedCaptionOptions = uniqueNonEmpty(captionOnlyOptions.map((body) => buildMergedCaption(body, type))).slice(0, 3);
  while (mergedCaptionOptions.length < 3) {
    const extra = captionOnlyOptions[mergedCaptionOptions.length] || fallbackCaption;
    mergedCaptionOptions.push(buildMergedCaption(extra, type));
  }

  return {
    resolved_type: type,
    resolved_title: src.resolved_title?.trim() || title,
    hook_options: shortHooks,
    image_prompts: namedPrompts,
    caption_options: mergedCaptionOptions,
    merged_caption_options: mergedCaptionOptions,
    caption_only_options: captionOnlyOptions,
    notes: src.notes?.trim() || "Use photo prompt for realism and text-overlay prompt for click-driven thumbnails."
  };
}

async function callOpenAI(system: string, user: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Model returned empty response");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new Error("Model response was not valid JSON");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GeneratePayload;
    const type = normalizeType(body.type);
    const ratio = normalizeAspectRatio(body.aspectRatio);
    const recipeImageFocus = normalizeRecipeImageFocus(body.recipeImageFocus);
    const link = (body.link || "").trim();
    const rawTitle = (body.title || "").trim();

    let linkData: LinkExtract | undefined;
    if (link) {
      linkData = await fetchLinkData(link);
    }

    const resolvedTitle = rawTitle || linkData?.title || "";
    if (!resolvedTitle) {
      return NextResponse.json({ error: "Provide a title or a link." }, { status: 400 });
    }

    const userPrompt = buildUserPrompt({
      type,
      title: resolvedTitle,
      link: link || undefined,
      linkData,
      aspectRatio: ratio,
      recipeImageFocus
    });

    const generatedRaw = await callOpenAI(STYLE_RULES, userPrompt);
    const generated = coerceGenerated(generatedRaw, type, resolvedTitle, ratio, recipeImageFocus);

    return NextResponse.json(
      {
        input: {
          type,
          title: resolvedTitle,
          link: link || null,
          aspectRatio: ratio,
          recipeImageFocus: type === "recipe" ? recipeImageFocus : null
        },
        generated
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
