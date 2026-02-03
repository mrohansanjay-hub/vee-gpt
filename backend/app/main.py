# app/main.py
from fastapi import FastAPI, Request, UploadFile, File, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware
from fastapi.responses import StreamingResponse, FileResponse, HTMLResponse
from pydantic import BaseModel
from dotenv import load_dotenv
from pymongo import MongoClient
from datetime import datetime, timezone
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
from bson import ObjectId

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
from app.auth.google import router as auth_router

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

ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin123")

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

# Include auth router
app.include_router(auth_router, prefix="/auth/google", tags=["Auth"])

# --------------------------------------------------
# Models
# --------------------------------------------------
class ChatRequest(BaseModel):
    messages: list
    email: str | None = None
    session_id: str | None = None
    model: str | None = "gpt-4o-mini"
    is_large_code: bool | None = False  # Flag for large code chunks

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

def serialize_mongo(doc):
    if isinstance(doc, list):
        return [serialize_mongo(d) for d in doc]
    if isinstance(doc, dict):
        return {k: serialize_mongo(v) for k, v in doc.items()}
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat()
    return doc

def count_tokens_estimate(text: str) -> int:
    """Estimate token count (rough estimate: 1 token ≈ 4 characters)"""
    return len(text) // 4

def split_large_code(text: str, max_tokens: int = 5000) -> list[str]:
    """Split large code into chunks based on token count"""
    max_chars = max_tokens * 4
    lines = text.split('\n')
    chunks = []
    current_chunk = []
    current_size = 0
    
    for line in lines:
        line_size = len(line) + 1  # +1 for newline
        if current_size + line_size > max_chars and current_chunk:
            chunks.append('\n'.join(current_chunk))
            current_chunk = [line]
            current_size = line_size
        else:
            current_chunk.append(line)
            current_size += line_size
    
    if current_chunk:
        chunks.append('\n'.join(current_chunk))
    
    return chunks

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
# Admin Panel
# --------------------------------------------------
class AdminLoginRequest(BaseModel):
    email: str
    password: str

