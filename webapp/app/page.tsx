"use client";

import { FormEvent, useMemo, useState } from "react";

type PostType = "recipe" | "article";
type AspectRatio = "2:3" | "4:5";
type RecipeImageFocus = "step_or_ingredient" | "final_dish";
type CameraAngleMode = "regular_40_55" | "above";
type RecipeStyleMode = "action_prep" | "ingredient_strip_recipe";

type ApiSuccess = {
  input: {
    type: PostType;
    title: string;
    link: string | null;
    aspectRatio?: AspectRatio;
    recipeImageFocus?: RecipeImageFocus | null;
    cameraAngleMode?: CameraAngleMode | null;
    recipeStyleMode?: RecipeStyleMode | null;
    featuredImageUrl?: string | null;
  };
  generated: {
    resolved_type?: string;
    resolved_title?: string;
    hook_options?: string[];
    image_prompts?: Array<{
      name: string;
      prompt?: string;
      openai_prompt?: string;
      nanobanana_v2_prompt?: string;
    }>;
    caption_options?: string[];
    merged_caption_options?: string[];
    caption_only_options?: string[];
    notes?: string;
  };
};

export default function HomePage() {
  const MAX_MERGED_OPTIONS = 5;
  const MAX_CAPTION_ONLY_OPTIONS = 0;

  const [type, setType] = useState<PostType>("recipe");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("4:5");
  const [recipeImageFocus, setRecipeImageFocus] = useState<RecipeImageFocus>("step_or_ingredient");
  const [cameraAngleMode, setCameraAngleMode] = useState<CameraAngleMode>("regular_40_55");
  const [recipeStyleMode, setRecipeStyleMode] = useState<RecipeStyleMode>("action_prep");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ApiSuccess | null>(null);
  const [copiedKey, setCopiedKey] = useState("");

  const canSubmit = useMemo(() => title.trim().length > 0 || link.trim().length > 0, [title, link]);
  const mergedCaptionOptions = (
    result?.generated.merged_caption_options ||
    result?.generated.caption_options ||
    []
  ).slice(0, MAX_MERGED_OPTIONS);
  const captionOnlyOptions = (result?.generated.caption_only_options || []).slice(0, MAX_CAPTION_ONLY_OPTIONS);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title,
          link,
          aspectRatio,
          recipeImageFocus,
          cameraAngleMode,
          recipeStyleMode
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate");
        return;
      }
      setResult(data as ApiSuccess);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(""), 1200);
    } catch {
      setCopiedKey("");
    }
  }

  function cameraAngleLabel(mode?: CameraAngleMode | null) {
    return mode === "above" ? "Above shot" : "Regular shot 40°-55°";
  }

  function recipeStyleLabel(mode?: RecipeStyleMode | null) {
    return mode === "ingredient_strip_recipe" ? "Ingredient strip recipe" : "Action / prep shot";
  }

  return (
    <main className="page">
      <section className="hero">
        <h1>Food Prompt Generator</h1>
        <p>Enter a recipe/article title or link, then get image prompts + captions in your style.</p>
      </section>

      <section className="panel">
        <form onSubmit={onSubmit} className="form">
          <label>
            Post Type
            <select value={type} onChange={(e) => setType(e.target.value as PostType)}>
              <option value="recipe">Recipe</option>
              <option value="article">Article</option>
            </select>
          </label>

          <label>
            Aspect Ratio
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              disabled={type === "recipe" && recipeStyleMode === "ingredient_strip_recipe"}
            >
              <option value="2:3">2:3 (1080x1620)</option>
              <option value="4:5">4:5 (1080x1350)</option>
            </select>
          </label>

          {type === "recipe" ? (
            <label>
              Recipe Image Style
              <select
                value={recipeStyleMode}
                onChange={(e) => {
                  const next = e.target.value as RecipeStyleMode;
                  setRecipeStyleMode(next);
                  if (next === "ingredient_strip_recipe") {
                    setAspectRatio("4:5");
                    setCameraAngleMode("regular_40_55");
                  }
                }}
              >
                <option value="action_prep">Action / Prep Shot</option>
                <option value="ingredient_strip_recipe">Ingredient Strip Recipe</option>
              </select>
            </label>
          ) : null}

          {type === "recipe" && recipeStyleMode === "action_prep" ? (
            <label>
              Recipe Image Focus
              <select
                value={recipeImageFocus}
                onChange={(e) => setRecipeImageFocus(e.target.value as RecipeImageFocus)}
              >
                <option value="step_or_ingredient">Step / Ingredient (Recommended)</option>
                <option value="final_dish">Final Dish</option>
              </select>
            </label>
          ) : null}

          {type === "recipe" && recipeStyleMode === "ingredient_strip_recipe" ? (
            <p className="subhead">
              Ingredient strip mode uses a clean two-section layout with title + ingredient strip above the hero dish.
            </p>
          ) : null}

          {type === "recipe" && recipeStyleMode === "action_prep" ? (
            <fieldset className="camera-angle-fieldset">
              <legend>Camera Angle</legend>
              <div className="camera-angle-options">
                <button
                  type="button"
                  className={`camera-angle-option ${cameraAngleMode === "regular_40_55" ? "active" : ""}`}
                  onClick={() => setCameraAngleMode("regular_40_55")}
                  aria-pressed={cameraAngleMode === "regular_40_55"}
                >
                  <span className="camera-angle-icon" aria-hidden>
                    📷
                  </span>
                  <span className="camera-angle-title">Regular shot 40°-55°</span>
                  <span className="camera-angle-sub">Angled smartphone perspective</span>
                </button>
                <button
                  type="button"
                  className={`camera-angle-option ${cameraAngleMode === "above" ? "active" : ""}`}
                  onClick={() => setCameraAngleMode("above")}
                  aria-pressed={cameraAngleMode === "above"}
                >
                  <span className="camera-angle-icon" aria-hidden>
                    🖼️
                  </span>
                  <span className="camera-angle-title">Above shot</span>
                  <span className="camera-angle-sub">Top-down smartphone perspective</span>
                </button>
              </div>
            </fieldset>
          ) : null}

          <label>
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Slow Cooker Chicken and Cream Cheese"
            />
          </label>

          <label>
            Link (optional)
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://..." />
          </label>

          <button type="submit" disabled={!canSubmit || loading}>
            {loading ? "Generating..." : "Generate"}
          </button>
        </form>
      </section>

      {error ? (
        <section className="panel error">
          <p>{error}</p>
        </section>
      ) : null}

      {result ? (
        <section className="result-grid">
          <article className="panel span-2">
            <h2>
              Image Prompts ({result.input.aspectRatio || "4:5"}
              {result.input.recipeStyleMode ? `, ${recipeStyleLabel(result.input.recipeStyleMode)}` : ""}
              {result.input.recipeStyleMode !== "ingredient_strip_recipe" && result.input.recipeImageFocus
                ? `, ${result.input.recipeImageFocus}`
                : ""}
              {result.input.recipeStyleMode !== "ingredient_strip_recipe" && result.input.cameraAngleMode
                ? `, ${cameraAngleLabel(result.input.cameraAngleMode)}`
                : ""})
            </h2>
            {result.input.type === "recipe" && result.input.featuredImageUrl ? (
              <div className="copy-item">
                <div className="copy-label">Featured Image Reference (from link)</div>
                <button
                  className="copy-btn"
                  type="button"
                  onClick={() => copyText("featured-image-url", result.input.featuredImageUrl || "")}
                  title="Copy featured image URL"
                  aria-label="Copy featured image URL"
                >
                  {copiedKey === "featured-image-url" ? "Copied" : "📋 Copy"}
                </button>
                <pre className="copy-text">{result.input.featuredImageUrl}</pre>
                <div className="featured-image-preview">
                  <img src={result.input.featuredImageUrl} alt="Featured reference" loading="lazy" />
                </div>
              </div>
            ) : null}
            {(result.generated.image_prompts || []).map((p, idx) => (
              <div key={idx} className="block">
                <h3>{p.name}</h3>
                <div className="prompt-columns">
                  <div className="copy-item">
                    <div className="copy-label">OpenAI Prompt</div>
                    <button
                      className="copy-btn"
                      type="button"
                      onClick={() => copyText(`prompt-openai-${idx}`, p.openai_prompt || p.prompt || "")}
                      title="Copy OpenAI prompt"
                      aria-label={`Copy OpenAI prompt for ${p.name}`}
                    >
                      {copiedKey === `prompt-openai-${idx}` ? "Copied" : "📋 Copy"}
                    </button>
                    <pre className="copy-text">{p.openai_prompt || p.prompt || ""}</pre>
                  </div>
                  <div className="copy-item">
                    <div className="copy-label">Nanobanana v2 Prompt</div>
                    <button
                      className="copy-btn"
                      type="button"
                      onClick={() =>
                        copyText(
                          `prompt-nanobanana-${idx}`,
                          p.nanobanana_v2_prompt || p.openai_prompt || p.prompt || ""
                        )
                      }
                      title="Copy Nanobanana v2 prompt"
                      aria-label={`Copy Nanobanana v2 prompt for ${p.name}`}
                    >
                      {copiedKey === `prompt-nanobanana-${idx}` ? "Copied" : "📋 Copy"}
                    </button>
                    <pre className="copy-text">
                      {p.nanobanana_v2_prompt || p.openai_prompt || p.prompt || ""}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </article>

          <article className="panel span-2">
            <h2>Caption Options</h2>
            {mergedCaptionOptions.length > 0 ? (
              <p className="subhead">Top Caption Results (Max 5)</p>
            ) : null}
            {mergedCaptionOptions.map((m, idx) => (
              <div key={`merged-${idx}`} className="copy-item">
                <div className="copy-label">{`Caption ${idx + 1}`}</div>
                <button
                  className="copy-btn"
                  type="button"
                  onClick={() => copyText(`merged-${idx}`, m)}
                  title="Copy caption"
                  aria-label={`Copy caption ${idx + 1}`}
                >
                  {copiedKey === `merged-${idx}` ? "Copied" : "📋 Copy"}
                </button>
                <pre className="copy-text">{m}</pre>
              </div>
            ))}

            {captionOnlyOptions.map((c, idx) => (
              <div key={`caption-only-${idx}`} className="copy-item">
                <div className="copy-label">Caption-only {idx + 1}</div>
                <button
                  className="copy-btn"
                  type="button"
                  onClick={() => copyText(`caption-only-${idx}`, c)}
                  title="Copy caption-only"
                  aria-label={`Copy caption-only ${idx + 1}`}
                >
                  {copiedKey === `caption-only-${idx}` ? "Copied" : "📋 Copy"}
                </button>
                <pre className="copy-text">{c}</pre>
              </div>
            ))}
          </article>
        </section>
      ) : null}
    </main>
  );
}
