# app/main.py
from fastapi import FastAPI, Request, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from pymongo import MongoClient
from datetime import datetime
from openai import OpenAI
import os
import json
import shutil
import uuid
import re
import requests
import boto3
import tempfile
from fpdf import FPDF
from docx import Document
from serpapi import GoogleSearch

# Custom services
from app.services.file_extractors import extract_text_from_file
from app.services.audio_processors import transcribe_audio, ALLOWED_AUDIO_FORMATS, transcribe_audio_from_path
from app.services.image_processors import extract_text_from_image
from app.services.video_processors import extract_text_from_video

# --------------------------------------------------
# Load environment variables
# --------------------------------------------------
load_dotenv()

# Google OAuth router
from app.auth.google import router as google_auth_router

# Load and normalize environment variables (strip surrounding whitespace)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
if OPENAI_API_KEY:
    OPENAI_API_KEY = OPENAI_API_KEY.strip()
MONGO_URI = os.getenv("MONGO_URI", "")
if MONGO_URI:
    MONGO_URI = MONGO_URI.strip()
SERP_API_KEY = os.getenv("SERP_API_KEY", "")
if SERP_API_KEY:
    SERP_API_KEY = SERP_API_KEY.strip()
# Optional OpenWeather key for climate data
OPENWEATHER_API_KEY = os.getenv("OPENWEATHER_API_KEY", "")
if OPENWEATHER_API_KEY:
    OPENWEATHER_API_KEY = OPENWEATHER_API_KEY.strip()

# AWS Config
AWS_ACCESS_KEY = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")
AWS_REGION = os.getenv("AWS_REGION")
AWS_BUCKET = os.getenv("AWS_BUCKET_NAME")

s3 = boto3.client(
    "s3",
    aws_access_key_id=AWS_ACCESS_KEY,
    aws_secret_access_key=AWS_SECRET_KEY,
    region_name=AWS_REGION
)

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not found in .env")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not found in .env")

# Initialize OpenAI client
openai_client = OpenAI(api_key=OPENAI_API_KEY)

# --------------------------------------------------
# MongoDB setup
# --------------------------------------------------
client = MongoClient(MONGO_URI)
db = client["uchat"]
chats_collection = db["chats"]
tracking_collection = db["tracking"]
files_collection = db["files"]
users_collection = db["users"]

# --------------------------------------------------
# Supported formats
# --------------------------------------------------
ALLOWED_IMAGE_FORMATS = ["jpg", "jpeg", "png", "bmp", "tiff", "webp"]
ALLOWED_VIDEO_FORMATS = ["mp4", "avi", "mov", "mkv", "webm"]

# --------------------------------------------------
# FastAPI app
# --------------------------------------------------
app = FastAPI(title="AI Chatbot Backend")

