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
  image_prompts?: Array<{
    name?: string;
    prompt?: string;
    openai_prompt?: string;
    nanobanana_v2_prompt?: string;
  }>;
  caption_options?: string[];
  merged_caption_options?: string[];
  caption_only_options?: string[];
  notes?: string;
};

function normalizeType(value?: string): InputType {
  return value === "article" ? "article" : "recipe";
}

function normalizeAspectRatio(value?: string): AspectRatio {
  return value === "2:3" ? "2:3" : "4:5";
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
      caption_strategy: {
        source: "top-engagement analysis",
        target_patterns: [
          "first-person testimonial voice",
          "family/social proof mention",
          "reaction and sensory language",
          "concrete detail from title",
          "short hook + fixed CTA"
        ],
        max_options: 5
      },
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

function extractIngredientCount(title: string): number | null {
  const match = title.match(/\b(?:just|only|with)?\s*(\d{1,2})\s+ingredients?\b/i);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function ingredientCountPhrase(title: string): string {
  const count = extractIngredientCount(title);
  if (count) return `just ${count} ingredients`;
  return "a few pantry ingredients";
}

function inferRecipeAction(title: string): string {
  const t = title.toLowerCase();
  if (/\b(soup|stew|chili|broth)\b/.test(t)) return "Dump";
  if (/\b(casserole|bake|lasagna|pie)\b/.test(t)) return "Layer";
  if (/\b(slow cooker|crock pot|crockpot)\b/.test(t)) return "Add";
  if (/\b(chicken|beef|pork|turkey|meat)\b/.test(t)) return "Pour";
  return "Mix";
}

function houseStyleBodies(type: InputType): string[] {
  if (type === "recipe") {
    return [];
  }
  return [
    "I had no idea this until now",
    "Most people still get this wrong",
    "I thought this was normal, but I was wrong"
  ];
}


function recipeFocusSentence(focus: RecipeImageFocus): string {
  if (focus === "final_dish") {
    return "Show a finished cooked dish presentation, ready to serve.";
  }
  return "Show an in-progress prep/ingredient action moment (adding, pouring, layering, mixing), before final serving; avoid finished plated dish.";
}

function recipeMainIngredient(title: string): string {
  const t = title.toLowerCase();
  if (/\bbeef\b/.test(t)) return "beef";
  if (/\bchicken\b/.test(t)) return "chicken";
  if (/\bpork\b/.test(t)) return "pork";
  if (/\bturkey\b/.test(t)) return "turkey";
  if (/\bsausage\b/.test(t)) return "sausage";
  if (/\bpotato(?:es)?\b/.test(t)) return "potatoes";
  if (/\brice\b/.test(t)) return "rice";
  return "dinner";
}

function recipeOverlaySentence(title: string): string {
  const count = ingredientCountPhrase(title);
  const ingredient = recipeMainIngredient(title);
  const action = inferRecipeAction(title).toLowerCase();

  if (ingredient === "beef" || ingredient === "chicken" || ingredient === "pork" || ingredient === "turkey" || ingredient === "sausage") {
    return `${action.charAt(0).toUpperCase()}${action.slice(1)} sliced onions and ${count} over ${ingredient} for a cozy dinner everyone asks for again`;
  }

  return `${action.charAt(0).toUpperCase()}${action.slice(1)} ${count} into this easy bake for a cozy supper everyone asks for again`;
}

function normalizePromptText(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function baseSceneFromOpenAIPrompt(prompt: string): string {
  return normalizePromptText(
    (prompt || "")
      .split(/Style profile:/i)[0]
      .replace(/\bNo logos\.?\s*No watermark\.?/gi, "")
      .replace(/\bNo text overlay\b\.?/gi, "")
      .replace(/\s+/g, " ")
  ).replace(/[;,.]\s*$/, "");
}

function withAspect(text: string, ratioText: string): string {
  const cleaned = normalizePromptText(text);
  if (/portrait\s*(2:3|4:5)/i.test(cleaned)) return cleaned;
  return `${cleaned} ${ratioText}.`;
}

function enforceVisualProfile(
  prompt: string,
  promptName: string,
  type: InputType,
  ratioText: string,
  recipeImageFocus: RecipeImageFocus,
  title: string
): string {
  const name = (promptName || "").toLowerCase();
  let cleaned = withAspect(prompt, ratioText)
    .replace(/\bno text overlay\b\.?/gi, "")
    .replace(/\bhigh contrast white text on dark translucent box\b/gi, "")
    .replace(/\bdark translucent box\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const overlaySentence = recipeOverlaySentence(title);

  const parts: string[] = [cleaned];

  if (type === "recipe") {
    parts.push(
      "Style profile: warm natural kitchen light, cozy comfort-food tones, moderate contrast, close or medium-close framing, realistic home-kitchen texture."
    );
    parts.push(recipeFocusSentence(recipeImageFocus));
    if (name.includes("text_overlay")) {
      cleaned = cleaned
        .replace(/\b(text|headline)\s*:\s*["'][^"']*["']/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      parts[0] = cleaned;
      parts.push(
        `Recipe overlay spec: use one medium hook sentence (10-18 words) with ingredient-count and payoff language; bold black sans-serif text on a white rounded rectangle banner; place at top or upper-middle; keep food photo dominant and readable on mobile.`
      );
      parts.push(`Do not use the recipe title as overlay text.`);
      parts.push(`Render this exact overlay text: "${overlaySentence}".`);
    } else {
      parts.push("No text overlay.");
    }
  } else {
    parts.push(
      "Style profile: cleaner composition, slightly higher color pop, simplified background, practical food/kitchen context."
    );
    if (name.includes("text_overlay")) {
      parts.push(
        "Use bold light headline text (1-2 lines) on a dark translucent box, centered or upper-middle, mobile readable."
      );
    } else {
      parts.push("No text overlay; keep clear readable negative space.");
    }
  }

  parts.push("No logos. No watermark.");
  return parts.map(normalizePromptText).filter(Boolean).join(" ");
}

function articleOverlaySentence(title: string): string {
  const cleaned = normalizeCaptionBody(title).replace(/[!?]+$/g, "");
  const sentence = clampWords(cleaned, 12);
  return sentence || "What most people get wrong in the kitchen";
}

function buildNanobananaPrompt(
  openAIPrompt: string,
  promptName: string,
  type: InputType,
  recipeImageFocus: RecipeImageFocus,
  title: string
): string {
  const name = (promptName || "").toLowerCase();
  const scene = baseSceneFromOpenAIPrompt(openAIPrompt);
  const parts: string[] = [scene];

  if (type === "recipe") {
    parts.push("Photoreal food photography, warm natural kitchen light, cozy home-cooking mood, detailed textures.");
    if (recipeImageFocus === "step_or_ingredient") {
      parts.push("Show in-progress ingredient/assembly step, not final plated dish.");
    } else {
      parts.push("Show finished cooked dish ready to serve.");
    }

    if (name.includes("text_overlay")) {
      parts.push(
        `Overlay style: bold black sans-serif text on a white rounded rectangle box at the top/upper-middle.`
      );
      parts.push(`Overlay text: "${recipeOverlaySentence(title)}".`);
    }
  } else {
    parts.push("Photoreal practical kitchen context, clean composition, high clarity, realistic color.");
    if (name.includes("text_overlay")) {
      parts.push(
        `Overlay style: bold light sans-serif text on a dark translucent box at upper-middle, 1-2 lines.`
      );
      parts.push(`Overlay text: "${articleOverlaySentence(title)}".`);
    }
  }

  parts.push("No logos or watermark.");
  return parts.map(normalizePromptText).filter(Boolean).join(" ");
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
      prompt: (p.prompt || p.openai_prompt || "").trim()
    }))
    .filter((p) => p.prompt)
    .map((p) => {
      const openAIPrompt = enforceVisualProfile(p.prompt, p.name, type, ratioText, recipeImageFocus, title);
      return {
        name: p.name,
        prompt: openAIPrompt,
        openai_prompt: openAIPrompt,
        nanobanana_v2_prompt: buildNanobananaPrompt(
          openAIPrompt,
          p.name,
          type,
          recipeImageFocus,
          title
        )
      };
    });

  const captions = Array.isArray(src.caption_options) ? src.caption_options.filter(Boolean).slice(0, 5) : [];
  const fallbackCaption = type === "recipe" ? `${title} is easier than it looks` : `${title} can be simpler than you think`;
  while (captions.length < 5) captions.push(fallbackCaption);
  const shortCaptionBodies = captions.map((c) => clampWords(normalizeCaptionBody(c), 14));
  const houseBodies = houseStyleBodies(type).map((c) => clampWords(normalizeCaptionBody(c), 14));

  const defaultMergedOptions = uniqueNonEmpty([...houseBodies, ...shortCaptionBodies, ...shortHooks].map((body) => buildMergedCaption(body, type))).slice(0, 5);
  while (defaultMergedOptions.length < 5) {
    defaultMergedOptions.push(buildMergedCaption(clampWords(normalizeCaptionBody(fallbackCaption), 14), type));
  }

  const rawCaptionOptions = Array.isArray(src.caption_options) ? src.caption_options.filter(Boolean) : [];
  const normalizedFromModel = uniqueNonEmpty(
    rawCaptionOptions
      .map((c) => normalizeCaptionBody(c))
      .map((c) => clampWords(c, 14))
      .filter(Boolean)
  ).map((body) => normalizeCaption(body, type));

  const mergedCaptionOptions =
    normalizedFromModel.length > 0
      ? normalizedFromModel.slice(0, 5)
      : defaultMergedOptions.slice(0, 5);
  const captionOnlyOptions: string[] = [];

  return {
    resolved_type: type,
    resolved_title: src.resolved_title?.trim() || title,
    hook_options: shortHooks,
    image_prompts: namedPrompts,
    caption_options: mergedCaptionOptions,
    merged_caption_options: mergedCaptionOptions,
    caption_only_options: captionOnlyOptions,
    notes:
      src.notes?.trim() ||
      (type === "recipe"
        ? "Recipe best practice from analysis: use photo_prompt as primary; text_overlay_prompt is optional/minority."
        : "Article best practice from analysis: text_overlay_prompt is often strongest; keep headline short and high contrast.")
  };
}

async function callOpenAI(system: string, user: string): Promise<unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  const primaryModel = process.env.OPENAI_MODEL || "gpt-5.4-2026-03-05";
  const fallbackModels = (process.env.OPENAI_FALLBACK_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  const models = uniqueNonEmpty([primaryModel, ...fallbackModels]);

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  let lastError = "Unknown model error";
  const attemptErrors: string[] = [];

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
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
      lastError = `OpenAI error for model "${model}" (${res.status}): ${text}`;
      attemptErrors.push(lastError);
      const lower = text.toLowerCase();
      const shouldFallback =
        i < models.length - 1 &&
        (res.status === 404 ||
          res.status === 429 ||
          res.status === 503 ||
          lower.includes("model") ||
          lower.includes("does not exist") ||
          lower.includes("not found") ||
          lower.includes("access"));
      if (shouldFallback) continue;
      throw new Error(lastError);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      lastError = `Model "${model}" returned empty response`;
      attemptErrors.push(lastError);
      if (i < models.length - 1) continue;
      throw new Error(lastError);
    }

    try {
      return JSON.parse(content);
    } catch {
      lastError = `Model "${model}" response was not valid JSON`;
      attemptErrors.push(lastError);
      if (i < models.length - 1) continue;
      throw new Error(lastError);
    }
  }

  if (attemptErrors.length > 0) {
    throw new Error(`All model attempts failed. ${attemptErrors.join(" | ")}`);
  }
  throw new Error(lastError);
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
