"use client";

import { FormEvent, useMemo, useState } from "react";

type PostType = "recipe" | "article";
type AspectRatio = "2:3" | "4:5";
type RecipeImageFocus = "step_or_ingredient" | "final_dish";

type ApiSuccess = {
  input: {
    type: PostType;
    title: string;
    link: string | null;
    aspectRatio?: AspectRatio;
    recipeImageFocus?: RecipeImageFocus | null;
  };
  generated: {
    resolved_type?: string;
    resolved_title?: string;
    hook_options?: string[];
    image_prompts?: Array<{ name: string; prompt: string }>;
    caption_options?: string[];
    merged_caption_options?: string[];
    caption_only_options?: string[];
    notes?: string;
  };
};

export default function HomePage() {
  const [type, setType] = useState<PostType>("recipe");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("2:3");
  const [recipeImageFocus, setRecipeImageFocus] = useState<RecipeImageFocus>("step_or_ingredient");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ApiSuccess | null>(null);
  const [copiedKey, setCopiedKey] = useState("");

  const canSubmit = useMemo(() => title.trim().length > 0 || link.trim().length > 0, [title, link]);

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
        body: JSON.stringify({ type, title, link, aspectRatio, recipeImageFocus })
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
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}>
              <option value="2:3">2:3 (1080x1620)</option>
              <option value="4:5">4:5 (1080x1350)</option>
            </select>
          </label>

          {type === "recipe" ? (
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
              Image Prompts ({result.input.aspectRatio || "2:3"}
              {result.input.recipeImageFocus ? `, ${result.input.recipeImageFocus}` : ""})
            </h2>
            {(result.generated.image_prompts || []).map((p, idx) => (
              <div key={idx} className="block">
                <div className="row-head">
                  <h3>{p.name}</h3>
                  <button
                    className="copy-btn"
                    type="button"
                    onClick={() => copyText(`prompt-${idx}`, p.prompt)}
                    title="Copy prompt"
                    aria-label={`Copy ${p.name}`}
                  >
                    {copiedKey === `prompt-${idx}` ? "Copied" : "📋 Copy"}
                  </button>
                </div>
                <pre className="copy-text">{p.prompt}</pre>
              </div>
            ))}
          </article>

          <article className="panel span-2">
            <h2>Caption Options</h2>
            {(result.generated.merged_caption_options || result.generated.caption_options || []).length > 0 ? (
              <p className="subhead">Ready to Post (Merged)</p>
            ) : null}
            {(result.generated.merged_caption_options || result.generated.caption_options || []).map((m, idx) => (
              <div key={`merged-${idx}`} className="copy-item">
                <div className="copy-label">Merged {idx + 1}</div>
                <button
                  className="copy-btn"
                  type="button"
                  onClick={() => copyText(`merged-${idx}`, m)}
                  title="Copy merged caption"
                  aria-label={`Copy merged caption ${idx + 1}`}
                >
                  {copiedKey === `merged-${idx}` ? "Copied" : "📋 Copy"}
                </button>
                <pre className="copy-text">{m}</pre>
              </div>
            ))}

            {(result.generated.caption_only_options || []).length > 0 ? (
              <p className="subhead">Caption Only (Short)</p>
            ) : null}
            {(result.generated.caption_only_options || []).map((c, idx) => (
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