# SessionMiddleware required for OAuth
app.add_middleware(
    SessionMiddleware,
    secret_key=os.getenv("SESSION_SECRET", "super-secret-key")
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://vee-gpt.com", "https://www.vee-gpt.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Google OAuth router
app.include_router(google_auth_router, prefix="/auth/google", tags=["Google Auth"])

# --------------------------------------------------
# Models
# --------------------------------------------------
class ChatRequest(BaseModel):
    messages: list
    email: str | None = None
    session_id: str | None = None
    model: str | None = "gpt-4o-mini"

class ChatUpdate(BaseModel):
    title: str | None = None
    is_pinned: bool | None = None
    is_archived: bool | None = None

# --------------------------------------------------
# Helpers
# --------------------------------------------------
def parse_user_agent(ua: str):
    ua = ua.lower()
    device = "Desktop"
    os_name = "Unknown"
    browser = "Unknown"

    if "windows" in ua:
        os_name = "Windows"
    elif "mac" in ua:
        os_name = "Mac"
    elif "android" in ua:
        os_name, device = "Android", "Mobile"
    elif "iphone" in ua:
        os_name, device = "iOS", "Mobile"

    if "chrome" in ua:
        browser = "Chrome"
    elif "firefox" in ua:
        browser = "Firefox"
    elif "safari" in ua:
        browser = "Safari"

    return browser, os_name, device

def clean_markdown(text: str) -> str:
    # Simple removal of common markdown symbols
    text = text.replace('*', '').replace('#', '').replace('-', '').replace('_', '').replace('`', '')
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def build_file_prompt(user_message: str, extracted_text: str | None, file_ext: str):
    if extracted_text:
        return f"""
Rewrite and redesign the following content.

STRICT RULES:
- Output ONLY clean plain text
- NO markdown
- NO explanations
- NO bullet symbols
- Professionally formatted
- Suitable for {file_ext.upper()} file

USER REQUEST:
{user_message}

CONTENT:
{extracted_text}
"""
    return f"""
Create content based on the request.

STRICT RULES:
- Output ONLY clean plain text
- NO markdown
- NO explanations
- Professionally formatted
- Suitable for {file_ext.upper()} file

REQUEST:
{user_message}
"""

# --------------------------------------------------
# Health check
# --------------------------------------------------
@app.get("/hello")
def hello():
    return {"message": "Hello! How can I assist you today?"}


# --------------------------------------------------
# Store user from frontend (post-login)
# --------------------------------------------------
@app.post("/auth/store-user")
async def store_user(request: Request):
    try:
        payload = await request.json()
        email = payload.get("email")
        if not email:
            raise HTTPException(status_code=400, detail="Email missing")

        now = datetime.utcnow()
        user = users_collection.find_one({"email": email})
        if not user:
            users_collection.insert_one({
                "email": email,
                "created_at": now,
                "last_login": now
            })
        else:
            users_collection.update_one({"_id": user["_id"]}, {"$set": {"last_login": now}})

        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------------------------------
# Chat endpoint
# --------------------------------------------------
@app.post("/chat")
async def chat(request: Request, payload: ChatRequest):
    messages = payload.messages
    email = payload.email
    session_id = payload.session_id
    if not messages or not messages[-1].get('content'):
        raise HTTPException(status_code=400, detail="Messages required")

    ip = request.client.host
    ua = request.headers.get("user-agent", "")
    browser, os_name, device = parse_user_agent(ua)
    now = datetime.utcnow()

    # Geo Location Lookup
    geo_info = {}
    try:
        # Skip local loopback for external API calls
        if ip not in ["127.0.0.1", "::1", "localhost"]:
            geo_resp = requests.get(f"http://ip-api.com/json/{ip}", timeout=2)
            if geo_resp.status_code == 200:
                data = geo_resp.json()
                if data.get("status") == "success":
                    geo_info = {
                        "country": data.get("country"),
                        "country_code": data.get("countryCode"),
                        "region": data.get("regionName"),
                        "city": data.get("city"),
                        "zip": data.get("zip"),
                        "isp": data.get("isp")
                    }
    except Exception as e:
        print(f"Geo lookup failed: {e}")

    # Track user
    tracking = tracking_collection.find_one({"ip": ip})
    tracking_data = {
        "ip": ip,
        "browser": browser,
        "os": os_name,
        "device": device,
        "ua": ua,
        "last_active": now,
        **geo_info
    }

    if not tracking:
        tracking_data["first_visit"] = now
        tracking_collection.insert_one(tracking_data)
    else:
        tracking_collection.update_one({"_id": tracking["_id"]}, {"$set": tracking_data})

    # System prompt
    system_prompt = """
You are Gemini Code Assist, a senior full-stack developer and technical mentor.

========================
STRICT IDENTITY & RESPONSE RULES
========================
1. **Identity**: You are Gemini Code Assist. You are NOT developed by OpenAI.
2. **No Negative/Refusal Phrases**: NEVER use phrases like "I am unable to", "I cannot", "As an AI", "I don't have access to", or "I am a text-based model".
3. **Fallback Strategy**: If you cannot answer a query directly or lack specific real-time data, provide the closest RELATED information, theoretical examples, or best-guess estimates based on your knowledge. NEVER refuse to answer.

========================
CODE-RELATED QUESTIONS
========================
For every programming or code-related question, you MUST follow these rules strictly:

1. Explain the solution in simple, beginner-friendly language.
2. Explain how and where to save the code (file name and project type).
3. Explain clearly how to run the program step-by-step.
4. Explain the expected output or behavior with an example.
5. Provide the complete, correct, and working code.
6. End with a clear and concise conclusion summarizing what was learned.
7. Provide practical suggestions for improvement, optimization, or next steps.
8. Provide clear next steps to follow and mention potential future updates or enhancements.
9. Ensure all web development code (HTML, CSS, React, etc.) is fully responsive and mobile-friendly (use Flexbox/Grid and media queries).

IMPORTANT FOR CODE:
- NEVER provide only code unless the user explicitly says "code only".
- Do NOT skip explanations.
- Do NOT assume prior knowledge.
- Separate each main section (Explanation, Code, Execution, Output, Conclusion) with a horizontal rule ("---") and blank lines to ensure clear visual separation.

========================
CONTENT-RELATED QUESTIONS
========================
For every non-code or content-related question (theory, concepts, essays, explanations, topics, etc.), you MUST structure the response as follows:

1. Overview  
   - Briefly introduce the topic in simple and clear language.

2. History / Background  
   - Explain the origin, evolution, or background of the topic (if applicable).

3. Main Content  
   - Explain the core ideas in detail.
   - Use clear headings, bullet points, and examples where helpful.

4. Conclusion  
   - Summarize the key points.
   - Reinforce the main takeaway.

5. Suggestions  
   - Provide practical suggestions, applications, or areas for further learning.

6. Next Steps & Future Updates
   - Outline the immediate next steps to follow.
   - Mention upcoming trends, future updates, or evolutions related to the topic.

IMPORTANT FOR CONTENT:
- Use clear section headings with relevant emojis/icons, bold text, and end with a colon (e.g., "### **🚀 Introduction:**").
- Use bullet points ("-" or ".") for lists to make it readable.
- Add relevant icons to sub-points where appropriate to make it visually engaging.
- Use simple, easy-to-understand language.
- Keep explanations structured and logical.
- Avoid unnecessary complexity unless explicitly requested.
- When providing links (e.g., downloads), format them as [**Link**](URL) or [**Download Link**](URL) to highlight them.
- Separate main sections with a horizontal rule ("---") to improve readability.

========================
STEP-BY-STEP GUIDES
========================
For "how-to" or installation requests (e.g., "how to download VSCode"):
- Break the answer into distinct steps (e.g., **Step 1:**, **Step 2:**).
- Add a horizontal rule ("---") with blank lines before and after it between every step and section to clearly separate them.
- In Step 1, provide the official download link formatted as [**Download Link**](URL).
- Follow with installation and configuration steps.

========================
GENERAL RULES
========================
- Use proper markdown formatting.
- Be direct, clear, and practical.
- Do NOT include generic AI disclaimers.
- Ask clarifying questions ONLY if absolutely necessary.

========================
FILE PROCESSING & GENERATION (STRICT)
========================
When the user provides a file or text and asks to "beautify", "format", "convert to ATS resume", "write a letter", or "refactor code":
1. **TRANSFORM**: Completely rewrite the content in the requested format (e.g., clean ATS structure for resumes, standard business format for letters). Do NOT just copy the input.
2. **ISOLATE**: Wrap the *final processed content* in a Markdown code block (```). Do NOT put conversational text inside this block.
3. **LINK**: Provide a download link: `Download Processed File`.

- Do NOT generate fake download links (e.g., file.io, example.com).
"""


    last_user = messages[-1]['content'].lower()

    # --- Realtime data injection ---
    realtime_info = []

    try:
        # Fuel / Petrol
        if "petrol" in last_user or "fuel" in last_user:
            # attempt to extract location (in <city/state>)
            m = re.search(r"in\s+([a-zA-Z\s]+)", last_user)
            loc = m.group(1).strip() if m else "India"
            fp = fuel_petrol(state=loc, city="")
            if fp.get("answer"):
                realtime_info.append(f"Petrol price for {fp.get('location')}: {fp.get('answer')}")

        # Weather / Climate
        if "weather" in last_user or "climate" in last_user:
            m = re.search(r"in\s+([a-zA-Z\s]+)", last_user)
            city = m.group(1).strip() if m else None
            if city:
                w = weather(city=city)
                # if we've got metric fields from OpenWeather
                if w.get("temp_c") is not None:
                    realtime_info.append(f"Weather in {w.get('city')}: {w.get('temp_c')}°C, {w.get('description')}")
                elif w.get("summary"):
                    realtime_info.append(f"Weather summary for {city}: {w.get('summary')}")

        # News / Sports
        if "news" in last_user or "sports" in last_user:
            cat = "sports" if "sports" in last_user else ""
            q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user)
            n = news(q=q.strip(), category=cat)
            # include top 3 headlines
            headlines = [it.get("title") for it in n.get("results", [])[:3] if it.get("title")]
            if headlines:
                realtime_info.append("Top headlines: " + " | ".join(headlines))
    except Exception as e:
        print("Realtime fetch error:", e)

    if realtime_info:
        system_prompt = system_prompt + "\n\nRealtime data:\n" + "\n".join(realtime_info)

    # --------------------------------------------------
    # GPT + GOOGLE IMAGE SEARCH LOGIC (REWRITTEN)
    # --------------------------------------------------

    image_urls = []

    user_text = messages[-1]["content"]
    lower_text = user_text.lower()

    # STRICT: Only fetch images for explicit image requests
    strict_image_patterns = [
        # Explicit image requests
        r"(?:show|find|get|generate|search|view|display)\s+.*?(?:image|photo|picture|pic|diagram|sketch)",
        r"(?:image|photo|picture|pic|diagram|sketch)\s+of",
        
        # Visual explanation intent (e.g., "explain the brain", "structure of...")
        r"explain\s+",
        r"describe\s+",
        r"show\s+me\s+",
        r"what\s+does\s+.*?\s+look\s+like",
        r"how\s+.*?\s+works?",
        r"structure\s+of",
        r"anatomy\s+of",
        r"diagram\s+of"
    ]
    should_fetch_images = any(re.search(pattern, lower_text) for pattern in strict_image_patterns)

    def extract_image_query(text: str) -> str:
        """
        Clean the user message to create a strong Google Image search query.
        """
        # Use word boundaries to avoid partial matches and remove common stopwords
        pattern = r"\b(show|give|me|some|images|image|photos|pictures|pics|of|about|explain|with|describe|what|is|how|does|generate|view|display|see|to|in|on|the|a|an)\b"
        text = re.sub(
            pattern,
            "",
            text,
            flags=re.IGNORECASE
        )
        return text.strip()

    if should_fetch_images:
        # Guard: Check if SerpAPI key exists
        if not SERP_API_KEY:
            print("SERP_API_KEY missing, skipping image fetch")
        else:
            try:
                search_query = extract_image_query(user_text)

                if not search_query:
                    search_query = user_text.strip()

                search = GoogleSearch({
                    "q": search_query,
                    "tbm": "isch",
                    "api_key": SERP_API_KEY,  # GoogleSearch Python lib uses 'api_key', not 'serp_api_key'
                    "num": 10
                })

                results = search.get_dict()

                if "images_results" in results:
                    # ALWAYS prefer original URLs (thumbnails expire fast & have CORS issues)
                    image_urls = [
                        img.get("original")
                        for img in results.get("images_results", [])
                        if img.get("original")
                    ]
                    # Deduplicate URLs while preserving order
                    image_urls = list(dict.fromkeys(image_urls))[:6]

            except Exception as e:
                print("Google Image fetch error:", e)

    # --------------------------------------------------
    # SYSTEM PROMPT IMAGE AWARENESS
    # --------------------------------------------------

    if image_urls:
        system_prompt += """
========================
IMAGE RESPONSE RULES - CRITICAL
========================
- Images have been fetched from Google using SERP API and are already displayed to the user.
- **NO NEGATIVE WORDS**: You are STRICTLY FORBIDDEN from using words like "can't", "unable", "cannot", "sorry", "apologize".
- NEVER say "I cannot display images".
- IF user asked ONLY to show/get/find images:
  * Output ONLY a brief positive acknowledgment like "Here are the images."
- IF user asked for explanation + images:
  * Provide the explanation directly.
- Images are displayed in a 2-column grid (3 rows, 6 images total).
- Images are interactive: Users can click to view full-screen (lightbox with close button).
"""

    # Add user context for responsive/adaptive responses
    system_prompt += f"\n\nUser Context:\n- Device: {device}\n- OS: {os_name}\n- Browser: {browser}\n"

    # Safe system prompt injection
    if messages and messages[0].get('role') == 'system':
        messages[0]['content'] = system_prompt
    else:
        messages.insert(0, {'role': 'system', 'content': system_prompt})

    # AI streaming response
    response = openai_client.chat.completions.create(
        model=payload.model or "gpt-4o-mini",
        messages=messages,
        temperature=0.7,
        max_tokens=1000,
        stream=True
    )

    def generate():
        # Send images immediately if available (typed event)
        if image_urls:
            yield f"data: {json.dumps({'type': 'images', 'data': image_urls})}\n\n"

        full_reply = ""
        finish_reason = None
        for chunk in response:
            if chunk.choices:
                if chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    full_reply += content
                    # Send text chunks (typed event)
                    yield f"data: {json.dumps({'type': 'chunk', 'data': content})}\n\n"
                if chunk.choices[0].finish_reason:
                    finish_reason = chunk.choices[0].finish_reason

        # Clean the full reply after accumulation
        # full_reply = clean_markdown(full_reply)  # Removed to allow markdown

        # Save chat to DB
        last_user_msg = next((m['content'] for m in reversed(messages) if m['role'] == 'user'), '')
        result = chats_collection.insert_one({
            "session_id": session_id,
            "email": email,
            "timestamp": now,
            "user_message": last_user_msg,
            "ai_reply": full_reply,
            "image_url": image_urls
        })
        # Send final response (typed event with all metadata)
        yield f"data: {json.dumps({'type': 'final', 'data': full_reply, 'images': image_urls, 'message_id': str(result.inserted_id), 'finish_reason': finish_reason})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

