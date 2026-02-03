/**
 * Voice selector for Web Speech API
 * Handles voice selection with fallbacks for unsupported languages
 */

// Map of language codes to their fallback options
const languageFallbacks = {
  "te-IN": ["te-IN", "hi-IN", "en-IN", "en-US"], // Telugu fallback to Hindi, then English
  "ta-IN": ["ta-IN", "hi-IN", "en-IN", "en-US"], // Tamil fallback
  "kn-IN": ["kn-IN", "hi-IN", "en-IN", "en-US"], // Kannada fallback
  "ml-IN": ["ml-IN", "hi-IN", "en-IN", "en-US"], // Malayalam fallback
  "mr-IN": ["mr-IN", "hi-IN", "en-IN", "en-US"], // Marathi fallback
  "gu-IN": ["gu-IN", "hi-IN", "en-IN", "en-US"], // Gujarati fallback
  "bn-IN": ["bn-IN", "hi-IN", "en-IN", "en-US"], // Bengali fallback
  "pa-IN": ["pa-IN", "hi-IN", "en-IN", "en-US"], // Punjabi fallback
  "ur-PK": ["ur-PK", "hi-IN", "ar-SA", "en-US"], // Urdu fallback
  "ar-SA": ["ar-SA", "ar-AE", "en-US"],          // Arabic fallback
  "zh-CN": ["zh-CN", "zh-Hans-CN", "en-US"],    // Chinese fallback
  "ja-JP": ["ja-JP", "en-US"],                    // Japanese fallback
  "ko-KR": ["ko-KR", "en-US"],                    // Korean fallback
  "hi-IN": ["hi-IN", "en-IN", "en-US"],          // Hindi fallback
  "es-ES": ["es-ES", "es-MX", "en-US"],          // Spanish fallback
  "fr-FR": ["fr-FR", "fr-CA", "en-US"],          // French fallback
  "de-DE": ["de-DE", "en-US"],                    // German fallback
  "it-IT": ["it-IT", "en-US"],                    // Italian fallback
  "ru-RU": ["ru-RU", "en-US"],                    // Russian fallback
  "en-US": ["en-US", "en-GB", "en-IN"],          // English default
};

/**
 * Get available voices from the speech synthesis API
 * @returns {Promise<SpeechSynthesisVoice[]>} Array of available voices
 */
export const getAvailableVoices = async () => {
  return new Promise((resolve) => {
    const synthesis = window.speechSynthesis;
    
    // Voices are loaded asynchronously
    if (synthesis.getVoices().length > 0) {
      resolve(synthesis.getVoices());
    } else {
      // Wait for voices to load
      synthesis.onvoiceschanged = () => {
        resolve(synthesis.getVoices());
      };
    }
  });
};

/**
 * Find the best voice for a given language
 * @param {string} langCode - Language code (e.g., "te-IN", "hi-IN")
 * @returns {Promise<SpeechSynthesisVoice|null>} Best matching voice or null
 */
export const findBestVoice = async (langCode) => {
  try {
    const voices = await getAvailableVoices();
    
    if (!voices || voices.length === 0) {
      console.warn("❌ No voices available");
      return null;
    }
    
    console.log("🎙️ Available voices:", voices.map(v => `${v.name} (${v.lang})`).join(", "));
    
    // Get fallback options for this language
    const fallbacks = languageFallbacks[langCode] || [langCode, "en-US"];
    
    // Try each fallback option
    for (const fallback of fallbacks) {
      // Try exact match first
      const exactMatch = voices.find(v => v.lang === fallback);
      if (exactMatch) {
        console.log(`✅ Found exact voice match for ${fallback}: ${exactMatch.name}`);
        return exactMatch;
      }
      
      // Try prefix match (e.g., "te" matches "te-IN")
      const prefixMatch = voices.find(v => v.lang.startsWith(fallback.split("-")[0]));
      if (prefixMatch) {
        console.log(`✅ Found prefix voice match for ${fallback}: ${prefixMatch.name} (${prefixMatch.lang})`);
        return prefixMatch;
      }
    }
    
    // Ultimate fallback to English
    const englishVoice = voices.find(v => v.lang.startsWith("en"));
    if (englishVoice) {
      console.warn(`⚠️ No voice found for ${langCode}, falling back to English: ${englishVoice.name}`);
      return englishVoice;
    }
    
    console.warn(`⚠️ No suitable voice found, using first available: ${voices[0].name}`);
    return voices[0];
  } catch (error) {
    console.error("❌ Error finding voice:", error);
    return null;
  }
};

/**
 * Speak text in the best available voice for the given language
 * @param {string} text - Text to speak
 * @param {string} langCode - Language code
 * @returns {Promise<void>}
 */
export const speakInLanguage = async (text, langCode) => {
  try {
    const voice = await findBestVoice(langCode);
    
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = langCode;
    
    // Set voice if available
    if (voice) {
      speech.voice = voice;
      console.log(`🔊 Using voice: ${voice.name} for ${langCode}`);
    } else {
      console.warn(`⚠️ No voice available for ${langCode}`);
    }
    
    speech.rate = 1;
    speech.pitch = 1;
    speech.volume = 1;
    
    window.speechSynthesis.speak(speech);
    
    return speech;
  } catch (error) {
    console.error("❌ Error speaking text:", error);
    throw error;
  }
};

/**
 * Check if a specific language has voice support
 * @param {string} langCode - Language code
 * @returns {Promise<boolean>} True if language has voice support
 */
export const hasVoiceSupport = async (langCode) => {
  try {
    const voices = await getAvailableVoices();
    const hasExact = voices.some(v => v.lang === langCode);
    const hasPrefix = voices.some(v => v.lang.startsWith(langCode.split("-")[0]));
    return hasExact || hasPrefix;
  } catch (error) {
    console.error("❌ Error checking voice support:", error);
    return false;
  }
};

/**
 * Log available voices for debugging
 */
export const logAvailableVoices = async () => {
  try {
    const voices = await getAvailableVoices();
    console.log("📋 All Available Voices:");
    voices.forEach((voice, index) => {
      console.log(`${index + 1}. ${voice.name} - ${voice.lang} (${voice.default ? "DEFAULT" : ""})`);
    });
  } catch (error) {
    console.error("❌ Error logging voices:", error);
  }
};
