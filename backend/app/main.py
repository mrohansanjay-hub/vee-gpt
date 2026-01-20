# app/main.py
from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
# from starlette.middleware.sessions import SessionMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from pymongo import MongoClient
from datetime import datetime
import openai
import os
import json
import shutil
import uuid
import re
import re
from fpdf import FPDF
from docx import Document
from serpapi import GoogleSearch

# Custom services
from app.services.file_extractors import extract_text_from_file
from app.services.audio_processors import transcribe_audio, ALLOWED_AUDIO_FORMATS, transcribe_audio_from_path
from app.services.image_processors import extract_text_from_image
from app.services.video_processors import extract_text_from_video

# Google OAuth router
# from app.auth.google import router as google_auth_router

# --------------------------------------------------
# Load environment variables
# --------------------------------------------------
load_dotenv()
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

if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not found in .env")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI not found in .env")

openai.api_key = OPENAI_API_KEY

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
# Uploads folder
# --------------------------------------------------
UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# --------------------------------------------------
# FastAPI app
# --------------------------------------------------
app = FastAPI(title="AI Chatbot Backend")

# SessionMiddleware required for OAuth
# app.add_middleware(
#     SessionMiddleware,
#     secret_key=os.getenv("SESSION_SECRET", "super-secret-key")
# )

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Google OAuth router
# app.include_router(google_auth_router, prefix="/auth/google", tags=["Google Auth"])

# --------------------------------------------------
# Models
# --------------------------------------------------
class ChatRequest(BaseModel):
    messages: list

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

def build_file_prompt(user_message: str, extracted_text: str | None, file_ext: str):
    if not SERP_API_KEY:
        return None
    try:
        # Use the SerpAPI parameter name expected by the client
        search = GoogleSearch({
            "q": query,
            "hl": "en",
            "gl": "in",
            "serp_api_key": SERP_API_KEY
        })
        result = search.get_dict()
        if "answer_box" in result:
            return result["answer_box"].get("answer") or result["answer_box"].get("snippet")
        if result.get("organic_results"):
            return result["organic_results"][0].get("snippet")
    except Exception as e:
        print("SERP ERROR:", e)
    return None

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
    if not messages or not messages[-1].get('content'):
        raise HTTPException(status_code=400, detail="Messages required")

    ip = request.client.host
    ua = request.headers.get("user-agent", "")
    browser, os_name, device = parse_user_agent(ua)
    now = datetime.utcnow()

    # Track user
    tracking = tracking_collection.find_one({"ip": ip})
    if not tracking:
        tracking_collection.insert_one({
            "ip": ip,
            "browser": browser,
            "os": os_name,
            "device": device,
            "ua": ua,
            "first_visit": now,
            "last_active": now
        })
    else:
        tracking_collection.update_one({"_id": tracking["_id"]}, {"$set": {"last_active": now}})

    # System prompt
    system_prompt = "You are a helpful AI assistant. Use markdown for formatting when appropriate, such as code blocks for code and structured text for letters. When providing code, include explanations, usage instructions, and commands to run or execute the code. Always provide suggestions and detailed explanations for your responses."
    last_user = messages[-1]['content'].lower()
    needs_image = "image" in last_user or "diagram" in last_user or "visual" in last_user

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

    messages[0]['content'] = system_prompt

    # AI streaming response
    response = openai.chat.completions.create(
        model="gpt-4",
        messages=messages,
        temperature=0.7,
        max_tokens=1000,
        stream=True
    )

    local_image_url = None
    if needs_image:
        try:
            image_response = openai.images.generate(
                model="dall-e-3",
                prompt=f"A detailed diagram or image explaining: {messages[-1]['content']}",
                size="1024x1024",
                n=1,
            )
            image_url = image_response.data[0].url
            img_resp = requests.get(image_url)
            image_filename = f"{uuid.uuid4()}.png"
            image_path = os.path.join(UPLOAD_FOLDER, image_filename)
            with open(image_path, "wb") as f:
                f.write(img_resp.content)
            local_image_url = f"http://127.0.0.1:8000/files/{image_filename}"
        except Exception as e:
            print("Image gen error:", e)
            local_image_url = None

    def generate():
        full_reply = ""
        for chunk in response:
            if chunk.choices[0].delta.content:
                content = chunk.choices[0].delta.content
                full_reply += content
                yield f"data: {json.dumps({'chunk': content})}\n\n"

        # Clean the full reply after accumulation
        # full_reply = clean_markdown(full_reply)  # Removed to allow markdown

        # Save chat to DB
        last_user_msg = next((m['content'] for m in reversed(messages) if m['role'] == 'user'), '')
        chats_collection.insert_one({
            "timestamp": now,
            "user_message": last_user_msg,
            "ai_reply": full_reply,
            "image_url": local_image_url
        })
        yield f"data: {json.dumps({'final': full_reply, 'image_url': local_image_url})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

# --------------------------------------------------
# Upload file
# --------------------------------------------------
@app.post("/upload-file")
async def upload_file(file: UploadFile = File(...)):
    ext = file.filename.split(".")[-1].lower()
    file_id = str(uuid.uuid4())
    saved_name = f"{file_id}.{ext}"
    path = os.path.join(UPLOAD_FOLDER, saved_name)
    os.makedirs(UPLOAD_FOLDER, exist_ok=True)

    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    extracted_text = None
    if ext in ["txt", "pdf", "docx"]:
        try:
            extracted_text = extract_text_from_file(path)
        except Exception as e:
            extracted_text = f"[Extraction error: {e}]"
    elif ext in ALLOWED_AUDIO_FORMATS:
        try:
            extracted_text = transcribe_audio_from_path(path)
        except Exception as e:
            extracted_text = f"[Transcription error: {e}]"
    elif ext in ALLOWED_IMAGE_FORMATS:
        try:
            extracted_text = extract_text_from_image(path)
        except Exception as e:
            extracted_text = f"[OCR error: {e}]"
    elif ext in ALLOWED_VIDEO_FORMATS:
        try:
            extracted_text = extract_text_from_video(path)
        except Exception as e:
            extracted_text = f"[Video transcription error: {e}]"

    files_collection.insert_one({
        "original_name": file.filename,
        "saved_name": saved_name,
        "uploaded_at": datetime.utcnow()
    })

    return {"file_id": saved_name, "original_name": file.filename, "text": extracted_text}

# --------------------------------------------------
# File download
# --------------------------------------------------
@app.get("/files/{file_name}")
def get_file(file_name: str):
    path = os.path.join(UPLOAD_FOLDER, file_name)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path, filename=file_name)


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
async def transcribe_audio_api(file: UploadFile = File(...)):
    if not file:
        raise HTTPException(status_code=400, detail="No audio file provided")

    ext = file.filename.split(".")[-1].lower()
    if ext not in ["mp3", "wav", "m4a", "ogg", "webm"]:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    text = await transcribe_audio(file)
    files_collection.insert_one({
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