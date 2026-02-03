import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import remarkGfm from "remark-gfm";
import {
  FaThumbsUp,
  FaThumbsDown,
  FaCopy,
  FaUser,
  FaRobot,
  FaCheck,
  FaFile,
  FaFileAudio,
  FaFileVideo,
  FaFileImage,
  FaShareAlt,
  FaDownload,
  FaEdit,
  FaEye,
  FaTimes,
  FaVolumeUp,
} from "react-icons/fa";
import { downloadFile, forceDownload } from "./fileDownload";
import { detectLanguage, getLanguageName, getSpeechLanguageCode } from "../utils/languageDetector";
import { findBestVoice, logAvailableVoices } from "../utils/voiceSelector";
import style from "react-syntax-highlighter/dist/esm/styles/hljs/a11y-dark";

const CopyButton = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
   
    <button
      onClick={handleCopy}
      className="text-wheat hover:text-green-300 transition-colors flex items-center gap-1 text-base font-medium"
      title="Copy Code"
    >
      {copied ? <FaCheck size={14} className="text-green-400" /> : <FaCopy size={14} />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
};

const getFileIcon = (type) => {
  if (type.startsWith("image/")) return <FaFileImage />;
  if (type.startsWith("video/")) return <FaFileVideo />;
  if (type.startsWith("audio/")) return <FaFileAudio />;
  return <FaFile />;
};

