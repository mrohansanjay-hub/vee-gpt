import { API_CONFIG } from "../config";
/**
 * Service to handle Speech-to-Text using OpenAI Whisper or Web Speech API.
 */

export const SPEECH_LANGUAGES = [
  { code: "en-US", name: "English (US)" },
  { code: "hi-IN", name: "Hindi" },
  { code: "ta-IN", name: "Tamil" },
  { code: "te-IN", name: "Telugu" },
  { code: "kn-IN", name: "Kannada" },
  { code: "ml-IN", name: "Malayalam" },
  { code: "mr-IN", name: "Marathi" },
  { code: "gu-IN", name: "Gujarati" },
  { code: "bn-IN", name: "Bengali" },
  { code: "pa-IN", name: "Punjabi" },
  { code: "fr-FR", name: "French" },
  { code: "es-ES", name: "Spanish" },
  { code: "de-DE", name: "German" },
  { code: "it-IT", name: "Italian" },
  { code: "ja-JP", name: "Japanese" },
  { code: "ko-KR", name: "Korean" },
  { code: "zh-CN", name: "Chinese (Simplified)" },
  { code: "ru-RU", name: "Russian" },
  { code: "ar-SA", name: "Arabic" },
];

// ==========================================
// OPTION 1: OpenAI Whisper (Auto-detects language)
// ==========================================

/**
 * Starts recording audio and returns a controller to stop and transcribe.
 * Uses OpenAI Whisper API which supports auto-language detection.
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
     * @param {string} apiKey - OpenAI API Key
     * @param {string} [langCode] - Optional language code (e.g., "en-US", "hi-IN")
     * @returns {Promise<string>} Transcribed text
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
          // This improves accuracy and prevents auto-detecting English for other languages.
          if (langCode) {
            const isoCode = langCode.split("-")[0];
            formData.append("language", isoCode);

            // Add a prompt to guide Whisper to the correct language, helpful for short audio
            const langName = SPEECH_LANGUAGES.find(l => l.code === langCode)?.name;
            if (langName) {
              formData.append("prompt", `This is a transcription in ${langName}.`);
            }
          } else {
            console.warn("SpeechService: No language code provided. Whisper may default to English.");
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
            resolve(data.text);
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