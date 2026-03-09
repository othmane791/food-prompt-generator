import { NextRequest, NextResponse } from "next/server";
import { STYLE_RULES } from "@/lib/styleRules";

type InputType = "recipe" | "article";
type AspectRatio = "2:3" | "4:5";
type RecipeImageFocus = "step_or_ingredient" | "final_dish";
type CameraAngleMode = "regular_40_55" | "above";
type RecipeStyleMode = "action_prep" | "ingredient_strip_recipe";

type GeneratePayload = {
  type?: InputType;
  title?: string;
  link?: string;
  aspectRatio?: AspectRatio;
  recipeImageFocus?: RecipeImageFocus;
  cameraAngleMode?: CameraAngleMode;
  recipeStyleMode?: RecipeStyleMode;
  generateImage?: boolean;
};

type LinkExtract = {
  title: string;
  description: string;
  bodySnippet: string;
  featuredImageUrl?: string;
  recipeIngredients?: string[];
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

type GeneratedImage = {
  prompt_name: string;
  model: string;
  used_reference_image: boolean;
  data_url?: string | null;
  remote_url?: string | null;
  error?: string | null;
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

function normalizeCameraAngleMode(value?: string): CameraAngleMode {
  return value === "above" ? "above" : "regular_40_55";
}

function normalizeRecipeStyleMode(value?: string): RecipeStyleMode {
  return value === "ingredient_strip_recipe" || value === "viral_recipe_infographic"
    ? "ingredient_strip_recipe"
    : "action_prep";
}

function normalizeGenerateImage(value?: boolean): boolean {
  return value !== false;
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

function toAbsoluteUrl(raw: string, base: string): string {
  try {
    return new URL(raw, base).toString();
  } catch {
    return raw;
  }
}

function shortIngredientLabel(raw: string): string | null {
  let text = stripHtml(raw || "").toLowerCase().trim();
  if (!text) return null;

  text = text.replace(/\([^)]*\)/g, " ");
  text = text.replace(/^[\d\s/.,-]+/, "");
  text = text.replace(
    /^(cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|packages?|pkg|packets?|cans?|jars?|cloves?|sticks?|slices?|bunches?|pinch|dash)\b\s*/i,
    ""
  );
  text = text.replace(/^of\s+/, "");
  text = text.split(",")[0].trim();
  text = text.replace(/\s+/g, " ");

  const canonical: Array<[RegExp, string]> = [
    [/\bstrawberr(y|ies)\b/, "strawberries"],
    [/\bpineapple\b/, "pineapple"],
    [/\bmini\s+marshmallows?\b|\bmarshmallows?\b/, "mini marshmallows"],
    [/\bcream cheese\b/, "cream cheese"],
    [/\bcool whip\b|\bwhipped topping\b|\bwhipped cream\b/, "whipped topping"],
    [/\bjell-?o\b|\bgelatin\b/, "strawberry gelatin"],
    [/\bpudding\b/, "pudding mix"],
    [/\bchicken\b/, "chicken breast"],
    [/\bbeef\b/, "beef"],
    [/\bground beef\b/, "ground beef"],
    [/\bcabbage\b/, "shredded cabbage"],
    [/\bcarrot\b/, "julienned carrot"],
    [/\bonion\b/, "onion"],
    [/\bgarlic\b/, "garlic"],
    [/\bmayo\b|\bmayonnaise\b/, "mayo"],
    [/\bvinegar\b/, "vinegar"],
    [/\bcheese\b/, "cheese"],
    [/\bnoodles?\b/, "noodles"],
    [/\brice\b/, "rice"],
    [/\bpotato(es)?\b/, "potatoes"],
    [/\bbutter\b/, "butter"],
    [/\boil\b/, "oil"],
    [/\bbroth\b/, "broth"],
    [/\bcelery\b/, "celery"],
    [/\btomato(es)?\b/, "tomato"],
    [/\bflour\b/, "flour"],
    [/\bsugar\b/, "sugar"],
    [/\beggs?\b/, "eggs"],
    [/\bmilk\b/, "milk"],
    [/\bvanilla\b/, "vanilla"],
    [/\bsalt\b/, "salt"],
    [/\bpepper\b/, "pepper"]
  ];

  for (const [re, label] of canonical) {
    if (re.test(text)) return label;
  }

  text = text.replace(
    /\b(fresh|frozen|chopped|diced|minced|grated|ground|boneless|skinless|large|small|medium|extra|virgin)\b/g,
    " "
  );
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return null;

  const words = text.split(" ").slice(0, 4);
  const clipped = words.join(" ").trim();
  return clipped.length >= 2 ? clipped : null;
}

function collectRecipeNodes(node: unknown, out: Array<Record<string, unknown>>): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectRecipeNodes(item, out);
    return;
  }
  if (typeof node !== "object") return;

  const obj = node as Record<string, unknown>;
  const rawType = obj["@type"];
  const types = Array.isArray(rawType) ? rawType : [rawType];
  const isRecipe = types.some((t) => typeof t === "string" && /recipe/i.test(t));
  if (isRecipe) out.push(obj);

  for (const value of Object.values(obj)) collectRecipeNodes(value, out);
}

