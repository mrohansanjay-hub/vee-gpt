import { useState, useEffect } from "react";
import { FaShareSquare, FaMailBulk, FaBars, FaGlobe } from "react-icons/fa";

// Language options for speech recognition
const LANGUAGES = [
  { code: "en-US", name: "🇬🇧 English" },
  { code: "hi-IN", name: "🇮🇳 Hindi" },
  { code: "te-IN", name: "🇮🇳 Telugu" },
  { code: "ur-PK", name: "🇵🇰 Urdu" },
  { code: "es-ES", name: "🇪🇸 Spanish" },
  { code: "fr-FR", name: "🇫🇷 French" },
  { code: "ta-IN", name: "🇮🇳 Tamil" },
  { code: "kn-IN", name: "🇮🇳 Kannada" },
  { code: "ml-IN", name: "🇮🇳 Malayalam" },
  { code: "mr-IN", name: "🇮🇳 Marathi" },
  { code: "gu-IN", name: "🇮🇳 Gujarati" },
  { code: "bn-IN", name: "🇧🇩 Bengali" },
  { code: "pa-IN", name: "🇮🇳 Punjabi" },
  { code: "de-DE", name: "🇩🇪 German" },
  { code: "it-IT", name: "🇮🇹 Italian" },
  { code: "ja-JP", name: "🇯🇵 Japanese" },
  { code: "ko-KR", name: "🇰🇷 Korean" },
  { code: "zh-CN", name: "🇨🇳 Chinese" },
  { code: "ru-RU", name: "🇷🇺 Russian" },
  { code: "ar-SA", name: "🇸🇦 Arabic" },
];

export default function MenuBar({ onShare, onContact, onToggleSidebar, language, onLanguageChange }) {
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  useEffect(() => {
    document.title = "Vee-GPT";
  }, []);

  return (
    <header className="w-full h-14 bg-gray-900 text-white flex items-center px-4 shadow-md relative">
      
      {/* LEFT - Sidebar Toggle (Mobile) */}
      <div className="flex-1 flex items-center">
        <button 
          onClick={onToggleSidebar}
          className="md:hidden text-white hover:text-purple-200 transition"
        >
          <FaBars size={20} />
        </button>
      </div>

      {/* CENTER */}
      <div className="flex-1 flex justify-center items-center">
        
        <span className="font-bold  tracking-wide" style={{fontSize:"18px"}}>Vee-GPT</span>
      </div>

      {/* RIGHT - Desktop */}
      <div className="flex flex-1 justify-end items-center gap-3 sm:gap-4 relative">

        {/* LANGUAGE SELECTOR */}
        <div className="relative">
          <button
            onClick={() => setShowLanguageMenu(!showLanguageMenu)}
            className="hover:text-purple-200 transition flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-800"
            title="Change language for speech recognition"
          >
            <FaGlobe size={18} />
            <span className="hidden sm:inline text-xs">{language?.split("-")[0].toUpperCase()}</span>
          </button>
          
          {showLanguageMenu && (
            <div className="absolute right-0 mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto w-48">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => {
                    onLanguageChange(lang.code);
                    setShowLanguageMenu(false);
                  }}
                  className={`block w-full text-left px-4 py-2 hover:bg-indigo-600 transition ${
                    language === lang.code ? "bg-indigo-500 text-white" : "text-gray-300"
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* SHARE */}
        <button
          onClick={onShare}
          className="hover:text-purple-200 transition"
          title="Share"
        >
          <FaShareSquare size={18} />
        </button>

        {/* CONTACT */}
        <button
          onClick={onContact}
          className="hover:text-purple-200 transition"
          title="Contact"
        >
          <FaMailBulk size={18} />
        </button>
      </div>
    </header>
  );
}
