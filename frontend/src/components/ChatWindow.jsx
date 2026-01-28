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
} from "react-icons/fa";
import { downloadFile } from "./fileDownload";

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
      className="text-gray-400 hover:text-white transition-colors flex items-center gap-1 text-xs"
      title="Copy Code"
    >
      {copied ? <FaCheck size={12} className="text-green-400" /> : <FaCopy size={12} />}
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

  return (
    <div className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-4 sm:space-y-6 bg-white flex flex-col scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
      {/* Hide scrollbar for Chrome, Safari, Edge */}
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
      `}</style>
      {messages.length === 0 && (
        <div className="text-center text-gray-400 mt-64 text-3xl font-semibold">
          What's on the agenda today?
        </div>
      )}
      {messages.map((msg, idx) => {
        const isUser = msg.role === "user";
        console.log("📦 MESSAGE OBJECT:", msg);
        return (
          <div key={msg.id || idx}>
            <div
              className={`flex gap-2 sm:gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}
            >
              {/* Avatar */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center shadow-sm ${
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
                              <div key={idx} className="flex flex-col items-center">
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
                                {imgTitle && (
                                  <p className="text-xs text-center text-gray-600 mt-2 line-clamp-2">{imgTitle}</p>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </>
                  )}

                  {/* Text Content */}
                  <div className={`text-xs sm:text-sm leading-relaxed break-words max-w-full overflow-hidden ${isUser ? "text-black" : "text-gray-800"}`}>
                    {isUser ? (
                      editingId === msg.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-black text-sm"
                            rows="4"
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() => handleEditSave(msg.id)}
                              className="px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition"
                            >
                              Save
                            </button>
                            <button
                              onClick={handleEditCancel}
                              className="px-3 py-1 bg-gray-400 text-white text-xs rounded hover:bg-gray-500 transition"
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
                                <div className="bg-[#1e1e1e] px-4 py-2 flex justify-between items-center border-b border-gray-700">
                                  <span className="text-xs text-gray-400 font-mono font-bold uppercase">
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
    fontSize: "0.85em",
    lineHeight: "1.5",
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
                                } bg-gray-200 text-red-600 px-1.5 py-0.5 rounded text-xs font-mono`}
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
                          a: ({ node, ...props }) => (
                            <a
                              className="text-blue-600 hover:underline font-medium"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => {
                                const href = props.href || '';
                                const isFake = href.includes('example.com') || href.includes('localhost') || href === '#' || href.includes('file.io') || href === '#download' || href.includes('sandbox:');
                                if (isFake) {
                                  e.preventDefault();
                                  let fmt = 'pdf';
                                  const textContent = String(props.children || '').toLowerCase();
                                  if (href.includes('.pdf') || textContent.includes('pdf')) fmt = 'pdf';
                                  else if (href.includes('.doc') || textContent.includes('word') || textContent.includes('doc')) fmt = 'doc';
                                  else if (textContent.includes('resume') || textContent.includes('cv')) fmt = 'doc';
                                  else if (href.includes('.ppt') || textContent.includes('ppt')) fmt = 'ppt';
                                  else if (href.includes('.txt') || textContent.includes('text')) fmt = 'txt';
                                  handleDownload(msg.text, fmt);
                                }
                              }}
                              {...props}
                            />
                          ),
                          h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 mt-6 border-b pb-2" {...props} />,
                          h2: ({ node, ...props }) => <h2 className="text-xl font-bold mb-3 mt-5" {...props} />,
                          h3: ({ node, ...props }) => <h3 className="text-lg font-bold mb-2 mt-4" {...props} />,
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
                  {msg.files && msg.files.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 pt-3 border-t border-white/20">
                      {msg.files.map((f, i) => (
                        <button
                          key={i}
                          onClick={() => setPreviewFile(f)}
                          className="text-xs bg-white/20 hover:bg-white/30 px-2 py-1 rounded flex items-center gap-1 transition"
                          title="Click to preview"
                        >
                          {getFileIcon(f.type)} {f.name}
                          <FaEye size={10} />
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
                        className={`text-sm flex items-center gap-1 ${
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
                        className="text-gray-600 hover:text-gray-800 text-sm flex items-center gap-1"
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
                      className={`text-xs md:text-sm flex items-center gap-1 px-2 py-1 rounded ${
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
                    <div className="relative download-menu-container">
                      <button
                        onClick={() => setDownloadMenuId(downloadMenuId === msg.id ? null : msg.id)}
                        className="text-gray-500 hover:text-gray-700 text-xs md:text-sm flex items-center gap-1 px-2 py-1 rounded"
                        title="Download as..."
                      >
                        <FaDownload size={12} /> <span className="hidden sm:inline">Download</span>
                      </button>
                      
                      {/* Dropdown Menu */}
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
                            className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 transition"
                          >
                            📕 PDF
                          </button>
                        </div>
                      )}
                    </div>

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
                        className={`transition text-xs md:text-sm flex items-center gap-1 px-2 py-1 rounded ${
                          msg.feedback === "dislike"
                            ? "text-red-600"
                            : "text-gray-500 hover:text-gray-700"
                        }`}
                        title="Dislike"
                      >
                        <FaThumbsDown size={12} /> <span className="hidden sm:inline">Dislike</span>
                      </button>
                    )}
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
              <h3 className="text-lg font-semibold text-gray-800 truncate">{previewFile.name}</h3>
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
                  <p className="text-sm text-gray-600">{previewFile.name}</p>
                </div>
              ) : (
                <div className="bg-gray-100 rounded-lg p-6 text-center">
                  <div className="text-5xl mb-4">{getFileIcon(previewFile.type)}</div>
                  <p className="text-gray-600 font-medium">{previewFile.name}</p>
                  <p className="text-sm text-gray-500 mt-2">
                    {previewFile.type || "Unknown file type"}
                  </p>
                  <p className="text-xs text-gray-400 mt-4">
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
