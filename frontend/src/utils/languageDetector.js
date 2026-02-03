// Simple language detection based on character ranges and keywords
export const detectLanguage = (text) => {
  if (!text) return "en-US";
  
  // Remove markdown and special characters to get clean text for detection
  const cleanText = text.replace(/[`*_~\[\]\(\){}#]/g, '').trim();
  
  // Telugu script detection (Unicode range U+0C00–U+0C7F)
  if (/[\u0C00-\u0C7F]/.test(cleanText)) {
    console.log("🎯 Detected Telugu");
    return "te-IN";
  }
  
  // Hindi script detection (Devanagari U+0900–U+097F)
  if (/[\u0900-\u097F]/.test(cleanText)) {
    console.log("🎯 Detected Hindi");
    return "hi-IN";
  }
  
  // Tamil script detection (U+0B80–U+0BFF)
  if (/[\u0B80-\u0BFF]/.test(cleanText)) {
    console.log("🎯 Detected Tamil");
    return "ta-IN";
  }
  
  // Kannada script detection (U+0C80–U+0CFF)
  if (/[\u0C80-\u0CFF]/.test(cleanText)) {
    console.log("🎯 Detected Kannada");
    return "kn-IN";
  }
  
  // Malayalam script detection (U+0D00–U+0D7F)
  if (/[\u0D00-\u0D7F]/.test(cleanText)) {
    console.log("🎯 Detected Malayalam");
    return "ml-IN";
  }
  
  // Marathi script detection (Uses Devanagari + keywords)
  if (/[\u0900-\u097F]/.test(cleanText)) {
    console.log("🎯 Detected Marathi");
    return "mr-IN";
  }
  
  // Gujarati script detection (U+0A80–U+0AFF)
  if (/[\u0A80-\u0AFF]/.test(cleanText)) {
    console.log("🎯 Detected Gujarati");
    return "gu-IN";
  }
  
  // Bengali script detection (U+0980–U+09FF)
  if (/[\u0980-\u09FF]/.test(cleanText)) {
    console.log("🎯 Detected Bengali");
    return "bn-IN";
  }
  
  // Punjabi script detection (Gurmukhi U+0A00–U+0A7F)
  if (/[\u0A00-\u0A7F]/.test(cleanText)) {
    console.log("🎯 Detected Punjabi");
    return "pa-IN";
  }
  
  // Urdu script detection (U+0600–U+06FF for Arabic/Persian)
  if (/[\u0600-\u06FF]/.test(cleanText)) {
    console.log("🎯 Detected Urdu/Arabic");
    return "ur-PK";
  }
  
  // Arabic script detection
  if (/[\u0600-\u06FF]/.test(cleanText)) {
    console.log("🎯 Detected Arabic");
    return "ar-SA";
  }
  
  // Chinese script detection (CJK Unified Ideographs)
  if (/[\u4E00-\u9FFF]/.test(cleanText)) {
    console.log("🎯 Detected Chinese");
    return "zh-CN";
  }
  
  // Japanese script detection (Hiragana, Katakana, Kanji)
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(cleanText)) {
    console.log("🎯 Detected Japanese");
    return "ja-JP";
  }
  
  // Korean script detection (Hangul)
  if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(cleanText)) {
    console.log("🎯 Detected Korean");
    return "ko-KR";
  }
  
  // Russian/Cyrillic detection
  if (/[\u0400-\u04FF]/.test(cleanText)) {
    console.log("🎯 Detected Russian");
    return "ru-RU";
  }
  
  // French/Spanish/German detection using keywords
  const lowerText = cleanText.toLowerCase();
  
  // Spanish keywords
  if (/\b(hola|buenos|gracias|por favor|¿cómo|español)\b/i.test(cleanText)) {
    console.log("🎯 Detected Spanish");
    return "es-ES";
  }
  
  // French keywords
  if (/\b(bonjour|merci|s'il|vous|français|excusez)\b/i.test(cleanText)) {
    console.log("🎯 Detected French");
    return "fr-FR";
  }
  
  // German keywords
  if (/\b(hallo|danke|bitte|deutsch|wie geht)\b/i.test(cleanText)) {
    console.log("🎯 Detected German");
    return "de-DE";
  }
  
  // Italian keywords
  if (/\b(ciao|grazie|prego|italiano|come stai)\b/i.test(cleanText)) {
    console.log("🎯 Detected Italian");
    return "it-IT";
  }
  
  console.log("🎯 Defaulting to English");
  // Default to English
  return "en-US";
};

// Mapping of language codes to full names
export const getLanguageName = (langCode) => {
  const langMap = {
    "en-US": "English",
    "hi-IN": "Hindi",
    "te-IN": "Telugu",
    "ur-PK": "Urdu",
    "es-ES": "Spanish",
    "fr-FR": "French",
    "ta-IN": "Tamil",
    "kn-IN": "Kannada",
    "ml-IN": "Malayalam",
    "mr-IN": "Marathi",
    "gu-IN": "Gujarati",
    "bn-IN": "Bengali",
    "pa-IN": "Punjabi",
    "de-DE": "German",
    "it-IT": "Italian",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "zh-CN": "Chinese",
    "ru-RU": "Russian",
    "ar-SA": "Arabic",
  };
  return langMap[langCode] || "Unknown";
};

// Get the language code for Web Speech API (some require just the language part)
export const getSpeechLanguageCode = (langCode) => {
  // Most speech synthesis engines work with the full code, but some might need just the language
  return langCode;
};