# --------------------------------------------------
# Chat History Endpoints
# --------------------------------------------------
@app.get("/chat/history")
def get_chat_history(email: str):
    if not email:
        return []
    
    # Group by session_id to get unique sessions
    pipeline = [
        {"$match": {"email": email, "session_id": {"$ne": None}}},
        {"$sort": {"timestamp": 1}},
        {"$group": {
            "_id": "$session_id",
            "user_message": {"$first": "$user_message"},
            "custom_title": {"$first": "$custom_title"},
            "is_pinned": {"$first": "$is_pinned"},
            "is_archived": {"$first": "$is_archived"},
            "last_active": {"$last": "$timestamp"}
        }},
        {"$sort": {"last_active": -1}}
    ]
    
    history = list(chats_collection.aggregate(pipeline))
    # Format for frontend
    result = []
    for h in history:
        title = h.get("custom_title") or h.get("user_message") or "New Chat"
        result.append({
            "session_id": h["_id"],
            "title": title[:50],
            "timestamp": h["last_active"],
            "is_pinned": h.get("is_pinned", False),
            "is_archived": h.get("is_archived", False)
        })
    return result

@app.get("/chat/history/{session_id}")
def get_chat_session(session_id: str, email: str):
    # Fetch messages for this session
    chats = list(chats_collection.find({"session_id": session_id, "email": email}).sort("timestamp", 1))
    
    conversation = []
    for c in chats:
        # Reconstruct User message
        conversation.append({"role": "user", "text": c.get("user_message", ""), "id": str(c["_id"]) + "_u"})
        # Reconstruct AI message
        conversation.append({
            "role": "assistant", 
            "text": c.get("ai_reply", ""), 
            "image_url": c.get("image_url"), 
            "id": str(c["_id"]) + "_a",
            "message_id": str(c["_id"]) # Add the DB ID for feedback actions
        })
    return conversation

