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
        first_line_target_words: "18-24 (occasionally up to 28)",
        diction_goal: "high-variety colloquial social voice; avoid repetitive sterile phrasing",
        recipe_cta_mix: [
          "Full recipe 👇 💬",
          "Recipe in comments ⬇️",
          "Recipe in first comment 👇"
        ],
        lexical_bank: {
          reaction_tokens: REACTION_TOKEN_POOL,
          social_tokens: SOCIAL_TOKEN_POOL
        },
        target_patterns: [
          "first-person testimonial voice",
          "family/social proof mention",
          "reaction and sensory language",
          "concrete detail from title",
          "short hook + fixed CTA"
        ],
        max_options: 5
      },
      recipe_image_strategy: {
        framing: "close or medium-close, tight crop so food fills most of frame",
        camera_angle: "smartphone perspective around 40-55 degrees above food",
        motion: "in-progress cooking action (pouring, stirring, layering, sprinkling, scooping, lifting)",
        realism: "irregular browning, bubbling sauce/oil, uneven seasoning, slight home-cooking splashes",
        human_touch: "prefer visible hand interaction when natural (hand pouring, spoon lifting, fork pulling)",
        lighting: "warm side window light, soft shadows, uneven highlights, non-studio"
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

function titleSeed(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const REACTION_TOKEN_POOL = [
  "OMG",
  "one bite and we were hooked",
  "gone in minutes",
  "plates were empty fast",
  "could not stop eating it",
  "so good it is dangerous",
  "angels sing moment",
  "everyone licked the spoon",
  "the smell was unreal",
  "pure comfort in every bite",
  "priceless reaction at the table",
  "we could not believe how good it was",
  "instant favorite",
  "ridiculously good",
  "crazy good flavor",
  "that first bite sold everyone",
  "it vanished before seconds were served",
  "mouthwatering from the first spoonful",
  "tastebuds went wild",
  "better than expected"
];

const SOCIAL_TOKEN_POOL = [
  "everyone asked for seconds",
  "my husband asked for this again",
  "my kids cleaned their plates",
  "neighbors asked what smelled so good",
  "party guests kept asking for the recipe",
  "family table favorite",
  "potluck winner",
  "birthday crowd loved it",
  "friends begged for the method",
  "the whole house loved it",
  "my mom asked me to make it again",
  "my dad went back for more",
  "weeknight hit at my house",
  "holiday table approved",
  "church supper style favorite",
  "cookout crowd favorite",
  "everyone at dinner wanted the recipe",
  "my sister asked for this on repeat",
  "my grandson asked for another bowl",
  "our guests wiped the dish clean"
];

const DIVERSE_OPENER_POOL = [
  "I was not expecting this",
  "Real talk",
  "No joke",
  "I have to share this",
  "This one surprised me",
  "I made this once",
  "I thought this was hype",
  "Confession",
  "Quick story",
  "Hot take"
];

const SHOCK_ANGLE_TOKENS = [
  "OMG",
  "one bite and everyone lost it",
  "gone in minutes",
  "plates were empty fast",
  "angels sing moment",
  "priceless table reaction"
];

const FAMILY_FLIP_TOKENS = [
  "my husband doubted it",
  "my family side-eyed it at first",
  "my wife was skeptical at first",
  "the kids were unsure at first",
  "my dad said it would be average"
];

const PARTY_PROOF_TOKENS = [
  "brought this to a party",
  "served this at a potluck",
  "put this out at a family gathering",
  "made this for guests over the weekend",
  "took this to a church supper"
];

const NOSTALGIA_TOKENS = [
  "tastes like what grandma made",
  "just like my mom used to make",
  "old-school Sunday supper flavor",
  "that first bite felt like childhood again",
  "straight out of grandma's kitchen"
];

const EASE_BRAG_TOKENS = [
  "just 3 ingredients",
  "just 4 ingredients",
  "dump-and-go style",
  "almost no prep",
  "just set it and forget it",
  "ridiculously easy for weeknights"
];

function clampWordRange(text: string, minWords: number, maxWords: number, fillers: string[]): string {
  let words = text.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) words = words.slice(0, maxWords);
  let i = 0;
  while (words.length < minWords && i < fillers.length) {
    words.push(...fillers[i].split(/\s+/).filter(Boolean));
    if (words.length > maxWords) words = words.slice(0, maxWords);
    i += 1;
  }
  return words.join(" ");
}

function pickSeeded(values: string[], seed: number): string {
  if (!values.length) return "";
  return values[seed % values.length];
}

function hasTokenFromPool(text: string, pool: string[]): boolean {
  const low = text.toLowerCase();
  return pool.some((token) => low.includes(token.toLowerCase()));
}

function stemKey(text: string): string {
  return normalizeCaptionBody(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
    .join(" ");
}

function buildRecipeViralAngle(index: number, title: string, variant = 0): string {
  const seed = titleSeed(`${title}:${index}:${variant}`);
  const ingredient = recipeMainIngredient(title);
  const ingredientText = ingredient === "dinner" ? "this dish" : ingredient;
  const count = ingredientCountPhrase(title);
  const action = inferRecipeAction(title).toLowerCase();
  const social = pickSeeded(SOCIAL_TOKEN_POOL, seed + 21);
  const reaction = pickSeeded(REACTION_TOKEN_POOL, seed + 23);

  if (index === 0) {
    const shock = pickSeeded(SHOCK_ANGLE_TOKENS, seed + 1);
    return `${shock}, one bite and ${social}; ${action} ${count} over ${ingredientText} and it disappeared fast`;
  }
  if (index === 1) {
    const doubt = pickSeeded(FAMILY_FLIP_TOKENS, seed + 3);
    return `${doubt}, then asked for seconds and told me to save this recipe, ${social}`;
  }
  if (index === 2) {
    const party = pickSeeded(PARTY_PROOF_TOKENS, seed + 7);
    return `I ${party} and it was gone first; ${social} before I even sat down`;
  }
  if (index === 3) {
    const nostalgia = pickSeeded(NOSTALGIA_TOKENS, seed + 11);
    return `${nostalgia}, and ${reaction} hit as soon as dinner reached the table`;
  }
  const ease = pickSeeded(EASE_BRAG_TOKENS, seed + 15);
  return `${count}, ${ease}, and still unbelievably good; ${reaction} with almost zero effort`;
}

function lineMatchesAngle(line: string, index: number): boolean {
  const low = line.toLowerCase();
  if (index === 0) return /(omg|one bite|gone in minutes|plates were empty|angels sing|priceless)/.test(low);
  if (index === 1) return /(husband|wife|family|kids|dad).*(doubt|skept|unsure|side-eye|side eyed|then|seconds)/.test(low);
  if (index === 2) return /(party|potluck|gathering|guests|church supper).*(gone|vanish|asked|recipe|first|seconds)/.test(low);
  if (index === 3) return /(grandma|mom|old-school|childhood|used to make)/.test(low);
  return /(3 ingredients|4 ingredients|ingredients|dump-and-go|set it and forget it|no prep|easy).*(unbeliev|crazy good|hooked|gone|favorite|zero effort)/.test(low);
}

function enrichCaptionBody(body: string, type: InputType, index: number, title: string): string {
  let line = normalizeCaptionBody(body);
  if (!line) return line;

  if (type === "recipe") {
    const hasReaction = hasTokenFromPool(line, REACTION_TOKEN_POOL);
    const hasSocial = hasTokenFromPool(line, SOCIAL_TOKEN_POOL);
    if (!hasReaction && !hasSocial) {
      const mixPool = ((titleSeed(title) + index) % 2 === 0 ? REACTION_TOKEN_POOL : SOCIAL_TOKEN_POOL);
      const token = pickSeeded(mixPool, titleSeed(title) + index * 7);
      line = `${line}, ${token}`;
    }
  }

  return clampWordRange(line, 18, 28, ["for dinner tonight", "at my house", "this week"]);
}

function postProcessCaptionBodies(bodies: string[], type: InputType, title: string): string[] {
  const out: string[] = [];
  const seenStem = new Set<string>();
  const seenExact = new Set<string>();
  const targetCount = type === "recipe" ? 5 : Math.min(5, Math.max(5, bodies.length));
  const available = bodies.map((body) => normalizeCaptionBody(body));

  if (type === "recipe") {
    const usedIndices = new Set<number>();
    for (let angle = 0; angle < 5; angle++) {
      let picked = "";
      let pickedIndex = -1;
      for (let i = 0; i < available.length; i++) {
        if (usedIndices.has(i)) continue;
        const candidate = available[i];
        if (!candidate) continue;
        if (lineMatchesAngle(candidate, angle)) {
          picked = candidate;
          pickedIndex = i;
          break;
        }
      }
      if (pickedIndex >= 0) usedIndices.add(pickedIndex);
      let line = picked || buildRecipeViralAngle(angle, title, angle + 1);
      line = enrichCaptionBody(line, type, angle, title);
      const key = normalizeCaptionBody(line).toLowerCase();
      const sKey = stemKey(line);
      if (seenExact.has(key) || seenStem.has(sKey)) {
        line = enrichCaptionBody(buildRecipeViralAngle(angle, title, angle + 31), type, angle + 31, title);
      }
      const finalKey = normalizeCaptionBody(line).toLowerCase();
      const finalStem = stemKey(line);
      if (seenExact.has(finalKey)) continue;
      seenExact.add(finalKey);
      seenStem.add(finalStem);
      out.push(line);
    }
    return out;
  }

  for (let i = 0; i < targetCount; i++) {
    const source = normalizeCaptionBody(bodies[i] || "");
    let line = source;

    line = enrichCaptionBody(line, type, i, title);
    if (!line) continue;

    const key = normalizeCaptionBody(line).toLowerCase();
    const sKey = stemKey(line);
    if (seenExact.has(key) || seenStem.has(sKey)) {
      const opener = pickSeeded(DIVERSE_OPENER_POOL, titleSeed(title) + i * 13);
      line = enrichCaptionBody(`${opener}: ${line}`.replace(/\s+/g, " "), type, i + 31, title);
    }

    const finalKey = normalizeCaptionBody(line).toLowerCase();
    const finalStem = stemKey(line);
    if (seenExact.has(finalKey)) continue;
    seenExact.add(finalKey);
    seenStem.add(finalStem);
    out.push(line);
  }

  return out;
}

function canonicalRecipeCta(input: string | null, index: number, title: string): string {
  if (input) {
    const low = input.toLowerCase();
    if (/recipe in first comment|recipe in first co/.test(low)) return "Recipe in first comment 👇";
    if (/recipe in comments|recipe will be in comments|recipe in comment|recipe in \(c\.o\.m\.m\.e\.n\.t\)/.test(low)) return "Recipe in comments ⬇️";
    if (/full recipe/.test(low)) return "Full recipe 👇 💬";
  }
  const seeded = (titleSeed(title) + index) % 5;
  if (seeded === 1 || seeded === 4) return "Recipe in comments ⬇️";
  if (seeded === 3) return "Recipe in first comment 👇";
  return "Full recipe 👇 💬";
}

function canonicalArticleCta(input: string | null): string {
  if (input && /full article/i.test(input)) return "Full article 👇 💬";
  return "Full article 👇 💬";
}

function normalizeCaption(caption: string, type: InputType, index = 0, title = ""): string {
  const text = (caption || "").trim();
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  let firstLine = normalizeCaptionBody(lines[0] || text);
  firstLine = firstLine
    .replace(/\bfull\s+recipe\b.*$/i, "")
    .replace(/\brecipe\s+in\s+comments?\b.*$/i, "")
    .replace(/\brecipe\s+in\s+first\s+comment\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const secondLineRaw = lines.length > 1 ? lines[1] : null;

  const cta =
    type === "recipe"
      ? canonicalRecipeCta(secondLineRaw, index, title)
      : canonicalArticleCta(secondLineRaw);

  firstLine = clampWordRange(firstLine, 18, 28, ["for dinner", "this week", "at my house"]);
  firstLine = firstLine.replace(/[.。]\s*$/, "");

  return `${firstLine}.\n${cta}`;
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
    return [
      buildRecipeViralAngle(0, "house", 1),
      buildRecipeViralAngle(1, "house", 2),
      buildRecipeViralAngle(2, "house", 3),
      buildRecipeViralAngle(3, "house", 4),
      buildRecipeViralAngle(4, "house", 5)
    ];
  }
  return [
    "I had no idea this until now, and it instantly changed how I do this",
    "Most people still get this wrong, and I was shocked by the real answer",
    "I thought this was normal for years, but I learned something important today",
    "This tip looked random at first, but the result made complete sense to me",
    "I tried this once out of curiosity, and now I do it every single time"
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
  const recipeRealismStyle =
    "Photorealistic casual home-kitchen smartphone shot, slightly handheld perspective, taken around 40-55 degrees above the food. Tight framing with slight zoom so the recipe fills most of the frame. Show an in-progress cooking action moment with realistic texture details: irregular browning, bubbling sauce/oil, uneven seasoning, natural cooking imperfections, and slight home-cooking splashes. Warm natural side window light with soft shadows and uneven highlights (not studio). Real home-kitchen context with small prep bowls, utensils, and ingredients casually placed nearby. Prefer human interaction when natural (a hand pouring sauce, spoon lifting food, fork pulling meat). Avoid food-magazine styling, perfect symmetry, and overly clean staged scenes.";
  const articleRealismStyle =
    "Casual smartphone kitchen-photo feel with slight handheld perspective and mildly imperfect framing. Keep composition practical and natural, with side window light, soft shadows, and realistic texture detail, while avoiding polished studio styling or perfect symmetry.";

  const parts: string[] = [cleaned];

  if (type === "recipe") {
    parts.push(
      "Style profile: warm natural kitchen light, cozy comfort-food tones, moderate contrast, close or medium-close framing, realistic home-kitchen texture."
    );
    parts.push(recipeRealismStyle);
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
    parts.push(articleRealismStyle);
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
  const recipeRealismStyle =
    "Casual smartphone kitchen photo, slightly handheld, around 40-55 degrees above the food, tight crop so food fills most of the frame. In-progress cooking moment with realistic irregular browning, bubbling sauce/oil, uneven seasoning, slight splashes, and natural home-cooking imperfection. Warm side window light with soft shadows and uneven highlights. Real home-kitchen context with prep bowls/utensils nearby. Prefer human interaction when natural (hand pouring sauce, spoon lifting). Avoid food-magazine styling, studio polish, and perfect symmetry.";
  const articleRealismStyle =
    "Casual smartphone kitchen-photo feel with slight handheld perspective, practical framing, natural side window light, and realistic texture detail. Avoid polished magazine styling and perfect symmetry.";
  const parts: string[] = [scene];

  if (type === "recipe") {
    parts.push("Photoreal food photography, warm natural kitchen light, cozy home-cooking mood, detailed textures.");
    parts.push(recipeRealismStyle);
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
    parts.push(articleRealismStyle);
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
  const shortHooks = hooks.map((h) => clampWords(normalizeCaptionBody(h), 24));

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
  const shortCaptionBodies = captions.map((c) => normalizeCaptionBody(c)).filter(Boolean);
  const houseBodies = houseStyleBodies(type).map((c) => normalizeCaptionBody(c)).filter(Boolean);
  const defaultBodies = uniqueNonEmpty([...houseBodies, ...shortCaptionBodies, ...shortHooks].map((body) => normalizeCaptionBody(body))).slice(0, 10);
  const processedDefaultBodies = postProcessCaptionBodies(defaultBodies, type, title).slice(0, 5);
  const defaultMergedOptions = processedDefaultBodies.map((body, idx) =>
    normalizeCaption(body, type, idx, title)
  );
  while (defaultMergedOptions.length < 5) {
    defaultMergedOptions.push(normalizeCaption(fallbackCaption, type, defaultMergedOptions.length, title));
  }

  const rawCaptionOptions = Array.isArray(src.caption_options) ? src.caption_options.filter(Boolean) : [];
  const normalizedFromModel = uniqueNonEmpty(
    rawCaptionOptions
      .map((c) => normalizeCaptionBody(c))
      .filter(Boolean)
  );
  const processedModelBodies = postProcessCaptionBodies(normalizedFromModel, type, title);
  const finalizedModelCaptions = processedModelBodies
    .slice(0, 5)
    .map((body, idx) => normalizeCaption(body, type, idx, title));

  const mergedCaptionOptions =
    finalizedModelCaptions.length > 0
      ? finalizedModelCaptions
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
