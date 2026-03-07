# Food Prompt Generator (Vercel Ready)

Web app that generates:
- image prompts (`photo_prompt` + `text_overlay_prompt`)
- 3 hook options
- 3 caption options with recipe/article CTA style
- selectable aspect ratio per request (`2:3` or `4:5`)
- recipe image focus control (`step_or_ingredient` or `final_dish`)

## 1) Run Locally

```bash
cd /Users/OThmane/Documents/New\ project/webapp
npm install
cp .env.example .env.local
```

Set your `.env.local`:

```bash
OPENAI_API_KEY=YOUR_KEY
OPENAI_MODEL=gpt-4.1-mini
```

Then run:

```bash
npm run dev
```

## 2) Push To GitHub

```bash
cd /Users/OThmane/Documents/New\ project
git add webapp
git commit -m "Add Vercel-ready prompt generator web app"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

## 3) Deploy On Vercel

1. Import your GitHub repo in Vercel.
2. Root directory: `webapp`
3. Framework preset: Next.js
4. Add env vars in Vercel Project Settings:
   - `OPENAI_API_KEY`
   - `OPENAI_MODEL` (optional)
5. Deploy.

## API Endpoint

- `POST /api/generate`

Payload:

```json
{
  "type": "recipe",
  "title": "Slow Cooker Chicken and Cream Cheese",
  "link": "https://example.com/optional"
}
```

## Notes

- If `link` is provided, the API tries to extract title/description from the page.
- If extraction fails, it still works using the title input.
- Keep your OpenAI key only in environment variables, never in code.