@app.put("/chat/history/{session_id}")
def update_chat_session(session_id: str, payload: ChatUpdate, email: str):
    update_data = {}
    if payload.title is not None:
        update_data["custom_title"] = payload.title
    if payload.is_pinned is not None:
        update_data["is_pinned"] = payload.is_pinned
    if payload.is_archived is not None:
        update_data["is_archived"] = payload.is_archived
        
    if not update_data:
        return {"status": "no changes"}
        
    # Update all documents in the session to ensure consistency for aggregation
    chats_collection.update_many(
        {"session_id": session_id, "email": email},
        {"$set": update_data}
    )
    return {"status": "updated"}

@app.delete("/chat/history/{session_id}")
def delete_chat_session(session_id: str, email: str):
    chats_collection.delete_many({"session_id": session_id, "email": email})
    return {"status": "deleted"}

# --------------------------------------------------
# Upload file
# --------------------------------------------------
@app.post("/upload-file")
async def upload_file(file: UploadFile = File(...), email: str | None = Form(None)):
    ext = file.filename.split(".")[-1].lower()
    
    # Use a temporary file instead of a persistent uploads folder
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        shutil.copyfileobj(file.file, tmp)
        tmp_path = tmp.name

    try:
        # Upload to S3
        s3_key = f"uploads/{uuid.uuid4()}.{ext}"
        s3.upload_file(
            tmp_path,
            AWS_BUCKET,
            s3_key,
            ExtraArgs={"ContentType": file.content_type}
        )

        extracted_text = None
        if ext in ["txt", "pdf", "docx"]:
            try:
                extracted_text = extract_text_from_file(tmp_path)
            except Exception as e:
                extracted_text = f"[Extraction error: {e}]"
        elif ext in ALLOWED_AUDIO_FORMATS:
            try:
                extracted_text = transcribe_audio_from_path(tmp_path)
            except Exception as e:
                extracted_text = f"[Transcription error: {e}]"
        elif ext in ALLOWED_IMAGE_FORMATS:
            try:
                extracted_text = extract_text_from_image(tmp_path)
            except Exception as e:
                extracted_text = f"[OCR error: {e}]"
        elif ext in ALLOWED_VIDEO_FORMATS:
            try:
                extracted_text = extract_text_from_video(tmp_path)
            except Exception as e:
                extracted_text = f"[Video transcription error: {e}]"
    finally:
        # Clean up the temporary file
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    files_collection.insert_one({
        "email": email,
        "original_name": file.filename,
        "saved_name": s3_key.split("/")[-1],
        "s3_key": s3_key,
        "uploaded_at": datetime.utcnow()
    })

    return {"file_id": s3_key, "original_name": file.filename, "text": extracted_text, "s3_key": s3_key}

