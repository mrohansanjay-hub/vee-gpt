import { API_CONFIG } from "../config";
/**
 * Service to handle Speech-to-Text using OpenAI Whisper or Web Speech API.
 */

export const SPEECH_LANGUAGES = [
  { code: "en-US", name: "English (US)", isoCode: "en" },
  { code: "hi-IN", name: "Hindi", isoCode: "hi" },
  { code: "te-IN", name: "Telugu", isoCode: "te" },
  { code: "ur-PK", name: "Urdu", isoCode: "ur" },
  { code: "es-ES", name: "Spanish", isoCode: "es" },
  { code: "fr-FR", name: "French", isoCode: "fr" },
  { code: "ta-IN", name: "Tamil", isoCode: "ta" },
  { code: "kn-IN", name: "Kannada", isoCode: "kn" },
  { code: "ml-IN", name: "Malayalam", isoCode: "ml" },
  { code: "mr-IN", name: "Marathi", isoCode: "mr" },
  { code: "gu-IN", name: "Gujarati", isoCode: "gu" },
  { code: "bn-IN", name: "Bengali", isoCode: "bn" },
  { code: "pa-IN", name: "Punjabi", isoCode: "pa" },
  { code: "de-DE", name: "German", isoCode: "de" },
  { code: "it-IT", name: "Italian", isoCode: "it" },
  { code: "ja-JP", name: "Japanese", isoCode: "ja" },
  { code: "ko-KR", name: "Korean", isoCode: "ko" },
  { code: "zh-CN", name: "Chinese (Simplified)", isoCode: "zh" },
  { code: "ru-RU", name: "Russian", isoCode: "ru" },
  { code: "ar-SA", name: "Arabic", isoCode: "ar" },
];

// ==========================================
// OPTION 1: OpenAI Whisper (Auto-detects language)
// ==========================================

/**
 * Starts recording audio and returns a controller to stop and transcribe.
 * Uses OpenAI Whisper API which supports auto-language detection.
 * If no language is specified, Whisper will auto-detect.
 */
export const startWhisperRecording = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mediaRecorder = new MediaRecorder(stream);
  const audioChunks = [];

  mediaRecorder.ondataavailable = (event) => {
    audioChunks.push(event.data);
  };

  mediaRecorder.start();

  return {
    /**
     * Stops recording and sends audio to OpenAI Whisper for transcription.
     * Auto-detects language if not specified.
     * @param {string} apiKey - OpenAI API Key
     * @param {string} [langCode] - Optional language code (e.g., "en-US", "hi-IN")
     * @returns {Promise<{text: string, language: string}>} Transcribed text and detected language
     */
    stopAndTranscribe: async (apiKey, langCode) => {
      return new Promise((resolve, reject) => {
        mediaRecorder.onstop = async () => {
          const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          stream.getTracks().forEach(track => track.stop()); // Stop mic

          const formData = new FormData();
          formData.append("file", audioBlob, "speech.webm");
          formData.append("model", "whisper-1");

          // If a language code is provided, pass the ISO-639-1 code (e.g., "fr", "hi") to Whisper
          // This improves accuracy. If not provided, Whisper will auto-detect.
          if (langCode) {
            const isoCode = langCode.split("-")[0];
            formData.append("language", isoCode);

            // Add a prompt to guide Whisper to the correct language, helpful for short audio
            const langName = SPEECH_LANGUAGES.find(l => l.code === langCode)?.name;
            if (langName) {
              formData.append("prompt", `This is a transcription in ${langName}.`);
            }
          } else {
            console.log("SpeechService: No language code provided. Whisper will auto-detect language.");
          }

          try {
            const response = await fetch(API_CONFIG.openaiWhisper, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${apiKey}`,
              },
              body: formData,
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            
            // Return both the transcribed text and detected language
            resolve({
              text: data.text,
              language: data.language || "unknown" // Whisper also returns the detected language
            });
          } catch (error) {
            reject(error);
          }
        };
        mediaRecorder.stop();
      });
    }
  };
};

// ==========================================
// OPTION 2: Web Speech API (Manual Language Selection)
// ==========================================

/**
 * Returns a SpeechRecognition instance configured for the specific language.
 * Note: Web Speech API only supports ONE language at a time.
 */
export const getSpeechRecognition = (langCode = "en-US") => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.error("Speech Recognition not supported in this browser.");
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = langCode;
  recognition.continuous = false;
  recognition.interimResults = true;
  
  return recognition;
};