function extractRecipeIngredientsFromHtml(html: string): string[] {
  const blocks = Array.from(
    html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
  );
  if (!blocks.length) return [];

  const labels: string[] = [];
  for (const block of blocks) {
    const raw = (block[1] || "").trim();
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const recipeNodes: Array<Record<string, unknown>> = [];
    collectRecipeNodes(parsed, recipeNodes);

    for (const recipe of recipeNodes) {
      const ing = recipe.recipeIngredient;
      const rawIngredients =
        typeof ing === "string"
          ? ing.split(/\n|;/).map((s) => s.trim())
          : Array.isArray(ing)
            ? ing.filter((v): v is string => typeof v === "string")
            : [];

      for (const item of rawIngredients) {
        const label = shortIngredientLabel(item);
        if (label) labels.push(label);
      }
    }
  }

  const unique = Array.from(new Set(labels.map((s) => s.trim()).filter(Boolean)));
  return unique.slice(0, 12);
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
  const recipeIngredients = extractRecipeIngredientsFromHtml(html);
  const rawFeatured =
    extractMeta(html, "og:image") ||
    extractMeta(html, "twitter:image") ||
    extractMeta(html, "twitter:image:src");
  const featuredImageUrl = rawFeatured ? toAbsoluteUrl(rawFeatured, url) : undefined;
  return { title, description, bodySnippet, featuredImageUrl, recipeIngredients };
}