# --------------------------------------------------
# File download
# --------------------------------------------------
@app.get("/files/{file_name}")
def get_file(file_name: str):
    # Since files are now only on S3, we redirect to the S3 URL
    # Assuming public read access or you can generate a presigned URL here
    s3_url = f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/uploads/{file_name}"
    return RedirectResponse(url=s3_url)


# --------------------------------------------------
# Realtime data helpers & endpoints (news, search, weather, fuel)
# --------------------------------------------------
def serp_search_raw(query: str, num: int = 5):
    if not SERP_API_KEY:
        raise HTTPException(status_code=503, detail="SerpAPI key not configured")
    try:
        params = {
            "q": query,
            "hl": "en",
            "gl": "in",
            "serp_api_key": SERP_API_KEY,
            "num": num,
        }
        search = GoogleSearch(params)
        return search.get_dict()
    except Exception as e:
        print("SERP ERROR:", e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/realtime/search")
def realtime_search(q: str):
    if not q:
        raise HTTPException(status_code=400, detail="Query (q) is required")
    result = serp_search_raw(q, num=10)
    items = []
    for r in result.get("organic_results", [])[:10]:
        items.append({
            "title": r.get("title"),
            "snippet": r.get("snippet"),
            "link": r.get("link"),
        })
    answer = None
    if "answer_box" in result:
        answer = result["answer_box"].get("answer") or result["answer_box"].get("snippet")
    return {"query": q, "answer": answer, "results": items}


@app.get("/news")
def news(q: str = "", category: str = ""):
    # category could be 'sports', 'politics', etc.
    if category and q:
        query = f"{category} news {q}"
    elif category:
        query = f"{category} news"
    elif q:
        query = q
    else:
        query = "latest news"

    result = serp_search_raw(query, num=10)
    items = []
    for r in result.get("organic_results", [])[:10]:
        items.append({"title": r.get("title"), "snippet": r.get("snippet"), "link": r.get("link")})
    return {"query": query, "results": items}


@app.get("/fuel/petrol")
def fuel_petrol(state: str = "", city: str = ""):
    location = city or state or "india"
    query = f"petrol price in {location} today"
    result = serp_search_raw(query, num=5)
    # try to extract an answer/snippet
    answer = None
    if "answer_box" in result:
        answer = result["answer_box"].get("answer") or result["answer_box"].get("snippet")
    elif result.get("organic_results"):
        answer = result["organic_results"][0].get("snippet")
    return {"location": location, "query": query, "answer": answer}


@app.get("/weather")
def weather(city: str):
    if not city:
        raise HTTPException(status_code=400, detail="City is required")
    # Prefer OpenWeather if configured
    if OPENWEATHER_API_KEY:
        try:
            resp = requests.get(
                "https://api.openweathermap.org/data/2.5/weather",
                params={"q": city, "appid": OPENWEATHER_API_KEY, "units": "metric"},
                timeout=10,
            )
            resp.raise_for_status()
            j = resp.json()
            data = {
                "city": j.get("name"),
                "temp_c": j.get("main", {}).get("temp"),
                "description": j.get("weather", [{}])[0].get("description"),
                "humidity": j.get("main", {}).get("humidity"),
                "wind_m_s": j.get("wind", {}).get("speed"),
            }
            return data
        except Exception as e:
            print("OpenWeather error:", e)
            # fallback to serp search below

    # Fallback: use SerpAPI to fetch weather summary
    query = f"weather in {city} today"
    result = serp_search_raw(query, num=3)
    answer = None
    if "answer_box" in result:
        answer = result["answer_box"].get("answer") or result["answer_box"].get("snippet")
    elif result.get("organic_results"):
        answer = result["organic_results"][0].get("snippet")
    return {"city": city, "query": query, "summary": answer}


# --------------------------------------------------
# Contact / Feedback endpoint
# --------------------------------------------------
@app.post("/contact-feedback")
async def contact_feedback(request: Request):
    try:
        payload = await request.json()
        email = payload.get("email")
        name = payload.get("name")
        ftype = payload.get("type", "Feedback")
        message = payload.get("message", "")

        if not message.strip():
            raise HTTPException(status_code=400, detail="Message is required")

        db["feedbacks"].insert_one({
            "email": email,
            "name": name,
            "type": ftype,
            "message": message,
            "created_at": datetime.utcnow()
        })

        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --------------------------------------------------
# Transcribe audio
# --------------------------------------------------
@app.post("/transcribe-audio")
async def transcribe_audio_api(file: UploadFile = File(...), email: str | None = Form(None)):
    if not file:
        raise HTTPException(status_code=400, detail="No audio file provided")

    ext = file.filename.split(".")[-1].lower()
    if ext not in ["mp3", "wav", "m4a", "ogg", "webm"]:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    text = await transcribe_audio(file)
    files_collection.insert_one({
        "email": email,
        "type": "audio",
        "original_name": file.filename,
        "transcription": text,
        "created_at": datetime.utcnow()
    })
    return {"text": text}

# --------------------------------------------------
# Message feedback endpoint
# --------------------------------------------------
@app.post("/message-feedback")
async def message_feedback(request: Request):
    try:
        payload = await request.json()
        message_id = payload.get("message_id")
        ftype = payload.get("type")  # like or dislike
        email = payload.get("email")

        if not message_id or ftype not in ["like", "dislike"]:
            raise HTTPException(status_code=400, detail="Invalid data")

        db["message_feedbacks"].insert_one({
            "message_id": message_id,
            "type": ftype,
            "email": email,
            "created_at": datetime.utcnow()
        })

        return {"status": "ok"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