const ChatWindow = ({ messages, bottomRef, onFeedback, onEditSave }) => {
  const [copiedId, setCopiedId] = useState(null);
  const [downloadMenuId, setDownloadMenuId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [previewFile, setPreviewFile] = useState(null);
  const [hoveredMessageId, setHoveredMessageId] = useState(null);
  const [speakingId, setSpeakingId] = useState(null); // Track which message is being spoken by ID
  const [detectedLanguages, setDetectedLanguages] = useState({}); // Cache detected languages

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleEditStart = (id, text) => {
    setEditingId(id);
    setEditText(text);
  };

  const handleEditSave = (id) => {
    const msgIndex = messages.findIndex(m => m.id === id);
    if (msgIndex >= 0 && editText.trim()) {
      messages[msgIndex].text = editText;
      setEditingId(null);
      
      // Call parent callback to resend edited message to AI
      if (onEditSave) {
        onEditSave(id, editText);
      }
      
      setEditText("");
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditText("");
  };

  // Log available voices on component mount (for debugging)
  useEffect(() => {
    logAvailableVoices();
  }, []);

  // Close download menu and reset hover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (downloadMenuId && !event.target.closest('.download-menu-container')) {
        setDownloadMenuId(null);
      }
      // Reset hover if clicking outside message areas
      if (!event.target.closest('.message-bubble')) {
        setHoveredMessageId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [downloadMenuId]);

  const handleDownload = (text, format) => {
    console.log('='.repeat(50));
    console.log('🔵 DOWNLOAD HANDLER CALLED');
    console.log('='.repeat(50));
    console.log('Parameters:', { 
      format, 
      textLength: text?.length,
      textType: typeof text,
      textPreview: text?.substring(0, 50) 
    });

    if (!text || text.length === 0) {
      console.error('🔴 ERROR: Text is empty or null');
      alert('❌ Cannot download - no text content');
      return;
    }
    
    let contentToDownload = text;

    // Extract content from code blocks if present
    const codeBlockRegex = /```([\s\S]*?)```/g;
    const matches = [...text.matchAll(codeBlockRegex)];

    if (matches.length > 0) {
      console.log('📦 Extracted content from code blocks');
      contentToDownload = matches.map(m => {
        let content = m[1];
        const firstLineEnd = content.indexOf('\n');
        if (firstLineEnd !== -1) {
          const firstLine = content.substring(0, firstLineEnd).trim();
          // If the first line looks like a language tag (alphanumeric, no spaces), remove it
          if (firstLine && !firstLine.includes(' ') && /^[a-zA-Z0-9+-]+$/.test(firstLine)) {
            content = content.substring(firstLineEnd + 1);
          }
        }
        return content.trim();
      }).join('\n\n');
    }

    console.log('✅ Text validation passed, calling downloadFile');
    downloadFile(contentToDownload, format);
    
    console.log('✅ downloadFile called, closing menu');
    setDownloadMenuId(null);
    console.log('='.repeat(50));
  };

  const handleSpeak = (text, messageId) => {
    // If already speaking this message, stop the speech
    if (speakingId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    // Improved text cleaning - be conservative to preserve content
    let plainText = text
      .replace(/```[\s\S]*?```/g, ' ') // Replace code blocks with space
      .replace(/`[^`]*`/g, ' ') // Replace inline code with space
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // Replace links [text](url) with just text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '') // Remove image syntax ![alt](url)
      .replace(/\*\*([^\*]+)\*\*/g, '$1') // Replace **bold** with bold text
      .replace(/\*([^\*]+)\*/g, '$1') // Replace *italic* with italic text
      .replace(/__([^_]+)__/g, '$1') // Replace __bold__ with text
      .replace(/_([^_]+)_/g, '$1') // Replace _italic_ with text
      .replace(/~~([^~]+)~~/g, '$1') // Replace ~~strikethrough~~ with text
      .replace(/#{1,6}\s+/g, '') // Remove heading markers (# ## ### etc)
      .replace(/^[-*+]\s+/gm, '') // Remove bullet points
      .replace(/^\d+\.\s+/gm, '') // Remove numbered lists
      .replace(/\n+/g, ' ') // Replace multiple newlines with space
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    console.log("📢 Speaking text:", plainText.substring(0, 100));

    if (!plainText) {
      alert('No text content to speak');
      return;
    }

    // Auto-detect language of the text
    let detectedLang = detectedLanguages[messageId];
    if (!detectedLang) {
      detectedLang = detectLanguage(text);
      console.log("🎤 Detected language:", detectedLang);
      setDetectedLanguages(prev => ({
        ...prev,
        [messageId]: detectedLang
      }));
    }

    // Create speech utterance
    const speech = new SpeechSynthesisUtterance(plainText);
    speech.lang = getSpeechLanguageCode(detectedLang);
    speech.rate = 1;
    speech.pitch = 1;
    speech.volume = 1;

    console.log("🔊 Starting speech synthesis in language:", speech.lang);

    // Find best voice for this language
    findBestVoice(detectedLang).then(voice => {
      if (voice) {
        speech.voice = voice;
        console.log(`✅ Using voice: ${voice.name} (${voice.lang})`);
      } else {
        console.warn(`⚠️ No voice found for ${detectedLang}, using system default`);
      }
      
      // Start speaking
      window.speechSynthesis.speak(speech);
    }).catch(err => {
      console.error("❌ Voice selection error:", err);
      // Still try to speak even if voice selection fails
      window.speechSynthesis.speak(speech);
    });

    // Handle when speech ends
    speech.onend = () => {
      console.log("✅ Speech ended");
      setSpeakingId(null);
    };

    speech.onerror = (e) => {
      console.error("❌ Speech error:", e.error);
      setSpeakingId(null);
    };

    setSpeakingId(messageId); // Set to message ID to track which message is speaking
  };

  return (
    <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-4 sm:space-y-6 bg-white flex flex-col">
      {messages.length === 0 && (
        <div className="text-center text-gray-400 mt-64 text-4xl font-semibold">
          What's on the agenda today?
        </div>
      )}
      {messages.map((msg, idx) => {
        const isUser = msg.role === "user";
        console.log("📦 MESSAGE OBJECT:", msg);
        // Use unique key: combination of index and timestamp to ensure uniqueness
        const uniqueKey = msg.id ? `${idx}-${msg.id}` : `msg-${idx}-${Date.now()}-${Math.random()}`;
        return (
          <div key={uniqueKey}>
            <div
              className={`flex gap-2 sm:gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div
                className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
                  isUser ? "bg-indigo-600" : "bg-green-600"
                }`}
                style={{ color: 'white' }}
              >
                {isUser ? <FaUser size={14} /> : <FaRobot size={16} />}
              </div>

              {/* Message Bubble */}
              <div 
                className={`flex flex-col relative min-w-0 ${isUser ? "items-end max-w-[80%] sm:max-w-[80%]" : "items-start max-w-[80%] sm:max-w-[85%]"}`}
              >
                <div
                  className={`px-3 sm:px-5 py-3 sm:py-4 rounded-2xl shadow-sm transition-all message-bubble max-w-full ${
                    isUser
                      ? `bg-gray-200 text-black rounded-tr-none`
                      : "bg-gray-50 text-gray-800 rounded-tl-none border border-gray-200"
                  }`}
                  onMouseEnter={() => isUser && setHoveredMessageId(msg.id)}
                  onMouseLeave={() => isUser && setHoveredMessageId(null)}
                >
                  {/* Generated Images - Embedded in markdown + array storage */}
                  {msg.images && msg.images.length > 0 && (
                    <>
                      {console.log('🖼️ Rendering images from array:', msg.images)}
                      <div className="mb-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {msg.images
                          .filter(item => item) // Filter out empty/null
                          .map((item, idx) => {
                            // Handle both old format (string URL) and new format (object with title and image)
                            const imgUrl = typeof item === 'string' ? item : item?.image;
                            const imgTitle = typeof item === 'string' ? null : item?.title;
                            
                            return (
                              <div key={idx} className="flex flex-col items-center relative group">
                                <img
                                  src={imgUrl}
                                  alt={imgTitle || `Generated ${idx + 1}`}
                                  className="rounded-lg w-full h-auto border border-gray-200 shadow-md hover:shadow-lg transition-shadow"
                                  loading="lazy"
                                  onError={(e) => {
                                    console.error('❌ Image load error for:', imgUrl);
                                    e.target.style.display = 'none';
                                  }}
                                  onLoad={() => console.log('✅ Image loaded:', imgUrl)}
                                />
                                {/* Download button for beautified images */}
                                {msg.beautified && (
                                  <button
                                    onClick={() => {
                                      const a = document.createElement('a');
                                      a.href = imgUrl;
                                      a.download = `beautified-image-${idx + 1}.jpg`;
                                      document.body.appendChild(a);
                                      a.click();
                                      document.body.removeChild(a);
                                    }}
                                    className="absolute top-2 right-2 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Download beautified image"
                                  >
                                    <FaDownload size={14} />
                                  </button>
                                )}
                                {imgTitle && (
                                  <p className="text-base text-center text-gray-600 mt-2 line-clamp-2">{imgTitle}</p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </>
                  )}

                  {/* Text Content */}
                  <div className={`text-base sm:text-lg leading-relaxed wrap-break-word max-w-full overflow-hidden ${isUser ? "text-black" : "text-gray-800"}`}>
                    {isUser ? (
                      editingId === msg.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-black text-lg"
                            rows="4"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleEditSave(msg.id)}
                              className="px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleEditCancel}
                              className="px-3 py-1 bg-gray-400 text-white text-sm rounded hover:bg-gray-500 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      )
                    ) : (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          code({ node, inline, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || "");
                            return !inline && match ? (
                              <div className="rounded-lg overflow-hidden my-4 border border-gray-700 shadow-md max-w-full">
                                {/* VSCode-like Header */}
                                <div className="bg-[#1e1e1e] px-4 py-3 flex justify-between items-center border-b border-gray-700">
                                  <span className="text-base text-gray-300 font-mono font-bold uppercase">
                                    {match[1]}
                                  </span>
                                  <CopyButton text={String(children).replace(/\n$/, "")} />
                                </div>
                                <SyntaxHighlighter
  style={vscDarkPlus}
  language={match[1]}
  PreTag="div"
  wrapLongLines={true}   // ⭐ IMPORTANT
  customStyle={{
    margin: 0,
    padding: "1rem",
    borderRadius: 0,
    fontSize: "1em",
    lineHeight: "1.6",
    maxWidth: "100%",
    overflowX: "auto",
    wordBreak: "break-word",
    whiteSpace: "pre-wrap",
  }}
>
  {String(children).replace(/\n$/, "")}
</SyntaxHighlighter>

                              </div>
                            ) : (
                              <code
                                className={`${
                                  className || ""
                                } bg-gray-200 text-red-600 px-1.5 py-0.5 rounded text-sm font-mono`}
                                {...props}
                              >
                                {children}
                              </code>
                            );
                          },
                          p: ({ node, ...props }) => <p className="mb-3 last:mb-0" {...props} />,
                          ul: ({ node, ...props }) => <ul className="list-disc ml-5 mb-3 space-y-1" {...props} />,
                          ol: ({ node, ...props }) => <ol className="list-decimal ml-5 mb-3 space-y-1" {...props} />,
                          li: ({ node, ...props }) => <li className="pl-1" {...props} />,
                         
                         a: ({ node, ...props }) => {
                            const href = props.href || "";
                            const text = String(
                              props.children || "",
                            ).toLowerCase();

                            // Regular external links - open in new tab
                            const handleClick = (e) => {
                              if (!href || href === '#' || href.startsWith('#')) {
                                e.preventDefault();
                                e.stopPropagation();
                              } else {
                                // Allow normal link behavior for external URLs
                                // But open in new tab
                                if (e.ctrlKey || e.metaKey || e.button === 1) {
                                  return; // Let browser handle ctrl/cmd click
                                }
                                e.preventDefault();
                                window.open(href, "_blank");
                              }
                            };

                            return (
                              <a
                                href={href}
                                onClick={handleClick}
                                className="text-blue-600 hover:underline font-medium cursor-pointer"
                                target={href && !href.startsWith('#') ? "_blank" : undefined}
                                rel="noopener noreferrer"
                              >
                                {props.children}
                              </a>
                            );
                          },


                          h1: ({ node, ...props }) => <h1 className="text-3xl font-bold mb-4 mt-6 border-b pb-2" {...props} />,
                          h2: ({ node, ...props }) => <h2 className="text-2xl font-bold mb-3 mt-5" {...props} />,
                          h3: ({ node, ...props }) => <h3 className="text-xl font-bold mb-2 mt-4" {...props} />,
                          blockquote: ({ node, ...props }) => (
                            <blockquote className="border-l-4 border-indigo-300 pl-4 italic text-gray-600 my-4 bg-gray-50 py-2 rounded-r" {...props} />
                          ),
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                    )}
                  </div>

                  {/* Attached Files (User) */}
                  {(msg.files && msg.files.length > 0 || msg.attachedFiles && msg.attachedFiles.length > 0 || msg.fileDataUrls) && (
                    <div className="mt-3 flex flex-col gap-3 pt-3 border-t border-white/20">
                      {/* Image Previews - Handle both File objects and stored data URLs */}
                      {msg.attachedFiles && msg.attachedFiles.filter(f => f && f.type && f.type.startsWith("image/")).map((f, i) => {
                        const src = f instanceof File ? URL.createObjectURL(f) : (msg.fileDataUrls?.images?.[i] || URL.createObjectURL(f));
                        return (
                          <div key={`img-${i}`} className="relative group">
                            <img
                              src={src}
                              alt={f.name}
                              className="max-w-full max-h-64 rounded-lg border border-white/30 shadow-sm hover:shadow-md transition-shadow"
                              onError={(e) => e.target.style.display = "none"}
                            />
                          </div>
                        );
                      })}

                      {/* Audio Previews - Handle both File objects and stored data URLs */}
                      {msg.attachedFiles && msg.attachedFiles.filter(f => f && f.type && f.type.startsWith("audio/")).map((f, i) => {
                        const src = f instanceof File ? URL.createObjectURL(f) : (msg.fileDataUrls?.audio?.[i] || URL.createObjectURL(f));
                        return (
                          <div key={`audio-${i}`} className="flex items-center gap-2 bg-white/10 p-2 rounded-lg">
                            <FaFileAudio className="text-green-500" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate text-white/80">{f.name}</p>
                              <audio src={src} controls className="w-full h-6 mt-1" />
                            </div>
                          </div>
                        );
                      })}

                      {/* Video Previews - Handle both File objects and stored data URLs */}
                      {msg.attachedFiles && msg.attachedFiles.filter(f => f && f.type && f.type.startsWith("video/")).map((f, i) => {
                        const src = f instanceof File ? URL.createObjectURL(f) : (msg.fileDataUrls?.video?.[i] || URL.createObjectURL(f));
                        return (
                          <div key={`video-${i}`} className="relative">
                            <video
                              src={src}
                              controls
                              className="max-w-full max-h-64 rounded-lg border border-white/30 shadow-sm hover:shadow-md transition-shadow"
                            />
                          </div>
                        );
                      })}

                      {/* Other Files */}
                      {msg.files && msg.files.filter(f => f && f.type && !f.type.startsWith("image/") && !f.type.startsWith("audio/") && !f.type.startsWith("video/")).map((f, i) => (
                        <button
                          key={`file-${i}`}
                          className="text-sm bg-white/20 hover:bg-white/30 px-2 py-1 rounded flex items-center gap-1 transition text-white/80 hover:text-white"
                          title="File attachment"
                        >
                          {getFileIcon(f.type)} {f.name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ACTION BUTTONS - Copy, Edit (Inside bubble, bottom right) - ONLY for user messages - Show ONLY on hover of that specific user message */}
                  {isUser && !editingId && hoveredMessageId === msg.id && (
                    <div className="flex gap-3 mt-4 pt-3 border-t border-gray-300 justify-end flex-wrap">
                      {/* COPY */}
                      <button
                        onClick={() => handleCopy(msg.id, msg.text)}
                        className={`text-base flex items-center gap-1 ${
                          copiedId === msg.id
                            ? "text-green-600 font-semibold"
                            : "text-gray-600 hover:text-gray-800"
                        }`}
                        title="Copy"
                      >
                        {copiedId === msg.id ? (
                          <>
                            <FaCheck size={14} /> Copied
                          </>
                        ) : (
                          <>
                            <FaCopy size={14} /> Copy
                          </>
                        )}
                      </button>

                      {/* EDIT */}
                      <button
                        onClick={() => handleEditStart(msg.id, msg.text)}
                        className="text-gray-600 hover:text-gray-800 text-base flex items-center gap-1"
                        title="Edit"
                      >
                        <FaEdit size={14} /> Edit
                      </button>
                    </div>
                  )}

                  {/* ACTION BUTTONS - Copy, Share, Download, Like, Dislike (Inside bubble, bottom right) - Show after response completes */}
                  {!isUser && msg.isComplete && (
                    <div className="flex gap-2 mt-4 pt-3 border-t border-gray-200 justify-end flex-wrap items-center">
                    {/* COPY */}
                    <button
                      onClick={() => handleCopy(msg.id, msg.text)}
                      className={`text-sm md:text-base flex items-center gap-1 px-2 py-1 rounded ${
                        copiedId === msg.id
                          ? "text-green-600 font-semibold"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                      title="Copy"
                    >
                      <FaCopy size={12} /> <span className="hidden sm:inline">Copy</span>
                    </button>

                    {/* SHARE */}
                    <button
                      onClick={() =>
                        navigator.share
                          ? navigator.share({ text: msg.text })
                          : alert("Share not supported")
                      }
                      className="text-gray-500 hover:text-gray-700 text-xs md:text-sm flex items-center gap-1 px-2 py-1 rounded"
                      title="Share"
                    >
                      <FaShareAlt size={12} /> <span className="hidden sm:inline">Share</span>
                    </button>

                    {/* DOWNLOAD DROPDOWN */}
                    {/* COMMENTED OUT - Auto-download now handled based on user prompts */}
                    {/*
                    <div className="relative download-menu-container">
                      <button
                        onClick={() => setDownloadMenuId(downloadMenuId === msg.id ? null : msg.id)}
                        className="text-gray-500 hover:text-gray-700 text-sm md:text-base flex items-center gap-1 px-2 py-1 rounded"
                        title="Download as..."
                      >
                        <FaDownload size={12} /> <span className="hidden sm:inline">Download</span>
                      </button>
                      
                      {/* Dropdown Menu *//*}
                      {downloadMenuId === msg.id && (
                        <div className="absolute right-0 mt-1 bg-white border border-gray-300 rounded-md shadow-lg z-50 min-w-max">
                          <button
                            onClick={() => handleDownload(msg.text, 'txt')}
                            className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 border-b border-gray-200 transition"
                          >
                            📄 TXT (Text)
                          </button>
                          <button
                            onClick={() => handleDownload(msg.text, 'doc')}
                            className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 border-b border-gray-200 transition"
                          >
                            📘 DOCX (Word)
                          </button>
                          <button
                            onClick={() => handleDownload(msg.text, 'ppt')}
                            className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 border-b border-gray-200 transition"
                          >
                            🎨 PPTX (PowerPoint)
                          </button>
                          <button
                            onClick={() => handleDownload(msg.text, 'pdf')}
                            className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition"
                          >
                            📕 PDF
                          </button>
                        </div>
                      )}
                    </div>
                    */}

                    {/* LIKE */}
                    <button
                      onClick={() =>
                        onFeedback(
                          msg.id,
                          msg.feedback === "like" ? null : "like"
                        )
                      }
                      className={`transition text-xs md:text-sm flex items-center gap-1 px-2 py-1 rounded ${
                        msg.feedback === "like"
                          ? "text-green-600"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                      title="Like"
                    >
                      <FaThumbsUp size={12} /> <span className="hidden sm:inline">Like</span>
                    </button>

                    {/* DISLIKE (hidden when liked) */}
                    {msg.feedback !== "like" && (
                      <button
                        onClick={() =>
                          onFeedback(
                            msg.id,
                            msg.feedback === "dislike" ? null : "dislike"
                          )
                        }
                        className={`transition text-sm md:text-base flex items-center gap-1 px-2 py-1 rounded ${
                          msg.feedback === "dislike"
                            ? "text-red-600"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                        title="Dislike"
                      >
                        <FaThumbsDown size={12} /> <span className="hidden sm:inline">Dislike</span>
                      </button>
                    )}
                    {/* SPEAKER */}
                    <button
                      onClick={() => handleSpeak(msg.text, msg.id)}
                      className={`text-sm md:text-base flex items-center gap-1 px-2 py-1 rounded transition ${
                        speakingId === msg.id
                          ? "text-red-600 hover:text-red-700 font-semibold"
                          : "text-gray-500 hover:text-gray-700"
                      }`}
                      title={speakingId === msg.id ? "Stop speaking" : "Speak"}
                    >
                      {speakingId === msg.id ? (
                        <>
                          <FaTimes size={12} /> <span className="hidden sm:inline">Stop</span>
                        </>
                      ) : (
                        <>
                          <FaVolumeUp size={12} /> <span className="hidden sm:inline">Speak</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
      {/* FILE PREVIEW MODAL */}
      {previewFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            {/* Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200 sticky top-0 bg-white">
              <h3 className="text-2xl font-semibold text-gray-800 truncate">{previewFile.name}</h3>
              <button
                onClick={() => setPreviewFile(null)}
                className="text-gray-500 hover:text-gray-700 transition"
              >
                <FaTimes size={20} />
              </button>
            </div>

            {/* Preview Content */}
            <div className="p-6">
              {previewFile.type.startsWith("image/") ? (
                <img src={previewFile.data} alt={previewFile.name} className="max-w-full h-auto rounded-lg shadow-md" />
              ) : previewFile.type.startsWith("video/") ? (
                <video
                  src={previewFile.data}
                  controls
                  className="max-w-full h-auto rounded-lg shadow-md"
                />
              ) : previewFile.type.startsWith("audio/") ? (
                <div className="space-y-4">
                  <audio src={previewFile.data} controls className="w-full" />
                  <p className="text-base text-gray-600">{previewFile.name}</p>
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-6 text-center">
                  <div className="text-5xl mb-4">{getFileIcon(previewFile.type)}</div>
                  <p className="text-gray-600 font-medium">{previewFile.name}</p>
                  <p className="text-base text-gray-500 mt-2">
                    {previewFile.type || "Unknown file type"}
                  </p>
                  <p className="text-sm text-gray-400 mt-4">
                    Preview not available for this file type
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}    </div>
  );
};

export default ChatWindow;
