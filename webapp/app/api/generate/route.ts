import { NextRequest, NextResponse } from "next/server";
import { STYLE_RULES } from "@/lib/styleRules";

type InputType = "recipe" | "article";
type AspectRatio = "2:3" | "4:5";
type RecipeImageFocus = "step_or_ingredient" | "final_dish";
type CameraAngleMode = "regular_40_55" | "above";
type RecipeStyleMode = "action_prep";

type GeneratePayload = {
  type?: InputType;
  title?: string;
  link?: string;
  aspectRatio?: AspectRatio;
  recipeImageFocus?: RecipeImageFocus;
  cameraAngleMode?: CameraAngleMode;
  recipeStyleMode?: RecipeStyleMode;
};

type LinkExtract = {
  title: string;
  description: string;
  bodySnippet: string;
  featuredImageUrl?: string;
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

function normalizeCameraAngleMode(value?: string): CameraAngleMode {
  return value === "above" ? "above" : "regular_40_55";
}

function normalizeRecipeStyleMode(value?: string): RecipeStyleMode {
  return "action_prep";
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
  const rawFeatured =
    extractMeta(html, "og:image") ||
    extractMeta(html, "twitter:image") ||
    extractMeta(html, "twitter:image:src");
  const featuredImageUrl = rawFeatured ? toAbsoluteUrl(rawFeatured, url) : undefined;
  return { title, description, bodySnippet, featuredImageUrl };
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
  const sourcePreview = input.linkData
    ? {
        title: input.linkData.title,
        description: input.linkData.description,
        bodySnippet: input.linkData.bodySnippet
      }
    : null;
  return JSON.stringify(
    {
      task: "Generate image prompts and captions for a single post.",
      input_type: input.type,
      title: input.title,
      source_link: input.link || "",
      source_preview: sourcePreview,
      aspect_ratio: input.aspectRatio,
      aspect_format: aspectLabel(input.aspectRatio),
      recipe_image_focus: input.recipeImageFocus,
      camera_angle_mode: input.cameraAngleMode,
      recipe_style_mode: input.recipeStyleMode,
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
        style_mode: input.recipeStyleMode,
        framing: "close or medium-close composition, tight crop so food fills most of frame",
        camera_angle:
          input.cameraAngleMode === "above"
            ? "above shot, top-down smartphone angle from above the food"
            : "regular casual smartphone angle around 40-55 degrees above food with slight handheld feel",
        cooking_moment: "always in-progress action, never finished plated dish",
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
  if (/\b(coleslaw|slaw|salad)\b/.test(t)) return "coleslaw_salad";
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
  if (category === "casserole") return "a serving spoon, folded napkin, and extra casserole dish";
  if (category === "soup") return "a bread basket and butter knife";
  if (category === "dessert") return "a frosting bowl, whisk, and sliced dessert";
  if (category === "skillet") return "a skillet handle, herbs, and a wooden spoon";
  if (category === "slow_cooker") return "a warm pot in the back with serving spoon";
  if (category === "bread") return "a flour jar, butter dish, and linen cloth";
  if (category === "pasta") return "parmesan, herbs, and sauce jar softly blurred";
  return "subtle kitchen props and related side ingredients";
}

function ingredientStripIngredients(category: RecipeCategory): string[] {
  if (category === "coleslaw_salad") {
    return ["shredded cabbage", "julienned carrot", "onion", "mayo", "vinegar", "salt & pepper"];
  }
  if (category === "casserole") {
    return ["chicken", "cream sauce", "cheese", "onion", "garlic", "seasoning"];
  }
  if (category === "soup") {
    return ["broth", "protein", "onion", "celery", "carrot", "herbs"];
  }
  if (category === "dessert") {
    return ["flour", "sugar", "butter", "eggs", "vanilla", "milk"];
  }
  if (category === "skillet") {
    return ["protein", "onion", "garlic", "oil", "vegetables", "seasoning"];
  }
  if (category === "slow_cooker") {
    return ["protein", "sauce base", "onion", "garlic", "seasoning", "creamy add-in"];
  }
  if (category === "bread") {
    return ["flour", "yeast", "butter", "milk", "sugar", "salt"];
  }
  if (category === "pasta") {
    return ["pasta", "sauce", "protein", "onion", "cheese", "herbs"];
  }
  return ["main ingredient", "oil or butter", "onion", "garlic", "seasoning", "herbs"];
}

function buildIngredientStripRecipePrompt(title: string, ratioText: string): string {
  const category = inferRecipeCategory(title);
  const vessel = ingredientStripVessel(category);
  const bg = ingredientStripBackground(category);
  const ingredients = ingredientStripIngredients(category).slice(0, 6);
  return normalizePromptText(
    `Photorealistic viral recipe image in ${ratioText}. Clean two-section layout optimized for Facebook and Pinterest mobile feeds. Top section: centered title "${title}" in bold simple sans-serif black text, no ribbon, no badge, no decorative banner. Directly below title, a horizontal ingredient strip on clean white background showing isolated ingredients evenly spaced with small labels under each: ${ingredients.join(", ")}. Labels must be short and mobile-readable. Bottom 60-70% section: tight medium-close hero shot of the finished dish in ${vessel}, camera slightly above at 30-45 degrees (not overhead), food filling most of frame. Dish should look glossy, rich, textured, appetizing, realistic homemade cooking with visible sauce shine, vegetables, herbs or scallions, and natural texture variation. Bright natural kitchen light with soft highlights and gentle depth of field. Subtle contextual background props (${bg}) softly blurred, clean and not cluttered. Strong vibrant food color contrast, scroll-stopping but realistic. No infographic bullet lists, no checkmark list, no decorative ribbons, no step instructions, no logos, no watermarks, no cluttered background, no pure overhead flat lay, no studio look.`
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
  cameraAngleMode: CameraAngleMode
): string {
  const name = (promptName || "").toLowerCase();
  let cleaned = withAspect(prompt, ratioText)
    .replace(/\bno text overlay\b\.?/gi, "")
    .replace(/\bhigh contrast white text on dark translucent box\b/gi, "")
    .replace(/\bdark translucent box\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
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
  const parts: string[] = [cleaned];

  if (type === "recipe") {
    parts.push("Style profile: realistic viral home-cooking smartphone shot focused on in-progress prep action.");
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
  cameraAngleMode: CameraAngleMode
): string {
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

  if (type === "recipe") {
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
  cameraAngleMode: CameraAngleMode
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
      const openAIPrompt = enforceVisualProfile(
        p.prompt,
        p.name,
        type,
        ratioText,
        recipeImageFocus,
        title,
        cameraAngleMode
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
          cameraAngleMode
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
    const cameraAngleMode = normalizeCameraAngleMode(body.cameraAngleMode);
    const recipeStyleMode = normalizeRecipeStyleMode(body.recipeStyleMode);
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
      cameraAngleMode
    );

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
          featuredImageUrl: type === "recipe" ? (linkData?.featuredImageUrl || null) : null
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