function buildUserPrompt(input: {
  type: InputType;
  title: string;
  link?: string;
  linkData?: LinkExtract;
  aspectRatio: AspectRatio;
  recipeImageFocus: RecipeImageFocus;
  cameraAngleMode: CameraAngleMode;
  recipeStyleMode: RecipeStyleMode;
}): string {
  return JSON.stringify(
    {
      task: "Generate image prompts and captions for a single post.",
      input_type: input.type,
      title: input.title,
      source_link: input.link || "",
      source_preview: input.linkData || null,
      featured_image_reference: input.type === "recipe" ? (input.linkData?.featuredImageUrl || "") : "",
      aspect_ratio: input.aspectRatio,
      aspect_format: aspectLabel(input.aspectRatio),
      recipe_image_focus: input.recipeImageFocus,
      camera_angle_mode: input.cameraAngleMode,
      recipe_style_mode: input.recipeStyleMode,
      caption_strategy: {
        source: "top-engagement analysis",
        diction_goal: "high-variety colloquial social voice; avoid repetitive sterile phrasing",
        constraints: [
          "avoid repeating exact sentence structures across options",
          "vary openings, rhythm, and sentence length naturally",
          "keep hooks specific to recipe/article context, not generic filler"
        ],
        cta_policy: "include clear post CTA line",
        max_options: 5
      },
      recipe_image_strategy: {
        style_mode: input.recipeStyleMode,
        framing:
          input.recipeStyleMode === "ingredient_strip_recipe"
            ? "clean two-section composition with top ingredient strip and bottom hero dish, mobile-first readability"
            : "close or medium-close composition, tight crop so food fills most of frame",
        camera_angle:
          input.recipeStyleMode === "ingredient_strip_recipe"
            ? "slightly above 30-45 degree angle on hero dish, not overhead"
            : input.cameraAngleMode === "above"
              ? "above shot, top-down smartphone angle from above the food"
              : "regular casual smartphone angle around 40-55 degrees above food with slight handheld feel",
        cooking_moment:
          input.recipeStyleMode === "ingredient_strip_recipe"
            ? "show finished dish hero, no in-progress action"
            : "always in-progress action, never finished plated dish",
        action_pool: [
          "pouring sauce",
          "sprinkling seasoning",
          "stirring",
          "scooping with a spoon",
          "lifting food with a spatula",
          "drizzling butter or oil",
          "adding cheese",
          "layering ingredients",
          "mixing",
          "serving from a pan"
        ],
        realism: "irregular browning, bubbling sauce/oil, sizzling droplets, crispy edges, melting ingredients, uneven seasoning, natural imperfections",
        environment: "real home kitchen context with prep bowls, utensils, ingredients, cookware, slight cooking mess (steam, crumbs, splashes, drips)",
        human_touch: "occasionally include a hand interacting with food",
        lighting: "warm side window light, soft shadows, uneven highlights, non-studio",
        depth_of_field: "smartphone-style shallow depth; main food sharp, background softly blurred"
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

function recipeTitleMention(title: string, seed: number): string {
  const clean = normalizeCaptionBody(title);
  if (!clean) return "this dish";
  const low = clean.toLowerCase();
  const options = [clean, "this dish", "this one", "this recipe", "it"];
  if (/^the\s+/.test(low)) return pickSeeded(options.slice(1), seed + 3);
  return pickSeeded(options, seed + 1);
}

function buildRecipeViralAngle(index: number, title: string, variant = 0): string {
  const seed = titleSeed(`${title}:${index}:${variant}`);
  const count = ingredientCountPhrase(title);
  const action = inferRecipeAction(title);
  const titleRef = recipeTitleMention(title, seed);
  const social = pickSeeded(SOCIAL_TOKEN_POOL, seed + 21);
  const reaction = pickSeeded(REACTION_TOKEN_POOL, seed + 23);
  const shock = pickSeeded(SHOCK_ANGLE_TOKENS, seed + 1);
  const doubt = pickSeeded(FAMILY_FLIP_TOKENS, seed + 3);
  const party = pickSeeded(PARTY_PROOF_TOKENS, seed + 7);
  const nostalgia = pickSeeded(NOSTALGIA_TOKENS, seed + 11);
  const ease = pickSeeded(EASE_BRAG_TOKENS, seed + 15);
  const opener = pickSeeded(DIVERSE_OPENER_POOL, seed + 27);

  if (index === 0) {
    const templates = [
      `${shock}, I set out ${titleRef} and ${social} before I could even sit down`,
      `${opener}: ${titleRef} hit the table and ${reaction}, then ${social}`,
      `${shock}, ${titleRef} was gone fast and ${social} right away`,
      `${reaction}; ${titleRef} barely cooled before ${social}`
    ];
    return pickSeeded(templates, seed + 31);
  }
  if (index === 1) {
    const templates = [
      `${doubt}, then asked for seconds and admitted ${titleRef} was a keeper`,
      `${doubt}, but after one bite ${social} and the doubt vanished`,
      `${doubt}, then went back twice for ${titleRef} and asked me to make it again`,
      `${doubt}, and now ${titleRef} is on repeat at my house`
    ];
    return pickSeeded(templates, seed + 37);
  }
  if (index === 2) {
    const templates = [
      `I ${party} and ${titleRef} was gone first with ${social}`,
      `Party test passed: ${titleRef} disappeared fast and ${social}`,
      `I brought ${titleRef} for guests and ${social} before the tray was half empty`,
      `${titleRef} at a gathering was a lock; ${social} and I left with no leftovers`
    ];
    return pickSeeded(templates, seed + 41);
  }
  if (index === 3) {
    const templates = [
      `${nostalgia}, and ${reaction} hit the second ${titleRef} reached the table`,
      `${titleRef} has that old-school comfort vibe; ${nostalgia} in the best way`,
      `${nostalgia}, but easier, and ${social}`,
      `First bite of ${titleRef} felt familiar, like home, and ${reaction}`
    ];
    return pickSeeded(templates, seed + 43);
  }
  const templates = [
    `${count}, ${ease}, and ${titleRef} still tasted unbelievably good`,
    `${action} and go: ${count}, ${ease}, and ${social}`,
    `${ease}, barely any prep, and ${reaction} from the first bite`,
    `${count}, almost no effort, and ${titleRef} came out better than expected`
  ];
  return pickSeeded(templates, seed + 47);
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

  if (type === "recipe") return line;
  return clampWordRange(line, 14, 36, ["at my house", "this week"]);
}

function postProcessCaptionBodies(bodies: string[], type: InputType, title: string): string[] {
  const out: string[] = [];
  const seenStem = new Set<string>();
  const seenExact = new Set<string>();
  const targetCount = 5;
  const available = bodies.map((body) => normalizeCaptionBody(body));

  if (type === "recipe") {
    for (let i = 0; i < available.length && out.length < targetCount; i++) {
      const source = normalizeCaptionBody(available[i] || "");
      if (!source) continue;
      const key = normalizeCaptionBody(source).toLowerCase();
      const sKey = stemKey(source);
      if (seenExact.has(key) || seenStem.has(sKey)) continue;
      seenExact.add(key);
      seenStem.add(sKey);
      out.push(source);
    }
    while (out.length < targetCount) {
      const filler = normalizeCaptionBody(`This ${title || "recipe"} is worth trying.`);
      const key = filler.toLowerCase();
      if (!seenExact.has(key)) {
        seenExact.add(key);
        seenStem.add(stemKey(filler));
        out.push(filler);
      } else {
        out.push(normalizeCaptionBody(`This ${title || "recipe"} is worth making again.`));
      }
    }
    return out.slice(0, targetCount);
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

  if (type !== "recipe") {
    firstLine = clampWordRange(firstLine, 14, 36, ["for dinner", "this week", "at my house"]);
  }
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
      "Tried this once and saved it immediately",
      "This one surprised me in the best way",
      "Made it for a get-together and people asked for it again",
      "Comfort-food energy with a simple method",
      "Easy to make and very hard to stop eating"
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

const RECIPE_ACTION_MOMENTS = [
  "pouring sauce over the ingredients",
  "sprinkling seasoning across the pan",
  "stirring the mixture while it bubbles",
  "scooping and folding with a spoon",
  "lifting food with a spatula from the pan",
  "drizzling butter or oil over the recipe",
  "adding cheese while it melts into the dish",
  "layering ingredients into the baking dish",
  "mixing ingredients together in the pan",
  "serving directly from the hot pan"
];

const RECIPE_HAND_INTERACTIONS = [
  "Include a hand pouring sauce",
  "Include a hand sprinkling seasoning",
  "Include a hand stirring with a spoon",
  "Include a hand lifting a bite with a spatula",
  "Include a hand serving from the pan"
];

function recipeFocusSentence(): string {
  return "Show an in-progress cooking moment only, never a finished plated dish.";
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
  const count = ingredientCountPhrase(title).replace(/^just\s+/i, "");
  const ingredient = recipeMainIngredient(title);
  const seed = titleSeed(`${title}:overlay`);
  const ingredientLabel = ingredient === "dinner" ? "this dinner" : ingredient;
  const templates = [
    `Why does this ${ingredientLabel} turn into the easiest comfort dinner everyone asks for again`,
    `${count} ingredients, one pan, and this ${ingredientLabel} disappears faster than expected`,
    `What makes this ${ingredientLabel} so addictive even with such simple pantry ingredients`,
    `This easy ${ingredientLabel} trick keeps everyone asking for seconds at dinner`,
    `The reason this ${ingredientLabel} tastes homemade with almost no prep surprised me`
  ];
  const raw = templates[seed % templates.length];
  return clampWordRange(raw, 10, 18, ["for dinner tonight", "at home"]).replace(/[.。]\s*$/, "");
}

function recipeActionMoment(title: string, promptName: string): string {
  const seed = titleSeed(`${title}:${promptName}:action`);
  return RECIPE_ACTION_MOMENTS[seed % RECIPE_ACTION_MOMENTS.length];
}

function recipeHandInteraction(title: string, promptName: string): string | null {
  const seed = titleSeed(`${title}:${promptName}:hand`);
  if (seed % 3 !== 0) return null;
  return RECIPE_HAND_INTERACTIONS[seed % RECIPE_HAND_INTERACTIONS.length];
}

type RecipeCategory =
  | "coleslaw_salad"
  | "dessert_salad"
  | "casserole"
  | "soup"
  | "dessert"
  | "skillet"
  | "slow_cooker"
  | "bread"
  | "pasta"
  | "comfort_general";

function inferRecipeCategory(title: string): RecipeCategory {
  const t = title.toLowerCase();
  if (/\b(coleslaw|slaw)\b/.test(t)) return "coleslaw_salad";
  if (/\bsalad\b/.test(t)) {
    if (/\b(strawberr|berry|jell-?o|gelatin|marshmallow|cool whip|whipped|pudding|dessert|fluff|crackle|ambrosia)\b/.test(t)) {
      return "dessert_salad";
    }
    return "coleslaw_salad";
  }
  if (/\b(casserole|bake|lasagna)\b/.test(t)) return "casserole";
  if (/\b(soup|stew|chili|broth)\b/.test(t)) return "soup";
  if (/\b(cake|cookie|brownie|dessert|pie|cobbler|frosting)\b/.test(t)) return "dessert";
  if (/\b(skillet|pan|stir fry|fry)\b/.test(t)) return "skillet";
  if (/\b(slow cooker|crock pot|crockpot)\b/.test(t)) return "slow_cooker";
  if (/\b(biscuit|bread|roll|bun|loaf)\b/.test(t)) return "bread";
  if (/\b(pasta|spaghetti|noodle|mac)\b/.test(t)) return "pasta";
  return "comfort_general";
}

function ingredientStripVessel(category: RecipeCategory): string {
  if (category === "coleslaw_salad") return "a clear glass bowl";
  if (category === "dessert_salad") return "a clear glass dessert bowl";
  if (category === "casserole") return "a rustic ceramic baking dish";
  if (category === "soup") return "a rustic soup bowl";
  if (category === "dessert") return "a cake stand or dessert plate";
  if (category === "skillet") return "a cast-iron skillet and rustic serving plate";
  if (category === "slow_cooker") return "a cozy serving bowl or plate";
  if (category === "bread") return "a wooden board and bread basket";
  if (category === "pasta") return "a deep ceramic pasta bowl";
  return "a rustic serving bowl";
}

function ingredientStripBackground(category: RecipeCategory): string {
  if (category === "coleslaw_salad") return "crispy fried chicken pieces and a kitchen towel";
  if (category === "dessert_salad") return "fresh berries, a dessert spoon, and a folded linen napkin";
  if (category === "casserole") return "a serving spoon, folded napkin, and extra casserole dish";
  if (category === "soup") return "a bread basket and butter knife";
  if (category === "dessert") return "a frosting bowl, whisk, and sliced dessert";
  if (category === "skillet") return "a skillet handle, herbs, and a wooden spoon";
  if (category === "slow_cooker") return "a warm pot in the back with serving spoon";
  if (category === "bread") return "a flour jar, butter dish, and linen cloth";
  if (category === "pasta") return "parmesan, herbs, and sauce jar softly blurred";
  return "subtle kitchen props and related side ingredients";
}

function ingredientStripDefaultIngredients(category: RecipeCategory): string[] {
  if (category === "coleslaw_salad") {
    return ["shredded cabbage", "julienned carrot", "onion", "mayo", "vinegar", "salt & pepper"];
  }
  if (category === "dessert_salad") {
    return ["strawberries", "pineapple", "cream cheese", "whipped topping", "mini marshmallows", "strawberry gelatin"];
  }
  if (category === "casserole") {
    return ["chicken", "cream sauce", "cheese", "onion", "garlic", "seasoning"];
  }
  if (category === "soup") {
    return ["beef broth", "onion", "celery", "carrot", "garlic", "thyme"];
  }
  if (category === "dessert") {
    return ["flour", "sugar", "butter", "eggs", "vanilla", "milk"];
  }
  if (category === "skillet") {
    return ["beef", "onion", "garlic", "oil", "bell pepper", "seasoning blend"];
  }
  if (category === "slow_cooker") {
    return ["beef roast", "onion", "beef broth", "garlic", "onion soup mix", "thyme"];
  }
  if (category === "bread") {
    return ["flour", "yeast", "butter", "milk", "sugar", "salt"];
  }
  if (category === "pasta") {
    return ["pasta", "tomato sauce", "ground beef", "onion", "parmesan", "basil"];
  }
  return ["chicken", "onion", "garlic", "olive oil", "salt & pepper", "fresh herbs"];
}

function ingredientStripIngredients(category: RecipeCategory, title: string, linkData?: LinkExtract): string[] {
  const defaults = ingredientStripDefaultIngredients(category);
  const linked = (linkData?.recipeIngredients || []).map((x) => shortIngredientLabel(x) || "").filter(Boolean);
  if (linked.length >= 4) {
    return Array.from(new Set(linked)).slice(0, 6);
  }

  const source = `${title} ${linkData?.description || ""} ${linkData?.bodySnippet || ""}`.toLowerCase();
  const inferred: string[] = [];
  const inferRules: Array<[RegExp, string]> = [
    [/\bfrench onion\b/, "onion soup mix"],
    [/\bpot roast\b|\broast\b/, "beef roast"],
    [/\bbeef broth\b|\bbroth\b/, "beef broth"],
    [/\bstrawberr(y|ies)\b/, "strawberries"],
    [/\bpineapple\b/, "pineapple"],
    [/\bmini\s+marshmallows?\b|\bmarshmallows?\b/, "mini marshmallows"],
    [/\bcream cheese\b/, "cream cheese"],
    [/\bcool whip\b|\bwhipped topping\b|\bwhipped cream\b/, "whipped topping"],
    [/\bjell-?o\b|\bgelatin\b/, "strawberry gelatin"],
    [/\bpudding\b/, "pudding mix"],
    [/\bchicken\b/, "chicken breast"],
    [/\bbeef\b/, "beef"],
    [/\bonion\b/, "onion"],
    [/\bgarlic\b/, "garlic"],
    [/\bcabbage\b/, "shredded cabbage"],
    [/\bcarrot\b/, "julienned carrot"],
    [/\bmayo\b|\bmayonnaise\b/, "mayo"],
    [/\bvinegar\b/, "vinegar"],
    [/\bnoodles?\b/, "noodles"],
    [/\bcheese\b/, "cheese"],
    [/\bbroth\b/, "broth"],
    [/\bpotato(es)?\b/, "potatoes"],
    [/\brice\b/, "rice"],
    [/\bflour\b/, "flour"],
    [/\bsugar\b/, "sugar"],
    [/\beggs?\b/, "eggs"],
    [/\bmilk\b/, "milk"],
    [/\bvanilla\b/, "vanilla"]
  ];

  for (const [pattern, label] of inferRules) {
    if (pattern.test(source)) inferred.push(label);
  }

  const uniqueInferred = Array.from(new Set(inferred));
  if (uniqueInferred.length >= 4) return uniqueInferred.slice(0, 6);

  const merged = Array.from(new Set([...uniqueInferred, ...defaults]));
  return merged.slice(0, 6);
}

function ingredientStripDisplayTitle(title: string): string {
  const original = normalizeCaptionBody(title);
  if (!original) return "Recipe";
  let t = original
    .replace(/\b(slow cooker|crock pot|crockpot|easy|quick|best|favorite|recipe)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) t = original;

  const maxChars = 32;
  if (t.length <= maxChars) return t;
  const words = t.split(/\s+/);
  let compact = "";
  for (const w of words) {
    const next = `${compact} ${w}`.trim();
    if (next.length > maxChars) break;
    compact = next;
  }
  return compact || words.slice(0, 4).join(" ");
}

function buildIngredientStripRecipePrompt(
  title: string,
  ratioText: string,
  _referenceImageUrl?: string,
  linkData?: LinkExtract
): string {
  const category = inferRecipeCategory(title);
  const ingredients = ingredientStripIngredients(category, title, linkData).slice(0, 6);
  const displayTitle = ingredientStripDisplayTitle(title);
  return normalizePromptText(
    `Clean ingredient-strip header template in ${ratioText}, minimalist white-background graphic layout for external composition. This is NOT a full recipe photo. Top header content (title + ingredient strip) must occupy about 25% of total image height, with very small top padding and tight vertical spacing. Use centered one-line title text exactly "${displayTitle}" in bold simple sans-serif black. Do not wrap title to two lines; reduce font size to keep it on one line with safe margins. Directly below, render a horizontal ingredient strip on clean white background with isolated ingredients and short labels: ${ingredients.join(", ")}. Keep labels fully visible and mobile-readable. IMPORTANT: The lower 75% of the image must be plain clean white empty area with no dish, no food photo, no props, no textures, no shadows, no gradients, no extra graphics (reserved for external website image composition). No badges, no ribbons, no checkmarks, no logos, no watermarks, no decorative elements.`
  );
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
  _recipeImageFocus: RecipeImageFocus,
  title: string,
  cameraAngleMode: CameraAngleMode,
  recipeStyleMode: RecipeStyleMode,
  referenceImageUrl?: string,
  linkData?: LinkExtract
): string {
  const name = (promptName || "").toLowerCase();
  let cleaned = withAspect(prompt, ratioText)
    .replace(/\bno text overlay\b\.?/gi, "")
    .replace(/\bhigh contrast white text on dark translucent box\b/gi, "")
    .replace(/\bdark translucent box\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (type === "recipe" && recipeStyleMode === "ingredient_strip_recipe") {
    return buildIngredientStripRecipePrompt(title, ratioText, referenceImageUrl, linkData);
  }
  const overlaySentence = recipeOverlaySentence(title);
  const actionMoment = recipeActionMoment(title, name);
  const handInteraction = recipeHandInteraction(title, name);
  const cameraAngleSentence =
    cameraAngleMode === "above"
      ? "Camera angle: above shot (top-down smartphone perspective from above) while keeping a tight close crop."
      : "Camera angle: casual smartphone perspective around 40-55 degrees above the food.";
  const recipeRealismStyle = [
    `Photorealistic casual home-kitchen cooking photo, ${ratioText}.`,
    "Casual smartphone kitchen photo with slight handheld perspective.",
    cameraAngleSentence,
    "Close or medium-close composition with tight framing so food fills most of the frame.",
    `Scene: ${actionMoment}; this must be an in-progress cooking moment, never a finished plated dish.`,
    "Food textures should look real: irregular browning, bubbling sauce or oil, sizzling droplets, crispy edges, melting ingredients, uneven seasoning, and natural cooking imperfections.",
    "Lighting: warm natural side window light with soft shadows and uneven highlights, not studio lighting.",
    "Environment: real home kitchen context with prep bowls, utensils, ingredients, cutting boards, or cookware casually placed nearby, with slight cooking mess like small splashes, crumbs, steam, grease bubbles, or sauce drips.",
    "Depth of field should feel like a smartphone photo: main food sharp, background softly blurred.",
    handInteraction ? `${handInteraction} when it looks natural.` : "Human interaction can be included when it feels natural.",
    "Avoid food-magazine styling, perfect symmetry, studio lighting, and overly clean staged kitchen scenes."
  ].join(" ");
  const articleRealismStyle =
    "Casual smartphone kitchen-photo feel with slight handheld perspective and mildly imperfect framing. Keep composition practical and natural, with side window light, soft shadows, and realistic texture detail, while avoiding polished studio styling or perfect symmetry.";
  const referenceLine = referenceImageUrl
    ? "If your image tool supports reference images, attach the featured image as a separate image input (not as text URL)."
    : "";

  const parts: string[] = [cleaned];

  if (type === "recipe") {
    parts.push("Style profile: realistic viral home-cooking smartphone shot focused on in-progress prep action.");
    if (referenceLine) parts.push(referenceLine);
    parts.push(recipeRealismStyle);
    parts.push(recipeFocusSentence());
    if (name.includes("text_overlay")) {
      cleaned = cleaned
        .replace(/\b(text|headline)\s*:\s*["'][^"']*["']/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      parts[0] = cleaned;
      parts.push(
        "Add bold black sans-serif headline text on a white rounded rectangle banner at the top or upper-middle, mobile readable, while keeping food photo dominant."
      );
      parts.push(`Do not use the recipe title as overlay text.`);
      parts.push(`Render this exact curiosity-driven overlay hook (10-18 words): "${overlaySentence}".`);
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
  _recipeImageFocus: RecipeImageFocus,
  title: string,
  cameraAngleMode: CameraAngleMode,
  recipeStyleMode: RecipeStyleMode,
  referenceImageUrl?: string,
  linkData?: LinkExtract
): string {
  if (type === "recipe" && recipeStyleMode === "ingredient_strip_recipe") {
    return buildIngredientStripRecipePrompt(title, "portrait 4:5 (1080x1350)", referenceImageUrl, linkData);
  }
  const name = (promptName || "").toLowerCase();
  const scene = baseSceneFromOpenAIPrompt(openAIPrompt);
  const actionMoment = recipeActionMoment(title, name);
  const handInteraction = recipeHandInteraction(title, name);
  const cameraAngleSentence =
    cameraAngleMode === "above"
      ? "STRICT CAMERA ANGLE: true overhead top-down view (90 degrees directly above the food)."
      : "STRICT CAMERA ANGLE: oblique smartphone view around 40-55 degrees above the food.";
  const cameraAngleNegative =
    cameraAngleMode === "above"
      ? "Hard constraint: no oblique angle, no 3/4 angle, no side angle, no eye-level angle."
      : "Hard constraint: no top-down 90-degree angle, no side angle, no eye-level angle.";
  const recipeRealismStyle = [
    cameraAngleSentence,
    cameraAngleNegative,
    "Casual smartphone kitchen photo with slight handheld perspective.",
    "Close or medium-close composition with tight crop so the food fills most of the frame.",
    `In-progress cooking action: ${actionMoment}; never a finished plated dish.`,
    "Food realism: irregular browning, bubbling sauce or oil, sizzling droplets, crispy edges, melting ingredients, uneven seasoning, and natural cooking imperfections.",
    "Warm natural side-window kitchen light, soft shadows, uneven highlights, non-studio look.",
    "Real home kitchen context with prep bowls, utensils, ingredients, cutting boards, cookware, and slight cooking mess (splashes, crumbs, steam, grease bubbles, sauce drips).",
    "Smartphone-style shallow depth of field: main food sharp, background softly blurred.",
    handInteraction ? `${handInteraction} when natural.` : "Human interaction may appear when natural.",
    "Avoid food-magazine styling, perfect symmetry, studio polish, and overly staged kitchen scenes."
  ].join(" ");
  const articleRealismStyle =
    "Casual smartphone kitchen-photo feel with slight handheld perspective, practical framing, natural side window light, and realistic texture detail. Avoid polished magazine styling and perfect symmetry.";
  const parts: string[] = [];
  const referenceLine = referenceImageUrl
    ? "If your image tool supports reference images, attach the featured image as a separate image input (not as text URL)."
    : "";

  if (type === "recipe") {
    if (referenceLine) parts.push(referenceLine);
    parts.push(cameraAngleSentence);
    parts.push(cameraAngleNegative);
    parts.push(scene);
    parts.push("Photorealistic viral home-cooking smartphone image style.");
    parts.push(recipeRealismStyle);
    parts.push("Keep focus on active cooking process and textures.");

    if (name.includes("text_overlay")) {
      parts.push(
        "Overlay style: bold black sans-serif text on a white rounded rectangle banner at the top or upper-middle, mobile readable, food still dominant."
      );
      parts.push(`Curiosity-driven overlay hook (10-18 words): "${recipeOverlaySentence(title)}".`);
    }
  } else {
    parts.push(scene);
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
  recipeImageFocus: RecipeImageFocus,
  cameraAngleMode: CameraAngleMode,
  recipeStyleMode: RecipeStyleMode,
  referenceImageUrl?: string,
  linkData?: LinkExtract
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

  const namedPrompts =
    type === "recipe" && recipeStyleMode === "ingredient_strip_recipe"
      ? [
          (() => {
            const openAIPrompt = buildIngredientStripRecipePrompt(
              title,
              "portrait 4:5 (1080x1350)",
              referenceImageUrl,
              linkData
            );
            return {
              name: "ingredient_strip_recipe_prompt",
              prompt: openAIPrompt,
              openai_prompt: openAIPrompt,
              nanobanana_v2_prompt: buildNanobananaPrompt(
                openAIPrompt,
                "ingredient_strip_recipe_prompt",
                type,
                recipeImageFocus,
                title,
                cameraAngleMode,
                recipeStyleMode,
                referenceImageUrl,
                linkData
              )
            };
          })()
        ]
      : prompts
          .map((p, idx) => ({
            name: p.name?.trim() || (idx === 0 ? "photo_prompt" : "text_overlay_prompt"),
            prompt: (p.prompt || p.openai_prompt || "").trim()
          }))
          .filter((p) => p.prompt)
          .map((p) => {
            const openAIPrompt = enforceVisualProfile(
              p.prompt,
              p.name,
              type,
              ratioText,
              recipeImageFocus,
              title,
              cameraAngleMode,
              recipeStyleMode,
              referenceImageUrl,
              linkData
            );
            return {
              name: p.name,
              prompt: openAIPrompt,
              openai_prompt: openAIPrompt,
              nanobanana_v2_prompt: buildNanobananaPrompt(
                openAIPrompt,
                p.name,
                type,
                recipeImageFocus,
                title,
                cameraAngleMode,
                recipeStyleMode,
                referenceImageUrl,
                linkData
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

function pickPrimaryPrompt(generated: GeneratedShape): { name: string; text: string } | null {
  const prompts = Array.isArray(generated.image_prompts) ? generated.image_prompts : [];
  if (!prompts.length) return null;

  const preferred =
    prompts.find((p) => (p.name || "").toLowerCase().includes("ingredient_strip")) ||
    prompts.find((p) => (p.name || "").toLowerCase().includes("text_overlay")) ||
    prompts[0];

  const text = preferred.openai_prompt || preferred.prompt || "";
  if (!text.trim()) return null;
  return { name: preferred.name || "image_prompt", text: text.trim() };
}

function imageSizeCandidates(ratio: AspectRatio): string[] {
  if (ratio === "2:3") return ["1024x1536", "1024x1024"];
  return ["1024x1536", "1024x1024"];
}

async function parseOpenAIImageResponse(res: Response): Promise<{ dataUrl?: string; remoteUrl?: string; error?: string }> {
  const text = await res.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return { error: `OpenAI image API returned non-JSON response: ${text.slice(0, 300)}` };
  }

  if (!res.ok) {
    return { error: `OpenAI image error (${res.status}): ${JSON.stringify(payload)}` };
  }

  const data = (payload as { data?: Array<{ b64_json?: string; url?: string }> }).data;
  const first = data?.[0];
  if (!first) return { error: "OpenAI image API returned empty data" };

  if (first.b64_json) {
    return { dataUrl: `data:image/png;base64,${first.b64_json}` };
  }
  if (first.url) {
    return { remoteUrl: first.url };
  }
  return { error: "OpenAI image API returned no b64_json or url" };
}

async function generateOpenAIImage(params: {
  apiKey: string;
  type: InputType;
  recipeStyleMode?: RecipeStyleMode;
  ratio: AspectRatio;
  promptName: string;
  promptText: string;
  featuredImageUrl?: string;
}): Promise<GeneratedImage> {
  const model = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1";
  const sizes = imageSizeCandidates(params.ratio);
  const useReference =
    params.type === "recipe" &&
    params.recipeStyleMode !== "ingredient_strip_recipe" &&
    !!params.featuredImageUrl;

  let referenceBlob: Blob | null = null;
  if (useReference && params.featuredImageUrl) {
    try {
      const refRes = await fetch(params.featuredImageUrl, {
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PromptGeneratorBot/1.0)"
        }
      });
      if (refRes.ok) {
        const contentType = refRes.headers.get("content-type") || "image/jpeg";
        const bytes = await refRes.arrayBuffer();
        referenceBlob = new Blob([bytes], { type: contentType });
      }
    } catch {
      referenceBlob = null;
    }
  }

  let lastError = "Unknown image generation error";
  for (const size of sizes) {
    if (referenceBlob) {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", params.promptText);
      form.append("size", size);
      form.append("image", referenceBlob, "reference-image.jpg");

      const res = await fetch("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.apiKey}`
        },
        body: form
      });

      const parsed = await parseOpenAIImageResponse(res);
      if (!parsed.error) {
        return {
          prompt_name: params.promptName,
          model,
          used_reference_image: true,
          data_url: parsed.dataUrl || null,
          remote_url: parsed.remoteUrl || null,
          error: null
        };
      }
      lastError = parsed.error;
      continue;
    }

    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt: params.promptText,
        size,
        response_format: "b64_json"
      })
    });
    const parsed = await parseOpenAIImageResponse(res);
    if (!parsed.error) {
      return {
        prompt_name: params.promptName,
        model,
        used_reference_image: false,
        data_url: parsed.dataUrl || null,
        remote_url: parsed.remoteUrl || null,
        error: null
      };
    }
    lastError = parsed.error;
  }

  return {
    prompt_name: params.promptName,
    model,
    used_reference_image: !!referenceBlob,
    data_url: null,
    remote_url: null,
    error: lastError
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GeneratePayload;
    const type = normalizeType(body.type);
    const ratio = normalizeAspectRatio(body.aspectRatio);
    const recipeImageFocus = normalizeRecipeImageFocus(body.recipeImageFocus);
    const cameraAngleMode = normalizeCameraAngleMode(body.cameraAngleMode);
    const recipeStyleMode = normalizeRecipeStyleMode(body.recipeStyleMode);
    const generateImage = normalizeGenerateImage(body.generateImage);
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
      recipeImageFocus,
      cameraAngleMode,
      recipeStyleMode
    });

    const generatedRaw = await callOpenAI(STYLE_RULES, userPrompt);
    const generated = coerceGenerated(
      generatedRaw,
      type,
      resolvedTitle,
      ratio,
      recipeImageFocus,
      cameraAngleMode,
      recipeStyleMode,
      type === "recipe" ? linkData?.featuredImageUrl : undefined,
      linkData
    );
    const apiKey = process.env.OPENAI_API_KEY;
    const primaryPrompt = pickPrimaryPrompt(generated);
    let generatedImage: GeneratedImage | null = null;

    if (generateImage && apiKey && primaryPrompt) {
      generatedImage = await generateOpenAIImage({
        apiKey,
        type,
        recipeStyleMode,
        ratio,
        promptName: primaryPrompt.name,
        promptText: primaryPrompt.text,
        featuredImageUrl: type === "recipe" ? linkData?.featuredImageUrl : undefined
      });
    }

    return NextResponse.json(
      {
        input: {
          type,
          title: resolvedTitle,
          link: link || null,
          aspectRatio: ratio,
          recipeImageFocus: type === "recipe" ? recipeImageFocus : null,
          cameraAngleMode: type === "recipe" ? cameraAngleMode : null,
          recipeStyleMode: type === "recipe" ? recipeStyleMode : null,
          generateImage,
          featuredImageUrl: type === "recipe" ? (linkData?.featuredImageUrl || null) : null
        },
        generated,
        generated_image: generatedImage
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
