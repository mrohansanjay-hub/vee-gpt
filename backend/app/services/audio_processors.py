import os
import uuid
import shutil
from fastapi import UploadFile, HTTPException
import openai
from dotenv import load_dotenv

# --------------------------------------------------
# Load environment variables
# --------------------------------------------------
load_dotenv()

# Normalize OpenAI key (strip surrounding whitespace)
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
if OPENAI_API_KEY:
    OPENAI_API_KEY = OPENAI_API_KEY.strip()
if not OPENAI_API_KEY:
    raise RuntimeError("OPENAI_API_KEY not found in environment variables")

openai.api_key = OPENAI_API_KEY

# --------------------------------------------------
# Temp audio folder
# --------------------------------------------------
TEMP_AUDIO_DIR = "temp_audio"
os.makedirs(TEMP_AUDIO_DIR, exist_ok=True)

# --------------------------------------------------
# Supported audio formats
# --------------------------------------------------
ALLOWED_AUDIO_FORMATS = ["mp3", "wav", "m4a", "ogg", "webm"]

# --------------------------------------------------
# Transcribe audio using Whisper
# --------------------------------------------------
async def transcribe_audio(file: UploadFile) -> str:
    """
    Transcribes an uploaded audio file into text using OpenAI Whisper.
    """

    if not file:
        raise HTTPException(status_code=400, detail="No audio file provided")

    # Validate content type
    if not file.content_type or not file.content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="Uploaded file is not an audio file")

    # Validate extension
    ext = file.filename.split(".")[-1].lower()
    if ext not in ALLOWED_AUDIO_FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format '{ext}'. Supported formats: {ALLOWED_AUDIO_FORMATS}"
        )

    temp_filename = f"{uuid.uuid4()}.{ext}"
    temp_path = os.path.join(TEMP_AUDIO_DIR, temp_filename)

    try:
        # Save temp audio file
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Send to Whisper
        with open(temp_path, "rb") as audio_file:
            transcription = openai.audio.transcriptions.create(
                file=audio_file,
                model="whisper-1"
            )

        if not transcription or not transcription.text:
            raise HTTPException(status_code=500, detail="Failed to transcribe audio")

        return transcription.text.strip()

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Audio transcription failed: {str(e)}"
        )

    finally:
        # Cleanup temp file
        if os.path.exists(temp_path):
            os.remove(temp_path)

# --------------------------------------------------
# Transcribe audio from file path
# --------------------------------------------------
def transcribe_audio_from_path(file_path: str) -> str:
    """
    Transcribes an audio file from path using OpenAI Whisper.
    """
    ext = file_path.split(".")[-1].lower()
    if ext not in ALLOWED_AUDIO_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported audio format: {ext}")

    try:
        with open(file_path, "rb") as audio_file:
            transcription = openai.audio.transcriptions.create(
                file=audio_file,
                model="whisper-1"
            )

        if not transcription or not transcription.text:
            raise HTTPException(status_code=500, detail="Failed to transcribe audio")

        return transcription.text.strip()

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Audio transcription failed: {str(e)}")