@app.get("/admin", response_class=HTMLResponse)
async def admin_panel():
    try:
        file_path = os.path.join(os.path.dirname(__file__), "admin.html")
        with open(file_path, "r", encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return HTMLResponse("Admin panel file not found.", status_code=404)

@app.post("/admin/login")
async def admin_login(request: Request, payload: AdminLoginRequest):
    if payload.email == "admin@gmail.com" and payload.password == ADMIN_PASSWORD:
        request.session["admin_user"] = payload.email
        return {"status": "ok"}
    raise HTTPException(status_code=401, detail="Invalid credentials")

@app.post("/admin/logout")
async def admin_logout(request: Request):
    request.session.pop("admin_user", None)
    return {"status": "ok"}

@app.get("/admin/api/me")
async def admin_me(request: Request):
    user = request.session.get("admin_user")
    if not user:
        return {"user": None}
    return {"user": user}

@app.get("/admin/api/collections")
async def admin_collections(request: Request):
    if not request.session.get("admin_user"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return db.list_collection_names()

@app.get("/admin/api/collections/{name}")
async def admin_collection_data(name: str, request: Request, limit: int = 0, new_only: bool = False):
    if not request.session.get("admin_user"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        filters = {}
        
        # Filter for new records only (last 24 hours)
        if new_only:
            from datetime import timedelta
            twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
            filters["timestamp"] = {"$gte": twenty_four_hours_ago}
        
        query = db[name].find(filters).sort("_id", -1)
        if limit > 0:
            query = query.limit(limit)
        docs = list(query)
        return serialize_mongo(docs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/admin/api/stats")
async def admin_stats(request: Request):
    """Get stats for dashboard - new users and chats in last 24 hours"""
    if not request.session.get("admin_user"):
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    try:
        from datetime import timedelta
        twenty_four_hours_ago = datetime.utcnow() - timedelta(hours=24)
        
        # Count new users (last 24 hours)
        new_users_count = users_collection.count_documents({
            "created_at": {"$gte": twenty_four_hours_ago}
        })
        total_users = users_collection.count_documents({})
        
        # Count new chats (last 24 hours)
        new_chats_count = chats_collection.count_documents({
            "timestamp": {"$gte": twenty_four_hours_ago}
        })
        total_chats = chats_collection.count_documents({})
        
        return {
            "new_users": new_users_count,
            "total_users": total_users,
            "new_chats": new_chats_count,
            "total_chats": total_chats
        }
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
    is_large_code = payload.is_large_code
    
    if not messages or not messages[-1].get('content'):
        raise HTTPException(status_code=400, detail="Messages required")
    
    # Validate message size
    last_message_content = messages[-1].get('content', '')
    if isinstance(last_message_content, str):
        content_size = len(last_message_content)
        if content_size > 500000:  # 500KB limit
            raise HTTPException(status_code=413, detail=f"Message too large. Max 500KB. Got {content_size} bytes")
        
        # Print warning if large code
        if content_size > 100000:
            print(f"⚠️ Large code input detected: {content_size} bytes ({content_size/1024:.1f} KB)")

    # Extract images from the last user message if they contain image URLs
    image_urls_in_message = []
    last_message = messages[-1]
    content = last_message.get('content', '')
    
    # Check if message contains S3 image URLs - supports both:
    # 1. bucket.s3.region.amazonaws.com (with region)
    # 2. bucket.s3.amazonaws.com (without region - default US East 1)
    # Match until whitespace or quote to avoid capturing trailing punctuation
    s3_pattern = r'https://[^/]+\.s3(?:\.[^/]+)?\.amazonaws\.com/uploads/[^\s"\)]*'
    image_urls_in_message = re.findall(s3_pattern, content)
    
    print(f"🖼️ Image URLs found: {image_urls_in_message}")
    print(f"📝 Content: {content[:200]}")  # Debug: show first 200 chars
    
    # Clean content to remove image URLs before sending to OpenAI
    clean_content = re.sub(s3_pattern, '', content).strip()

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

    # Update the last message with clean content
    messages_to_send = [msg.copy() if isinstance(msg, dict) else msg for msg in messages]
    if messages_to_send and isinstance(messages_to_send[-1], dict):
        messages_to_send[-1]['content'] = clean_content if clean_content else content
    
    # ==================== VISION API LOGIC ====================
    # Strategy: If image has text → OCR (optional), Else → Vision Model
    final_messages = messages_to_send.copy()
    
    if image_urls_in_message:
        print(f"📸 Processing {len(image_urls_in_message)} image(s) with Vision API")
        # Build Vision API message with images
        vision_content = []
        
        # Add text prompt
        text_prompt = clean_content if clean_content else "Please analyze this image and describe what you see. Provide detailed information about the objects, people, scenes, or any other visual elements in the image."
        vision_content.append({
            "type": "text",
            "text": text_prompt
        })
        
        # Add all images
        for img_url in image_urls_in_message:
            print(f"  Adding image to Vision API: {img_url}")
            vision_content.append({
                "type": "image_url",
                "image_url": {
                    "url": img_url,
                    "detail": "high"  # Use high detail for better analysis
                }
            })
        
        # Create vision message and replace the last user message
        vision_message = {
            "role": "user",
            "content": vision_content
        }
        final_messages[-1] = vision_message
        print(f"✅ Vision API message prepared with {len(vision_content)} content items")

    # System prompt
    system_prompt = """
You are vee-gpt, a senior full-stack developer and technical mentor.

========================
STRICT IDENTITY & RESPONSE RULES
========================
1. **Identity**: You are vee-gpt. You are NOT developed by OpenAI.
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
10. **ARCHITECTURE & FLOWCHARTS**: When explaining code structure, complex systems, or algorithms, ALWAYS include:
    - Text-based architecture diagrams (using ASCII art or Markdown tables)
    - Flow diagrams showing data flow, control flow, or system architecture
    - Component interaction diagrams for multi-component systems
    - Sequence diagrams for step-by-step processes
    Use clear formatting with arrows (-->, <--, ↓, ↑, →, ←, etc.) and boxes to visualize concepts.

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
   - For complex topics, use text-based diagrams (flowcharts, architectures) to visualize concepts.

4. Conclusion  
   - Summarize the key points.
   - Reinforce the main takeaway.

5. Suggestions  
   - Provide practical suggestions, applications, or areas for further learning.

6. Next Steps & Future Updates
   - Outline the immediate next steps to follow.
   - Mention upcoming trends, future updates, or evolutions related to the topic.

IMPORTANT FOR CONTENT:
- **CRITICAL RULE**: If a user asks for an explanation (using words like "explain", "describe", "what is") AND also asks for images in the same prompt, you MUST completely IGNORE the request for images. Do not mention images, do not apologize for not showing them, and do not generate image markdown. Simply provide the text-based explanation as if images were never requested. The response must be 100% text-only.
- Use clear section headings with relevant emojis/icons, bold text, and end with a colon (e.g., "### **🚀 Introduction:**").
- Use bullet points ("-" or ".") for lists to make it readable.
- Add relevant icons to sub-points where appropriate to make it visually engaging.
- Use simple, easy-to-understand language.
- Keep explanations structured and logical.
- Avoid unnecessary complexity unless explicitly requested.
- Separate main sections with a horizontal rule ("---") to improve readability.

========================
STEP-BY-STEP GUIDES
========================
For "how-to" or installation requests (e.g., "how to download VSCode"):
- Break the answer into distinct steps (e.g., **Step 1:**, **Step 2:**).
- Add a horizontal rule ("---") with blank lines before and after it between every step and section to clearly separate them.
- Provide clear instructions for downloading and installing.
- Do NOT provide actual download URLs in responses - just point to official websites.

========================
GENERAL RULES
========================
- Use proper markdown formatting.
- Be direct, clear, and practical.
- Do NOT include generic AI disclaimers.
- Ask clarifying questions ONLY if absolutely necessary.

========================
IMAGE VISION ANALYSIS (CRITICAL)
========================
When the user uploads an image or mentions an image file:
- **You CAN view and analyze images** - Images are sent to you via Vision API
- Describe what you see in EXTREME DETAIL: objects, people, text, scenes, colors, composition, materials, brands, models
- **ANALYZE EVERYTHING**: vehicles (model, brand, color, features), people (appearance, clothing, expressions), products (name, features, specs), scenes (location, context, elements)
- If the image contains readable text → Extract and explain the text
- If the image shows objects/scenes → Provide comprehensive visual analysis
- **NEVER say** "I cannot view images" or "I cannot see what's in the image" or "I did not receive an image"
- **NEVER ask the user to describe the image** - YOU can see it, you describe it!
- Always provide comprehensive, detailed descriptions of images
- For vehicles: mention brand, model, color, features, condition, accessories
- For product images: describe name, brand, features, design, colors, materials, uses
- For photos: describe people, expressions, clothing, setting, context, mood, lighting
- For documents/screenshots: extract and explain the text content
- Even if you only see an image filename mentioned: the image IS being sent, analyze it!

========================
MEDICAL/DISEASE IMAGE ANALYSIS (MANDATORY STRUCTURE)
========================
When analyzing medical, disease, injury, or health-related images:

**ALWAYS follow this structured format:**

1. **🔍 DIAGNOSIS/CONDITION IDENTIFIED**
   - Clear identification of the disease, injury, or condition
   - Medical name (if applicable)

2. **⚠️ KEY SYMPTOMS/SIGNS VISIBLE**
   - List visual indicators present in the image
   - Use bullet points with ✓ for visible symptoms
   - Bold the most prominent indicators

3. **🔬 CAUSES & PATHOPHYSIOLOGY**
   - Why this condition looks like this
   - What causes these visual manifestations
   - Biological/medical explanation

4. **💥 SEVERITY & COMPLICATIONS**
   - Stage or severity level (if visible)
   - Potential complications if untreated
   - Risk assessment

5. **💊 TREATMENT/MANAGEMENT**
   - General treatment approaches
   - Prevention methods
   - When to seek medical attention

6. **📌 IMPORTANT POINTS**
   - Highlight 3-5 most critical findings in **bold**
   - Use emoji indicators (⚠️ 🔴 ✓ 📍) to emphasize importance

**FORMATTING RULES:**
- Use **bold** for important findings
- Use 🔴 for severe/critical findings
- Use ✓ for identified symptoms
- Use ⚠️ for warnings/precautions
- Use bullet points (•) for lists
- Use clear heading structure with emojis

========================
FILE PROCESSING & GENERATION (STRICT)
========================
When the user provides a file or text and asks to "beautify", "format", "convert to ATS resume", "write a letter", or "refactor code":
1. **TRANSFORM**: Completely rewrite the content in the requested format (e.g., clean ATS structure for resumes, standard business format for letters). Do NOT just copy the input.
2. **ISOLATE**: Wrap the *final processed content* in a Markdown code block (```). Do NOT put conversational text inside this block.
3. **NO LINKS**: Do NOT provide any download links or file URLs in the response. Files are auto-downloaded automatically.

- Do NOT generate fake download links (e.g., file.io, example.com).
"""


    last_user = messages[-1]['content'].lower()

    # --- SMART ROUTING: Determine request type ---
    # Check if request has audio/file/image to skip unnecessary SERP calls
    has_audio = any(keyword in content for keyword in [".mp3", ".wav", ".m4a", ".flac", "audio", "transcribe"])
    has_file = any(keyword in content for keyword in [".pdf", ".docx", ".txt", ".xlsx", "file:", "document"])
    has_image = bool(image_urls_in_message)  # Image URLs already extracted above
    
    is_text_only = not (has_audio or has_file or has_image)
    
    print(f"\n{'='*100}")
    print(f"📊 REQUEST ROUTING ANALYSIS")
    print(f"{'='*100}")
    print(f"📝 User Query: {messages[-1]['content'][:100]}")
    print(f"🔍 Request Type: text_only={is_text_only}, has_audio={has_audio}, has_file={has_file}, has_image={has_image}")
    
    if has_audio:
        print(f"   ✅ AUDIO DETECTED → Using Whisper API for transcription")
    if has_file:
        print(f"   ✅ FILE DETECTED → Using file extraction service")
    if has_image:
        print(f"   ✅ IMAGE DETECTED → Using Vision API + OCR")

    # --- Realtime data injection (ONLY for text-only queries) ---
    realtime_info = []

    # CRITICAL: Only fetch SERP data if this is a TEXT-ONLY request
    # If user uploaded audio/file/image, skip SERP to save credits
    if is_text_only:
        print(f"\n⏳ TEXT-ONLY REQUEST: Checking for REALTIME INFO keywords...")
        try:
            now = datetime.now(timezone.utc).astimezone()
            time_str = now.strftime('%d %b %Y %I:%M %p')
            
            # Extract location if mentioned
            location_match = re.search(r"in\s+([a-zA-Z\s]+)", last_user)
            location = location_match.group(1).strip() if location_match else "India"
            
            # ==================== WEATHER ====================
            if any(keyword in last_user for keyword in ["weather", "climate", "temperature", "wind", "humidity", "forecast"]):
                print(f"   🌐 SERP: Weather keyword detected → Fetching realtime weather data")
                city = location if location_match else None
                if city:
                    w = weather(city=city)
                    if w.get("temp_c") is not None:
                        realtime_info.append(
                            f"🌡️ Weather Update ({time_str}): "
                            f"{w['city']} | {w['temp_c']}°C | {w['description']} | "
                            f"Humidity {w.get('humidity')}% | Wind {w.get('wind_m_s')} m/s"
                        )
                    elif w.get("summary"):
                        realtime_info.append(
                            f"🌡️ Weather Update ({time_str}): {w['summary']}"
                        )
            
            # ==================== NEWS ====================
            if any(keyword in last_user for keyword in ["news", "headlines", "latest", "breaking", "updates"]):
                print(f"   🌐 SERP: News keyword detected → Fetching latest news")
                q = re.sub(r"(show|give|latest|what|is|are|tell|me|news|headlines)", "", last_user).strip()
                n = news(q=q if q else "", category="")
                headlines = [it.get("title") for it in n.get("results", [])[:3] if it.get("title")]
                if headlines:
                    realtime_info.append(
                        f"📰 Latest News ({time_str}): " + " | ".join(headlines)
                    )
            
            # ==================== SPORTS ====================
            if any(keyword in last_user for keyword in ["sports", "cricket", "football", "soccer", "basketball", "match", "score", "tournament"]):
                print(f"   🌐 SERP: Sports keyword detected → Fetching sports updates")
                q = re.sub(r"(show|give|latest|what|is|are|tell|me|sports)", "", last_user).strip()
                s = news(q=q if q else "sports", category="sports")
                sports_news = [it.get("title") for it in s.get("results", [])[:3] if it.get("title")]
                if sports_news:
                    realtime_info.append(
                        f"⚽ Sports Update ({time_str}): " + " | ".join(sports_news)
                    )
            
            # ==================== STOCKS ====================
            if any(keyword in last_user for keyword in ["stock", "share", "market", "sensex", "nifty", "nasdaq", "dow jones"]):
                print(f"   🌐 SERP: Stock market keyword detected → Fetching live stock data")
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                stock_query = q if q else "stock market today"
                st = serp_search_raw(stock_query, num=5)
                stock_data = None
                if "answer_box" in st:
                    stock_data = st["answer_box"].get("answer") or st["answer_box"].get("snippet")
                elif st.get("organic_results"):
                    stock_data = st["organic_results"][0].get("snippet")
                if stock_data:
                    realtime_info.append(
                        f"📈 Stock Market ({time_str}): {stock_data}"
                    )
            
            # ==================== CRYPTO / BITCOIN ====================
            if any(keyword in last_user for keyword in ["crypto", "bitcoin", "ethereum", "btc", "eth", "blockchain", "nft"]):
                print(f"   🌐 SERP: Crypto keyword detected → Fetching live crypto prices")
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                crypto_query = q if q else "bitcoin price today"
                cr = serp_search_raw(crypto_query, num=5)
                crypto_data = None
                if "answer_box" in cr:
                    crypto_data = cr["answer_box"].get("answer") or cr["answer_box"].get("snippet")
                elif cr.get("organic_results"):
                    crypto_data = cr["organic_results"][0].get("snippet")
                if crypto_data:
                    realtime_info.append(
                        f"₿ Cryptocurrency ({time_str}): {crypto_data}"
                    )
            
            # ==================== FUEL / PETROL ====================
            if any(keyword in last_user for keyword in ["petrol", "fuel", "diesel", "gas", "price", "lpg"]):
                fp = fuel_petrol(state=location, city="")
                if fp.get("answer"):
                    realtime_info.append(
                        f"⛽ Fuel Price ({time_str}) for {fp.get('location')}: {fp.get('answer')}"
                    )
            
            # ==================== SOILS / AGRICULTURE ====================
            if any(keyword in last_user for keyword in ["soil", "agriculture", "farming", "crop", "harvest", "fertilizer"]):
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                soil_query = q if q else f"soil conditions in {location}"
                sol = serp_search_raw(soil_query, num=5)
                soil_data = None
                if "answer_box" in sol:
                    soil_data = sol["answer_box"].get("answer") or sol["answer_box"].get("snippet")
                elif sol.get("organic_results"):
                    soil_data = sol["organic_results"][0].get("snippet")
                if soil_data:
                    realtime_info.append(
                        f"🌾 Agriculture/Soil Info ({time_str}): {soil_data}"
                    )
            
            # ==================== MINERALS / COALS ====================
            if any(keyword in last_user for keyword in ["coal", "mineral", "mining", "ore", "iron", "copper", "gold"]):
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                mineral_query = q if q else "coal prices today"
                mn = serp_search_raw(mineral_query, num=5)
                mineral_data = None
                if "answer_box" in mn:
                    mineral_data = mn["answer_box"].get("answer") or mn["answer_box"].get("snippet")
                elif mn.get("organic_results"):
                    mineral_data = mn["organic_results"][0].get("snippet")
                if mineral_data:
                    realtime_info.append(
                        f"⛏️ Minerals/Coal Info ({time_str}): {mineral_data}"
                    )
            
            # ==================== ENVIRONMENT / AIR QUALITY ====================
            if any(keyword in last_user for keyword in ["air quality", "pollution", "aqi", "pm2.5", "environment", "ozone"]):
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                env_query = q if q else f"air quality in {location}"
                env = serp_search_raw(env_query, num=5)
                env_data = None
                if "answer_box" in env:
                    env_data = env["answer_box"].get("answer") or env["answer_box"].get("snippet")
                elif env.get("organic_results"):
                    env_data = env["organic_results"][0].get("snippet")
                if env_data:
                    realtime_info.append(
                        f"🌍 Environment/Air Quality ({time_str}): {env_data}"
                    )
            
            # ==================== HEALTH / DISEASES ====================
            if any(keyword in last_user for keyword in ["health", "disease", "virus", "covid", "medicine", "treatment", "hospital"]):
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                health_query = q if q else "health news today"
                hlt = serp_search_raw(health_query, num=5)
                health_data = [it.get("title") for it in hlt.get("results", [])[:3] if it.get("title")]
                if not health_data and "answer_box" in hlt:
                    health_data = [hlt["answer_box"].get("answer") or hlt["answer_box"].get("snippet")]
                if health_data:
                    realtime_info.append(
                        f"🏥 Health Info ({time_str}): " + " | ".join(str(h) for h in health_data[:3])
                    )
            
            # ==================== EVENTS / CONFERENCES ====================
            if any(keyword in last_user for keyword in ["event", "conference", "concert", "festival", "tournament", "meeting"]):
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                event_query = q if q else f"events in {location}"
                evt = serp_search_raw(event_query, num=5)
                event_data = [it.get("title") for it in evt.get("results", [])[:3] if it.get("title")]
                if event_data:
                    realtime_info.append(
                        f"🎉 Events ({time_str}): " + " | ".join(event_data)
                    )
            
            # ==================== TRAVEL / TRAFFIC ====================
            if any(keyword in last_user for keyword in ["traffic", "flight", "travel", "route", "transport", "commute"]):
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                travel_query = q if q else f"traffic in {location}"
                trv = serp_search_raw(travel_query, num=5)
                travel_data = None
                if "answer_box" in trv:
                    travel_data = trv["answer_box"].get("answer") or trv["answer_box"].get("snippet")
                elif trv.get("organic_results"):
                    travel_data = trv["organic_results"][0].get("snippet")
                if travel_data:
                    realtime_info.append(
                        f"✈️ Travel/Traffic Info ({time_str}): {travel_data}"
                    )
            
            # ==================== WEATHER CONDITIONS (EXTREME) ====================
            if any(keyword in last_user for keyword in ["rain", "flood", "storm", "cyclone", "hurricane", "tsunami", "earthquake"]):
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                condition_query = q if q else f"weather conditions in {location}"
                cond = serp_search_raw(condition_query, num=5)
                condition_data = None
                if "answer_box" in cond:
                    condition_data = cond["answer_box"].get("answer") or cond["answer_box"].get("snippet")
                elif cond.get("organic_results"):
                    condition_data = cond["organic_results"][0].get("snippet")
                if condition_data:
                    realtime_info.append(
                        f"⚠️ Extreme Weather Conditions ({time_str}): {condition_data}"
                    )
            
            # ==================== EDUCATION / ADMISSIONS ====================
            if any(keyword in last_user for keyword in ["education", "admission", "exam", "neet", "jee", "board", "result"]):
                q = re.sub(r"(show|give|latest|what|is|are|tell|me)", "", last_user).strip()
                edu_query = q if q else "education news today"
                edu = serp_search_raw(edu_query, num=5)
                edu_data = [it.get("title") for it in edu.get("results", [])[:3] if it.get("title")]
                if edu_data:
                    realtime_info.append(
                        f"🎓 Education News ({time_str}): " + " | ".join(edu_data)
                    )
            
            # NOTE: No GENERAL SEARCH FALLBACK - Only call SERP for specific realtime keywords
            # This saves credits! Regular questions go to OpenAI instead
        except Exception as e:
            print("Realtime fetch error:", e)
    else:
        print("⏭️  TEXT-ONLY BUT NOT REALTIME: Skipping SERP - Request has audio/file/image. Saving credits!")

    # --- Log API routing decision ---
    if realtime_info:
        print(f"\n{'='*100}")
        print(f"🌐 API ROUTING DECISION: SERP + OpenAI (HYBRID MODE)")
        print(f"{'='*100}")
        print(f"✅ Using SERP API: YES (Found {len(realtime_info)} realtime data points)")
        print(f"✅ Using OpenAI GPT: YES (for analysis & response generation)")
        print(f"   Realtime Data Sources: {', '.join([info.split('(')[0].strip() for info in realtime_info][:3])}")
        system_prompt = system_prompt + "\n\n════════════════════════════\n⏱ REALTIME DATA MODE (STRICT)\n════════════════════════════\nThe following information is LIVE and fetched from external APIs (Google / OpenWeather).\n\nRULES:\n✔ You MUST use the realtime data provided\n✔ NEVER say \"I don't have real-time data\"\n✔ NEVER redirect users to external websites\n✔ NEVER say data is unavailable if present\n✔ ALWAYS include date & time in responses\n✔ Present data confidently as current\n\nIf realtime data exists, treat it as authoritative truth.\n════════════════════════════\n\nRealtime data:\n" + "\n".join(realtime_info)
    else:
        print(f"\n{'='*100}")
        print(f"🤖 API ROUTING DECISION: OpenAI ONLY (KNOWLEDGE BASE MODE)")
        print(f"{'='*100}")
        print(f"✅ Using SERP API: NO (No realtime keywords detected)")
        print(f"✅ Using OpenAI GPT: YES (Knowledge base + your training data)")
        print(f"💰 CREDIT SAVING: SERP credits NOT used!")
    
    # --- Add current date & time ---
    now_ist = datetime.now(timezone.utc).astimezone()
    system_prompt += f"\n\nCurrent Date & Time: {now_ist.strftime('%d %B %Y, %I:%M %p %Z')}\n"

    # --------------------------------------------------
    # GPT + GOOGLE IMAGE SEARCH LOGIC (REWRITTEN)
    # --------------------------------------------------

    image_urls = []

    user_text = messages[-1]["content"]
    lower_text = user_text.lower()

    # Define patterns for explanation requests to suppress image generation
    explanation_patterns = [
        r"\b(explain|describe|what is|what are|how does|tell me about|who is|why is)\b"
    ]
    is_explanation_request = any(re.search(pattern, lower_text) for pattern in explanation_patterns)

    # STRICT: Only fetch images for explicit image requests (pure image requests only)
    # NO images with explanations - explanation requests should only show text
    pure_image_patterns = [
        # Explicit PURE image requests (show/find/get/search/view/display IMAGES)
        r"^(?:show|find|get|generate|search|view|display)\s+.*?(?:images?|photos?|pictures?|pics?|diagrams?|sketches?)",
        r"(?:images?|photos?|pictures?|pics?|diagrams?|sketches?)\s+of",
    ]
    
    # Only pure image requests should fetch images. If an explanation is requested, do not fetch images.
    is_pure_image_request = any(re.search(pattern, lower_text) for pattern in pure_image_patterns) and not is_explanation_request
    fetch_images_upfront = is_pure_image_request
    fetch_images_from_response = False  # DISABLED: No images with explanations

    def extract_image_query(text: str) -> str:
        """
        Clean the user message to create a strong Google Image search query.
        """
        # Use word boundaries to avoid partial matches and remove common stopwords
        pattern = r"\b(show|give|me|some|images|image|photos|pictures|pics|of|about|explain|with|describe|what|is|how|does|generate|view|display|see|to|in|on|the|a|an|with|images?)\b"
        text = re.sub(
            pattern,
            "",
            text,
            flags=re.IGNORECASE
        )
        return text.strip()

    def fetch_images_for_query(query: str) -> list:
        """
        Fetch images from SERP API for a given search query.
        """
        if not SERP_API_KEY:
            print("SERP_API_KEY missing, skipping image fetch")
            return []
        
        try:
            search = GoogleSearch({
                "q": query,
                "tbm": "isch",
                "api_key": SERP_API_KEY,
                "num": 10
            })
            results = search.get_dict()
            
            if "images_results" in results:
                image_urls = [
                    img.get("original")
                    for img in results.get("images_results", [])
                    if img.get("original")
                ]
                # Deduplicate URLs while preserving order
                return list(dict.fromkeys(image_urls))[:6]
        except Exception as e:
            print(f"Google Image fetch error: {e}")
        
        return []

    def fetch_ai_mode_images(query: str) -> list:
        """
        Fetch entity-based images using SerpAPI AI Mode.
        AI Mode automatically extracts entities and their images from text.
        """
        if not SERP_API_KEY:
            print("SERP_API_KEY missing, skipping AI Mode image fetch")
            return []

        try:
            search = GoogleSearch({
                "engine": "google_ai_mode",
                "q": query,
                "api_key": SERP_API_KEY
            })

            results = search.get_dict()

            entities = []
            for topic in results.get("topics", []):
                title = topic.get("title")
                image = topic.get("image")

                if title and image:
                    entities.append({
                        "title": title,
                        "image": image
                    })

            return entities[:6]  # limit to 6 for UI safety

        except Exception as e:
            print(f"SerpAPI AI Mode error: {e}")
            return []

    def extract_kings(text: str) -> list[str]:
        """
        Extract likely Indian king names from explanation text.
        """
        patterns = [
            r"King\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
            r"Emperor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
            r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b"
        ]

        candidates = []
        for p in patterns:
            candidates.extend(re.findall(p, text))

        # remove duplicates & noise
        blacklist = {"India", "Indian", "History", "Dynasty", "Empire"}
        kings = []
        for c in candidates:
            c = c.strip()
            if len(c.split()) <= 3 and c not in blacklist:
                kings.append(c)

        return list(dict.fromkeys(kings))[:6]  # max 6 kings

    def fetch_single_image(query: str) -> str | None:
        """
        Fetch ONE best image from SERP for a given query.
        """
        if not SERP_API_KEY:
            return None

        try:
            search = GoogleSearch({
                "q": f"{query} portrait painting",
                "tbm": "isch",
                "api_key": SERP_API_KEY,
                "num": 1
            })
            results = search.get_dict()
            images = results.get("images_results", [])
            if images:
                return images[0].get("original")
        except Exception as e:
            print("Image fetch error:", e)

        return None

    def insert_images_contextually(text: str, entities: list) -> str:
        """
        Insert images contextually in the middle of content based on entity mentions.
        Distributes images throughout the explanation at logical breakpoints.
        """
        if not entities or not text:
            return text
        
        paragraphs = text.split('\n\n')
        if len(paragraphs) < 2:
            return text  # Not enough content to distribute images
        
        # Calculate insertion points - distribute images evenly
        total_paragraphs = len(paragraphs)
        images_to_insert = len(entities)
        
        if images_to_insert == 0:
            return text
        
        # Build a mapping of entities to their positions in text
        entity_positions = {}
        for entity in entities:
            title = entity.get("title", "").lower()
            image_url = entity.get("image", "")
            
            # Find paragraph containing entity name
            for idx, para in enumerate(paragraphs):
                if title in para.lower() and idx not in entity_positions:
                    entity_positions[idx] = {
                        "title": entity.get("title", "Image"),
                        "image": image_url
                    }
                    break
        
        # If entities not found in text, distribute evenly
        if not entity_positions:
            step = max(1, total_paragraphs // (images_to_insert + 1))
            for i, entity in enumerate(entities):
                pos = (i + 1) * step
                if pos < total_paragraphs:
                    entity_positions[pos] = {
                        "title": entity.get("title", "Image"),
                        "image": entity.get("image", "")
                    }
        
        # Sort by position in reverse order to insert from bottom to top
        sorted_positions = sorted(entity_positions.items(), reverse=True)
        
        # Insert images at calculated positions
        for para_idx, entity_data in sorted_positions:
            if para_idx < total_paragraphs:
                img_html = f"\n\n![{entity_data['title']}]({entity_data['image']})\n\n*{entity_data['title']}*"
                paragraphs.insert(para_idx + 1, img_html)
        
        return '\n\n'.join(paragraphs)

    # Case 1: Pure image request - fetch immediately
    if fetch_images_upfront:
        search_query = extract_image_query(user_text)
        if not search_query:
            search_query = user_text.strip()
        image_urls = fetch_images_for_query(search_query)

    # --------------------------------------------------
    # SYSTEM PROMPT IMAGE AWARENESS
    # --------------------------------------------------

    if fetch_images_upfront and image_urls:
        system_prompt += """
========================
IMAGE RESPONSE RULES - CRITICAL (PURE IMAGE REQUEST)
========================
- Images have been fetched from Google using SERP API and are already displayed to the user.
- **NO NEGATIVE WORDS**: You are STRICTLY FORBIDDEN from using words like "can't", "unable", "cannot", "sorry", "apologize".
- NEVER say "I cannot display images".
- NEVER describe or list the images.
- NEVER add table layouts or image descriptions.
- Output ONLY: "Feel free to explore these images. Let me know if you need more information about any of them! 😊"
- Do NOT add any other text, descriptions, or explanations about the images.
- Images are displayed in a 2-column grid (3 rows, 6 images total).
- Images are interactive: Users can click to view full-screen (lightbox with close button).
"""

    # Add user context for responsive/adaptive responses
    system_prompt += f"\n\nUser Context:\n- Device: {device}\n- OS: {os_name}\n- Browser: {browser}\n"
    
    # STEP 5: Add guard to block model from overriding realtime
    system_prompt += """\n\nIMPORTANT:\nIf realtime data is present, DO NOT add disclaimers.\nDO NOT mention limitations.\nDO NOT mention training data.\nDO NOT suggest checking other websites."""

    # ==================== DETECT CONTINUATION REQUESTS ====================
    # A continuation happens when we have only 2 messages: user + assistant (no full history)
    # This indicates the frontend is asking to continue from where the previous response was cut off
    is_continuation_request = False
    user_messages_count = sum(1 for m in final_messages if isinstance(m, dict) and m.get('role') == 'user')
    assistant_messages_count = sum(1 for m in final_messages if isinstance(m, dict) and m.get('role') == 'assistant')
    
    if user_messages_count == 1 and assistant_messages_count >= 1:
        # Check if the assistant message already has content (incomplete response)
        last_assistant = next((m for m in reversed(final_messages) if isinstance(m, dict) and m.get('role') == 'assistant'), None)
        if last_assistant and last_assistant.get('content'):
            is_continuation_request = True
            print(f"🔄 CONTINUATION DETECTED: Will append to existing response without preamble")
            system_prompt += """\n\n═══════════════════════════════════════════\n⚠️ CONTINUATION MODE: CRITICAL INSTRUCTIONS\n═══════════════════════════════════════════\nYou are CONTINUING a response that was interrupted.\n\n✅ MUST DO:\n1. Continue IMMEDIATELY with the next content\n2. NO preambles, greetings, or "Certainly" messages\n3. NO explanations like "Here's the continuation"\n4. NO section headers or reintroduction\n5. Write naturally from where the previous response ended\n\n❌ NEVER DO:\n- Do not start with "Certainly", "Sure", "Here's", "Let me continue"\n- Do not repeat what was already written\n- Do not add introductory text\n- Do not summarize the previous part\n\n✨ Just continue writing the next sentence/paragraph/code exactly as if you never stopped."""

    # Safe system prompt injection - add to both messages and final_messages
    if messages and messages[0].get('role') == 'system':
        messages[0]['content'] = system_prompt
    else:
        messages.insert(0, {'role': 'system', 'content': system_prompt})
    
    # Also update final_messages with system prompt
    if final_messages and final_messages[0].get('role') == 'system':
        final_messages[0]['content'] = system_prompt
    else:
        final_messages.insert(0, {'role': 'system', 'content': system_prompt})

    # ==================== IMAGE BEAUTIFICATION LOGIC ====================
    # Generate beautified version using DALL-E based on analysis
    beautified_image_url = None
    beautification_keywords = ["beautify", "enhance", "improve", "edit", "retouch", "upscale", "refine", "polish", "sharpen", "clarity", "quality"]
    is_beautification_request = False
    
    try:
        if image_urls_in_message and any(keyword in clean_content.lower() for keyword in beautification_keywords):
            is_beautification_request = True
            print(f"📸 Image beautification requested - will generate enhanced version")
            # Modify the prompt to ask for improvement suggestions
            if final_messages and len(final_messages) > 0:
                last_msg = final_messages[-1]
                if isinstance(last_msg, dict) and last_msg.get('role') == 'user':
                    if isinstance(last_msg.get('content'), list):
                        # Update the text content in the vision message
                        updated = False
                        for item in last_msg['content']:
                            if isinstance(item, dict) and item.get('type') == 'text':
                                item['text'] = f"""Please analyze this image in detail for beautification/enhancement purposes. Provide:
1. Current image quality assessment (clarity, colors, lighting, composition)
2. Specific improvements that could be made
3. Suggestions for enhancement (contrast, saturation, sharpness, etc.)
4. Overall beautification recommendations

Be specific and practical in your suggestions."""
                                updated = True
                                print(f"✅ Beautification prompt updated for Vision API analysis")
                                break
                        if not updated:
                            print(f"⚠️ Could not find text item in message content")
    except Exception as e:
        print(f"⚠️ Error during beautification prompt setup: {type(e).__name__} - {str(e)}")
        # Continue with normal processing if prompt setup fails

    # AI streaming response
    # Dynamically adjust max_tokens based on content size
    estimated_tokens = count_tokens_estimate("".join([m.get('content', '') for m in messages if isinstance(m, dict)]))
    
    # For large code, use more tokens for response
    if is_large_code or estimated_tokens > 4000:
        max_tokens_response = 3000  # Increased for large code analysis
        print(f"🔧 Large code detected ({estimated_tokens} tokens estimated) - Using {max_tokens_response} max tokens")
    else:
        max_tokens_response = 2000  # Increased from 1000 for better responses
    
    try:
        response = openai_client.chat.completions.create(
            model=getattr(payload, "model", None) or "gpt-4o-mini",
            messages=final_messages,
            temperature=0.7,
            max_tokens=max_tokens_response,
            stream=True,
            timeout=120  # 2 minutes timeout for large requests
        )
    except Exception as e:
        print(f"❌ OpenAI API Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

    def generate():
        # Send images immediately if available for PURE image requests (typed event)
        if fetch_images_upfront and image_urls:
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

        # ==================== GENERATE BEAUTIFIED IMAGE ====================
        beautified_image_url = None
        if is_beautification_request and image_urls_in_message:
            try:
                print(f"🎨 Generating beautified image version...")
                # Extract the enhancement suggestions from the response
                enhancement_prompt = f"""Based on this image analysis and improvement suggestions:
{full_reply}

Please generate a high-quality, professionally enhanced version of the image with:
- Improved clarity and sharpness
- Enhanced colors and contrast
- Better lighting and composition
- Professional polish and refinement

Create a beautiful, polished version that addresses the suggested improvements."""

                # Generate beautified image using DALL-E
                beautified_response = openai_client.images.generate(
                    model="dall-e-3",
                    prompt=enhancement_prompt,
                    size="1024x1024",
                    quality="hd",
                    n=1,
                )
                beautified_image_url = beautified_response.data[0].url
                print(f"✅ Beautified image generated: {beautified_image_url}")
                
                # Send beautified image to frontend
                yield f"data: {json.dumps({'type': 'beautified_image', 'data': beautified_image_url})}\n\n"
            except Exception as e:
                print(f"⚠️ Error generating beautified image: {str(e)}")
                # Continue without beautified image if generation fails

        # For explanation requests, use SerpAPI AI Mode ONLY
        explanation_images = []
        # DISABLED: No images with explanations - only show images for pure image requests
        # if fetch_images_from_response and not fetch_images_upfront:
        #     try:
        #         # Use the full explanation text as AI-mode query
        #         explanation_images = fetch_ai_mode_images(full_reply)
        #         
        #         # Insert images contextually in the middle of the content
        #         if explanation_images:
        #             full_reply = insert_images_contextually(full_reply, explanation_images)
        #     except Exception as e:
        #         print("AI Mode explanation image error:", e)

        # Clean the full reply after accumulation
        # full_reply = clean_markdown(full_reply)  # Removed to allow markdown

        # Save chat to DB
        last_user_msg = next((m['content'] for m in reversed(messages) if m['role'] == 'user'), '')
        final_images = [beautified_image_url] if beautified_image_url else (explanation_images if fetch_images_from_response else image_urls)
        result = chats_collection.insert_one({
            "session_id": session_id,
            "email": email,
            "timestamp": now,
            "user_message": last_user_msg,
            "ai_reply": full_reply,
            "image_url": final_images
        })
        
        # Send final response (typed event with all metadata)
        # Images are now embedded in the full_reply for explanation mode
        yield f"data: {json.dumps({'type': 'final', 'data': full_reply, 'images': final_images, 'message_id': str(result.inserted_id), 'finish_reason': finish_reason})}\n\n"

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
    
    # Check file size before processing
    file_size = 0
    file_content = await file.read()
    file_size = len(file_content)
    
    if file_size > 10000000:  # 10MB limit
        raise HTTPException(status_code=413, detail=f"File too large. Max 10MB. Got {file_size / (1024*1024):.1f} MB")
    
    print(f"📁 File upload: {file.filename} ({file_size / 1024:.1f} KB)")
    
    # Use a temporary file instead of a persistent uploads folder
    with tempfile.NamedTemporaryFile(delete=False, suffix=f".{ext}") as tmp:
        tmp.write(file_content)
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

    # For images, return a presigned URL so OpenAI Vision API can access it
    presigned_url = None
    if ext in ALLOWED_IMAGE_FORMATS:
        try:
            # Generate a presigned URL valid for 24 hours (86400 seconds)
            presigned_url = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': AWS_BUCKET, 'Key': s3_key},
                ExpiresIn=86400  # 24 hours
            )
            print(f"✅ Presigned URL generated for image: {presigned_url}")
        except Exception as e:
            print(f"❌ Error generating presigned URL: {e}")
            # Fallback to regular S3 URL
            presigned_url = f"https://{AWS_BUCKET}.s3.{AWS_REGION}.amazonaws.com/{s3_key}"

    return {"file_id": s3_key, "original_name": file.filename, "text": extracted_text, "s3_key": s3_key, "image_url": presigned_url if ext in ALLOWED_IMAGE_FORMATS else None}

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
