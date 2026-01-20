from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse
from authlib.integrations.starlette_client import OAuth
from dotenv import load_dotenv
import os

load_dotenv()

router = APIRouter(prefix="/auth", tags=["Auth"])

oauth = OAuth()

# Normalize env values used for OAuth registration
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
if GOOGLE_CLIENT_ID:
    GOOGLE_CLIENT_ID = GOOGLE_CLIENT_ID.strip()
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
if GOOGLE_CLIENT_SECRET:
    GOOGLE_CLIENT_SECRET = GOOGLE_CLIENT_SECRET.strip()

oauth.register(
    name="google",
    client_id=GOOGLE_CLIENT_ID,
    client_secret=GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

# 🔐 LOGIN
@router.get("/google/login")
async def google_login(request: Request):
    redirect_uri = "http://127.0.0.1:8000/auth/google/callback"
    return await oauth.google.authorize_redirect(request, redirect_uri)

# 🔁 CALLBACK
@router.get("/google/callback")
async def google_callback(request: Request):
    token = await oauth.google.authorize_access_token(request)
    user = token.get("userinfo")

    email = user.get("email")

    # 🔁 Redirect back to React with email
    return RedirectResponse(
        url=f"http://localhost:5173/?email={email}"
    )
