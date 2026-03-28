# DocMind AI — RAG Application

> **Full-stack Retrieval-Augmented Generation app** built with FastAPI, LangChain, ChromaDB, Google Gemini, and React.
> Deploy for free on Render. Put the live URL on your resume.

---

## 🗂️ Project Structure

```
rag-app/
├── backend/
│   ├── main.py            ← FastAPI app (RAG pipeline + chatbot)
│   ├── requirements.txt   ← Python dependencies
│   ├── render.yaml        ← Render deployment config
│   └── .env               ← Local env vars (DO NOT commit to GitHub)
│
└── frontend/
    ├── public/
    │   └── index.html
    ├── src/
    │   ├── App.js          ← Root component + sidebar navigation
    │   ├── App.css
    │   ├── index.js
    │   ├── index.css       ← Design system + CSS variables
    │   └── components/
    │       ├── RagTab.js   ← Document upload + Q&A
    │       ├── RagTab.css
    │       ├── ChatTab.js  ← General AI chatbot
    │       └── ChatTab.css
    ├── package.json
    └── .env                ← REACT_APP_API_URL (set after deploying backend)
```

---

## 🚀 Local Development

### 1. Backend

```bash
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy .env (already has your API key)
# (The .env file is already set up — just run the server)

# Start the backend
uvicorn main:app --reload --port 8000
```

Backend will be available at: **http://localhost:8000**

Test it: open http://localhost:8000/docs for the interactive Swagger API docs.

---

### 2. Frontend

```bash
cd frontend

# Install dependencies
npm install

# The .env file already points to http://localhost:8000 for local dev
# Start the dev server
npm start
```

Frontend will be available at: **http://localhost:3000**

---

## ☁️ Deployment on Render (Step-by-Step)

> Render's free tier is perfect. No credit card needed. You'll get a public URL like:
> `https://docmind-backend.onrender.com`

### Step 1 — Push to GitHub

1. Create a free GitHub account at https://github.com if you don't have one.
2. Create a **new repository** (e.g., `docmind-ai`). Make it **Public**.
3. Push your code:

```bash
cd rag-app
git init
git add .
git commit -m "Initial commit — DocMind AI RAG app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/docmind-ai.git
git push -u origin main
```

⚠️ **Before pushing**, make sure `.env` is in `.gitignore`. Add this to a file called `.gitignore` in the `backend/` folder:
```
.env
__pycache__/
*.pyc
venv/
```

---

### Step 2 — Deploy Backend on Render

1. Go to **https://render.com** and sign up (free).
2. Click **"New +"** → **"Web Service"**.
3. Connect your GitHub account and select your repository.
4. Configure the service:

| Setting | Value |
|---|---|
| **Name** | `docmind-backend` |
| **Root Directory** | `backend` |
| **Runtime** | `Python 3` |
| **Build Command** | `pip install -r requirements.txt` |
| **Start Command** | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| **Instance Type** | `Free` |

5. Scroll down to **Environment Variables**. Click **"Add Environment Variable"**:
   - Key: `GOOGLE_API_KEY`
   - Value: `AIzaSyBCVrmKCf2tTe6cs9UaYxFzbZbjTQCs3xI`

6. Click **"Create Web Service"**.

⏳ Wait 3–5 minutes for the first deploy. You'll see logs streaming.

7. When it says **"Live"**, copy your URL: e.g. `https://docmind-backend.onrender.com`

Test it: visit `https://docmind-backend.onrender.com/` — you should see:
```json
{"status": "RAG API is running 🚀"}
```

---

### Step 3 — Deploy Frontend on Render

1. Click **"New +"** → **"Static Site"**.
2. Select the same GitHub repository.
3. Configure:

| Setting | Value |
|---|---|
| **Name** | `docmind-frontend` |
| **Root Directory** | `frontend` |
| **Build Command** | `npm install && npm run build` |
| **Publish Directory** | `build` |

4. Add **Environment Variable**:
   - Key: `REACT_APP_API_URL`
   - Value: `https://docmind-backend.onrender.com` ← (your backend URL from Step 2)

5. Click **"Create Static Site"**.

⏳ Wait 2–3 minutes for the build to finish.

6. Your frontend URL will look like: `https://docmind-frontend.onrender.com`

---

### Step 4 — Test the Live App

1. Open your frontend URL in a browser.
2. Upload a PDF or DOCX file.
3. Ask a question about it — you should get an AI-powered answer with source citations.
4. Switch to the **AI Chatbot** tab and ask a general question.

✅ Your app is live and public!

---

## 📎 Adding to Your Resume

In your resume, add a line like:

```
DocMind AI — Live RAG Application
https://docmind-frontend.onrender.com
Stack: Python · FastAPI · LangChain · ChromaDB · Google Gemini · React
```

Or in a Projects section:

```
DocMind AI                                               [Live Demo ↗]
Full-stack Retrieval-Augmented Generation (RAG) application.
• Accepts PDF / DOCX / TXT uploads; chunks, embeds, and stores in ChromaDB
• Answers questions grounded in document content with source citations
• Built-in general-purpose AI chatbot (Gemini 2.5 Flash)
Tech: FastAPI · LangChain · ChromaDB · Google Gemini · React · Render
```

---

## ⚠️ Free Tier Notes

- **Render free tier spins down** after 15 minutes of inactivity. The first request after spin-down takes ~30 seconds. This is normal.
- **Session data is in-memory** — uploading a document and refreshing the page will lose the document (by design — no storage costs).
- **Render free tier** gives you 750 hours/month — more than enough for a portfolio project.

---

## 🛠️ Tech Decisions

| Choice | Why |
|---|---|
| **ChromaDB in-memory** | No cost, no setup. Perfect for demos. |
| **Session-based memory** | Avoids database costs entirely. |
| **Gemini 2.5 Flash** | Free tier, fast, high quality. |
| **LangChain** | Industry-standard RAG framework — great for resume. |
| **FastAPI** | Modern, fast Python API framework — better than Flask for AI apps. |
| **React** | Recruiters expect it. Clean SPA feel. |
| **Render** | Simplest free deployment, no Docker needed. |
