# app/auth/google.py
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, JSONResponse
from urllib.parse import urlencode
import os
import requests
import uuid
from pymongo import MongoClient
from datetime import datetime

router = APIRouter()

# --------------------------------------------------
# Load environment variables
# --------------------------------------------------
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
if GOOGLE_CLIENT_ID:
    GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID.strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
if GOOGLE_CLIENT_SECRET:
    GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET.strip()
GOOGLE_REDIRECT_URI = os.getenv("GOOGLE_REDIRECT_URI", "http://localhost:8000/auth/google/callback")
if GOOGLE_REDIRECT_URI:
    GOOGLE_REDIRECT_URI = GOOGLE_REDIRECT_URI.strip()
MONGO_URI = os.getenv("MONGO_URI", "")
if MONGO_URI:
    MONGO_URI = MONGO_URI.strip()

if not all([GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI]):
    raise RuntimeError("Google OAuth credentials missing in .env")
if not MONGO_URI:
    raise RuntimeError("MONGO_URI missing in .env")

# MongoDB
client = MongoClient(MONGO_URI)
db = client["chatbotai_db"]
users_collection = db["users"]

# OAuth URLs
GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

# Scopes
SCOPE = "openid email profile"

# --------------------------------------------------
# Route: Login
# --------------------------------------------------
@router.get("/login")
def login():
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": SCOPE,
        "access_type": "offline",
        "prompt": "consent"
    }
    url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url)

# --------------------------------------------------
# Route: Callback
# --------------------------------------------------
@router.get("/callback")
def callback(request: Request, code: str = None, error: str = None):
    if error:
        return JSONResponse({"error": error}, status_code=400)

    if not code:
        return JSONResponse({"error": "Authorization code not provided"}, status_code=400)

    # Exchange code for tokens
    data = {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": GOOGLE_REDIRECT_URI,
        "grant_type": "authorization_code"
    }
    token_resp = requests.post(GOOGLE_TOKEN_URL, data=data)
    if token_resp.status_code != 200:
        return JSONResponse({"error": "Failed to get tokens", "details": token_resp.text}, status_code=400)

    tokens = token_resp.json()
    access_token = tokens.get("access_token")
    if not access_token:
        return JSONResponse({"error": "Access token missing"}, status_code=400)

    # Get user info
    headers = {"Authorization": f"Bearer {access_token}"}
    user_resp = requests.get(GOOGLE_USERINFO_URL, headers=headers)
    if user_resp.status_code != 200:
        return JSONResponse({"error": "Failed to fetch user info"}, status_code=400)

    user_info = user_resp.json()
    user_email = user_info.get("email")
    if not user_email:
        return JSONResponse({"error": "Email not available in user info"}, status_code=400)

    # Save or update user in DB
    user = users_collection.find_one({"email": user_email})
    now = datetime.utcnow()
    if not user:
        user_id = str(uuid.uuid4())
        users_collection.insert_one({
            "_id": user_id,
            "email": user_email,
            "name": user_info.get("name"),
            "picture": user_info.get("picture"),
            "created_at": now,
            "last_login": now
        })
    else:
        users_collection.update_one({"_id": user["_id"]}, {"$set": {"last_login": now}})

    # Store user info in session
    request.session["user"] = {
        "email": user_email,
        "name": user_info.get("name"),
        "picture": user_info.get("picture")
    }

    # Redirect to frontend with email and name params
    return RedirectResponse(url=f"http://localhost:5173/?email={user_email}&name={user_info.get('name', '')}")

# --------------------------------------------------
# Route: Get current logged-in user
# --------------------------------------------------
@router.get("/me")
def me(request: Request):
    user = request.session.get("user")
    if not user:
        return JSONResponse({"error": "Not logged in"}, status_code=401)
    return JSONResponse(user)

# --------------------------------------------------
# Route: Logout
# --------------------------------------------------
@router.get("/logout")
def logout(request: Request):
    request.session.clear()
    return RedirectResponse(url="http://localhost:5173")
