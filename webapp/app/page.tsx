"use client";

import { FormEvent, useMemo, useState } from "react";

type PostType = "recipe" | "article";
type AspectRatio = "2:3" | "4:5";

type ApiSuccess = {
  input: {
    type: PostType;
    title: string;
    link: string | null;
    aspectRatio?: AspectRatio;
  };
  generated: {
    resolved_type?: string;
    resolved_title?: string;
    hook_options?: string[];
    image_prompts?: Array<{ name: string; prompt: string }>;
    caption_options?: string[];
    notes?: string;
  };
};

export default function HomePage() {
  const [type, setType] = useState<PostType>("recipe");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("2:3");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ApiSuccess | null>(null);

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
        body: JSON.stringify({ type, title, link, aspectRatio })
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
          <article className="panel">
            <h2>Resolved Input</h2>
            <p>
              <strong>Type:</strong> {result.input.type}
            </p>
            <p>
              <strong>Title:</strong> {result.input.title}
            </p>
            <p>
              <strong>Aspect:</strong> {result.input.aspectRatio || "2:3"}
            </p>
          </article>

          <article className="panel">
            <h2>Hook Options</h2>
            <ul>
              {(result.generated.hook_options || []).map((h, idx) => (
                <li key={idx}>{h}</li>
              ))}
            </ul>
          </article>

          <article className="panel span-2">
            <h2>Image Prompts</h2>
            {(result.generated.image_prompts || []).map((p, idx) => (
              <div key={idx} className="block">
                <h3>{p.name}</h3>
                <pre>{p.prompt}</pre>
              </div>
            ))}
          </article>

          <article className="panel span-2">
            <h2>Caption Options</h2>
            <ul>
              {(result.generated.caption_options || []).map((c, idx) => (
                <li key={idx}>{c}</li>
              ))}
            </ul>
          </article>

          {result.generated.notes ? (
            <article className="panel span-2">
              <h2>Notes</h2>
              <p>{result.generated.notes}</p>
            </article>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
