import subprocess
import os
from .audio_processors import transcribe_audio_from_path

def extract_text_from_video(video_path: str) -> str:
    """
    Extracts audio from video using ffmpeg and transcribes it using Whisper.
    """
    try:
        # Create temp audio path
        base_name = os.path.splitext(video_path)[0]
        audio_path = f"{base_name}_audio.wav"
        
        # Use ffmpeg to extract audio
        command = [
            'ffmpeg',
            '-i', video_path,
            '-vn',  # no video
            '-acodec', 'pcm_s16le',
            '-ar', '16000',  # 16kHz for better Whisper performance
            '-ac', '1',  # mono
            '-y',  # overwrite
            audio_path
        ]
        
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0:
            raise Exception(f"ffmpeg error: {result.stderr}")
        
        # Transcribe the audio
        text = transcribe_audio_from_path(audio_path)
        
        # Cleanup temp audio file
        os.remove(audio_path)
        
        return text
    except Exception as e:
        raise Exception(f"Failed to extract text from video: {str(e)}")