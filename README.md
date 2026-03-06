# Founder Decision Engine — Deployment Guide

## Structure
```
founder-engine/
├── index.html          ← Full single-page wizard app
├── api/
│   └── generate.js     ← Vercel serverless proxy (protects API key)
├── vercel.json         ← Vercel function config
└── README.md
```

## Deploy to Vercel (5 minutes)

### 1. Push to GitHub
```bash
cd founder-engine
git init
git add .
git commit -m "Initial deploy"
gh repo create founder-decision-engine --public
git push origin main
```

### 2. Deploy on Vercel
- Go to vercel.com → New Project → Import your repo
- Framework: **Other** (no framework, plain HTML)
- Click Deploy

### 3. Add your API key
In Vercel dashboard → Settings → Environment Variables:
```
ANTHROPIC_API_KEY = sk-ant-...
```
Redeploy after adding the key.

### 4. Update model (optional)
In `api/generate.js`, the model is set to `claude-opus-4-5`.
Change to `claude-sonnet-4-6` for faster/cheaper generation.

## Local development
```bash
npm i -g vercel
vercel dev
```
Then open http://localhost:3000

## Notes
- Sessions are in-memory only (no database needed for MVP)
- Financial model is fully deterministic — no LLM involved in calculations
- Contradiction detection runs locally in the browser before the API call
- CSV export works without any server
