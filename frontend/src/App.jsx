import { useState, useEffect, useRef } from "react";
import {
  FaPaperclip,
  FaMicrophone,
  FaCamera,
  FaPaperPlane,
  FaFile,
  FaFileAudio,
  FaFileVideo,
  FaFileImage,
  FaBug,
  FaGoogle,
  FaArrowRight,
  FaChevronDown,
  FaBolt,
  FaStar,
  FaRobot,
  FaChevronUp,
  FaReact,
} from "react-icons/fa";

import ChatWindow from "./components/ChatWindow";
import PinDropdown from "./components/PinDropdown";
import MenuBar from "./components/MenuBar";
import Sidebar from "./components/Sidebar";
import { isDownloadRequest, triggerDownload } from "./utils/downloadManager";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL;

export default function App() {
  const generateSessionId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  // ==================== ENCRYPTION UTILITIES ====================
  // Simple encryption for email and session ID (obfuscation for URL safety)
  const encryptString = (str) => {
    try {
      return btoa(str); // Base64 encode
    } catch {
      return str;
    }
  };

  const decryptString = (str) => {
    try {
      return atob(str); // Base64 decode
    } catch {
      return str;
    }
  };

  // Mask email for display (show only first 2 chars and domain)
  const maskEmail = (email) => {
    if (!email) return "";
    const [name, domain] = email.split("@");
    if (!name || !domain) return email;
    return `${name.substring(0, 2)}****@${domain}`;
  };

  // ------------------ STATE ------------------
  const [messages, setMessages] = useState(() => {
    // Always start with empty messages (fresh chat on every page open)
    // Don't load from localStorage to prevent showing old chats
    return [];
  });
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(() => {
    // Always generate a fresh session ID (don't load from storage)
    // This ensures each page load creates a new chat
    const newSession = generateSessionId();
    sessionStorage.setItem("chat_session_id", newSession);
    return newSession;
  });
  
  // Load email from sessionStorage if present
  const [email, setEmail] = useState(() => {
    try {
      const stored = sessionStorage.getItem("user_email");
      if (stored) return stored;
      
      const saved = localStorage.getItem("user_email");
      if (saved) {
        sessionStorage.setItem("user_email", saved);
        return saved;
      }
      return "";
    } catch (error) {
      return "";
    }
  });
  const [pinOpen, setPinOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micBlink, setMicBlink] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [opencvReady, setOpencvReady] = useState(false);
  const [showComingSoonModal, setShowComingSoonModal] = useState(false);

  // Initialize attached files from localStorage on mount
  useEffect(() => {
    console.log("🔄 Attempting to restore attached files from localStorage...");
    try {
      const savedFilesData = localStorage.getItem("attached_files_data");
      if (savedFilesData) {
        const filesData = JSON.parse(savedFilesData);
        console.log("📦 Found saved files data:", filesData.length, "files");
        
        // Convert back to File objects
        const restoredFiles = filesData.map((fileData, idx) => {
          try {
            const binaryString = atob(fileData.data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            return new File([bytes], fileData.name, { type: fileData.type });
          } catch (err) {
            console.error(`Failed to restore file ${idx}:`, err);
            return null;
          }
        }).filter(f => f !== null);
        
        if (restoredFiles.length > 0) {
          setAttachedFiles(restoredFiles);
          console.log("✅ Restored", restoredFiles.length, "attached files from localStorage");
        }
      } else {
        console.log("ℹ️ No attached files found in localStorage");
      }
    } catch (error) {
      console.error("❌ Failed to restore attached files:", error);
    }
  }, []);

  // Save attached files to localStorage whenever they change
  useEffect(() => {
    try {
      if (attachedFiles.length > 0) {
        console.log("💾 Saving", attachedFiles.length, "files to localStorage...");
        const filesToSave = attachedFiles.map(file => {
          return {
            name: file.name,
            type: file.type,
            size: file.size,
            data: null // Will be filled after reading
          };
        });

        // Read files and convert to base64
        let filesProcessed = 0;
        filesToSave.forEach((fileData, idx) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              fileData.data = e.target.result.split(',')[1]; // Get base64 part
              filesProcessed++;
              if (filesProcessed === filesToSave.length) {
                localStorage.setItem("attached_files_data", JSON.stringify(filesToSave));
                console.log("✅ Successfully saved", filesToSave.length, "files to localStorage");
              }
            } catch (err) {
              console.error("Error processing file data:", err);
              filesProcessed++;
            }
          };
          reader.onerror = (err) => {
            console.error("FileReader error for file", idx, ":", err);
            filesProcessed++;
          };
          reader.readAsDataURL(attachedFiles[idx]);
        });
      } else {
        localStorage.removeItem("attached_files_data");
        console.log("🗑️ Cleared attached files from localStorage");
      }
    } catch (error) {
      console.error("Failed to save attached files:", error);
    }
  }, [attachedFiles]);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [name, setName] = useState("");

  const [showContact, setShowContact] = useState(false);
  const [feedbackType, setFeedbackType] = useState("Feedback");
  const [feedbackText, setFeedbackText] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showBugReport, setShowBugReport] = useState(false);
  const [bugText, setBugText] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllerRef = useRef(null);
  const [language, setLanguage] = useState("en-US");
  const [manualEmail, setManualEmail] = useState("");
  const [chatHistory, setChatHistory] = useState([]);
  const [model, setModel] = useState("gpt-4o-mini");
  const [modelOpen, setModelOpen] = useState(false);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // ------------------ REFS ------------------
  const bottomRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);
  const chatContainerRef = useRef(null);
  const textareaRef = useRef(null);

  // ------------------ LOAD OPENCV ------------------
  useEffect(() => {
    if (document.getElementById("opencv-script")) {
      if (window.cv) setOpencvReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "opencv-script";
    script.src = "https://docs.opencv.org/4.x/opencv.js";
    script.async = true;
    script.onload = () => {
      if (window.cv) {
        window.cv.onRuntimeInitialized = () => setOpencvReady(true);
      }
    };
    document.body.appendChild(script);
  }, []);

  // ------------------ CLOSE PIN DROPDOWN ------------------
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest(".pin-container")) setPinOpen(false);
      if (!e.target.closest(".model-selector-container")) setModelOpen(false);
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // ------------------ AUTO SCROLL ------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ------------------ SCROLL BUTTON VISIBILITY ------------------
  useEffect(() => {
    const handleScroll = () => {
      if (chatContainerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        // Show button if not at bottom (more than 200px from bottom)
        setShowScrollButton(scrollHeight - scrollTop - clientHeight > 200);
      }
    };

    const container = chatContainerRef.current;
    if (container) {
      container.addEventListener("scroll", handleScroll);
      return () => container.removeEventListener("scroll", handleScroll);
    }
  }, []);

  // ------------------ SCROLL TO BOTTOM ------------------
  const handleScrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // ------------------ PASTE IMAGE HANDLER ------------------
  const handlePaste = async (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let item of items) {
      // Check if clipboard contains image data
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          // Convert blob to File object
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: item.type });
          
          // Add to attached files
          setAttachedFiles((prev) => {
            const key = `${file.name}_${file.size}`;
            if (!prev.some((f) => `${f.name}_${f.size}` === key)) {
              return [...prev, file];
            }
            return prev;
          });
        }
        break; // Only process first image
      }
    }
  };

  // Attach paste handler to textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.addEventListener("paste", handlePaste);
      return () => textarea.removeEventListener("paste", handlePaste);
    }
  }, []);

  // ==================== PREVENT ACCIDENTAL PAGE RELOADS ====================
  // Intercept any unintended navigation or reload attempts
  useEffect(() => {
    const preventReload = (e) => {
      // Only prevent if we're in the middle of operations
      if (isProcessing || input.trim() || attachedFiles.length > 0) {
        // Allow user to close but prevent auto-refresh
        // Don't interfere with normal navigation
      }
    };

    window.addEventListener("beforeunload", preventReload);
    return () => window.removeEventListener("beforeunload", preventReload);
  }, [isProcessing, input, attachedFiles]);

  // ------------------ PERSISTENCE ------------------
  useEffect(() => {
    localStorage.setItem("chat_messages", JSON.stringify(messages));
    localStorage.setItem("chat_session_id", sessionId);
  }, [messages, sessionId]);

  // Keep URL clean - store sensitive data in sessionStorage, not URL
  useEffect(() => {
    // Store session ID and email in sessionStorage for privacy
    if (sessionId) {
      sessionStorage.setItem("chat_session_id", sessionId);
    }
    if (email) {
      sessionStorage.setItem("user_email", email);
    }
    
    // Keep URL clean with no sensitive parameters
    const params = new URLSearchParams(window.location.search);
    params.delete("session");
    params.delete("email");
    window.history.replaceState({}, document.title, `?${params.toString()}`);
  }, [sessionId, email]);

  // ------------------ HANDLE ACCOUNT ------------------
  const handleAccount = async (user) => {
    if (!user) {
      // LOGOUT: Clear everything immediately (but preserve attached files)
      const savedFiles = localStorage.getItem("attached_files_data"); // Save files before clearing
      
      setIsLoggedIn(false);
      setEmail("");
      setName("");
      setMessages([]);  // Clear current chat messages
      setChatHistory([]);  // Clear chat history
      setSessionId(generateSessionId());  // Reset session
      localStorage.removeItem('user');  // Remove user from localStorage
      localStorage.removeItem('chat_messages');  // Clear saved messages
      localStorage.removeItem('chat_session_id');  // Clear session ID
      setShowLoginModal(true);  // Show login popup immediately
      setSidebarOpen(false);  // Close sidebar
      
      // Restore attached files after clearing other data
      if (savedFiles) {
        localStorage.setItem("attached_files_data", savedFiles);
      }
      
      // Logout from backend session
      try {
        await fetch(`${API_URL}/auth/google/logout`);
      } catch (error) {
        console.error("Error logging out from backend:", error);
      }
    } else {
      setIsLoggedIn(true);
      setEmail(user.email);
      setName(user.name || "");
      setShowLoginModal(false);  // Close modal on login

      // 🔐 store email in DB
      try {
        const res = await fetch(`${API_URL}/auth/google/store-user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: user.email, name: user.name || "" }),
        });
        if (!res.ok) throw new Error("Failed to store user data");
        console.log("User stored successfully");
        fetchChatHistory(user.email);
      } catch (error) {
        console.error("Error storing user:", error);
      }
    }
  };

  // ------------------ HANDLE FILES SELECTED FROM DROPDOWN ------------------
  const handleFilesSelect = (files) => {
    // files may be an array of File objects
    if (!files || files.length === 0) return;
    setAttachedFiles((prev) => {
      // append new files, avoid duplicates by name+size
      const existingKeys = new Set(prev.map((f) => `${f.name}_${f.size}`));
      const toAdd = files.filter((f) => !existingKeys.has(`${f.name}_${f.size}`));
      const next = [...prev, ...toAdd];
      console.log("Attached files:", next);
      return next;
    });
    setPinOpen(false);  // Hide dropdown after attaching files
  };

  // ------------------ REMOVE SINGLE FILE ------------------
  const removeFile = (idx) => {
    setAttachedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  // ------------------ LOGIN MODAL & AUTH CHECK ------------------
  const [showLoginModal, setShowLoginModal] = useState(false);

  useEffect(() => {
    // 1. Check URL params (Callback from Google)
    const params = new URLSearchParams(window.location.search);
    const mail = params.get("email");
    const uname = params.get("name");
    
    if (mail) {
      const user = { email: mail, name: uname || "" };
      handleAccount(user);
      localStorage.setItem('user', JSON.stringify(user));
      // Clean URL
      window.history.replaceState({}, document.title, "/");
    } else {
      // 2. Check localStorage for persisted login
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        handleAccount(JSON.parse(savedUser));
      } else {
        // 3. Show modal if not logged in
        setShowLoginModal(true);
      }
    }
  }, []);

  // ------------------ CHAT HISTORY ------------------
  const fetchChatHistory = async (userEmail) => {
    if (!userEmail) return;
    try {
      const res = await fetch(`${API_URL}/chat/history?email=${userEmail}`);
      const data = await res.json();
      setChatHistory(data);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setSessionId(generateSessionId());
    if (email) fetchChatHistory(email);
    setSidebarOpen(false);
  };

  const handleLoadChat = async (sid) => {
    setSidebarOpen(false);
    if (!email) return;
    try {
      const res = await fetch(`${API_URL}/chat/history/${sid}?email=${email}`);
      const data = await res.json();
      // Map backend format to frontend format
      const formatted = [];
      
      for (const msg of data) {
        // If user message is "Continue generating", skip adding it to the UI
        if (msg.role === "user" && msg.text === "Continue generating") {
          continue;
        }
        
        // If it's an assistant message following a skipped "Continue", append to previous assistant message
        if (msg.role === "assistant" && formatted.length > 0 && formatted[formatted.length - 1].role === "assistant") {
          formatted[formatted.length - 1].text += msg.text;
          continue;
        }

        formatted.push({
          ...msg,
          files: [], 
          isHidden: false
        });
      }

      setMessages(formatted);
      setSessionId(sid);
    } catch (error) {
      console.error("Failed to load chat:", error);
    }
  };

  const handleUpdateChat = async (sid, updates) => {
    if (!email) return;
    try {
      await fetch(`${API_URL}/chat/history/${sid}?email=${email}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      // Refresh history to reflect changes
      fetchChatHistory(email);
    } catch (error) {
      console.error("Failed to update chat:", error);
    }
  };

  const handleDeleteChat = async (sid) => {
    if (!email) return;
    try {
      await fetch(`${API_URL}/chat/history/${sid}?email=${email}`, {
        method: "DELETE",
      });
      setChatHistory((prev) => prev.filter((c) => c.session_id !== sid));
      if (sessionId === sid) {
        setMessages([]);
        setSessionId(generateSessionId());
      }
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google/login`;
  };

  const handleManualLogin = async () => {
    if (!manualEmail.trim()) return;
    const user = { email: manualEmail, name: "" };
    await handleAccount(user);
    localStorage.setItem('user', JSON.stringify(user));
  };

  // ------------------ AUTH ACTION (MENU BUTTON) ------------------
  const handleAuthAction = () => {
    setSidebarOpen(false);
    if (isLoggedIn) {
      handleAccount(null); // Logout
    } else {
      setShowLoginModal(true); // Show Popup
    }
  };

  // ------------------ MENU HANDLERS ------------------
  const handleShare = async () => {
    const url = window.location.href;
    if (navigator.share) {
      await navigator.share({ title: "ChatbotAI", url });
    } else {
      await navigator.clipboard.writeText(url);
      alert("Link copied to clipboard!");
    }
  };

  const handleContact = () => setShowContact(true);

  // ------------------ SUBMIT FEEDBACK ------------------
  const submitFeedback = async () => {
    if (!feedbackText.trim()) {
      alert("Please enter a message");
      return;
    }

    try {
      await fetch(`${API_URL}/contact-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          type: feedbackType,
          message: feedbackText,
        }),
      });

      setFeedbackText("");
      setShowContact(false);
      alert("Thank you for your response!");
    } catch (err) {
      alert("Failed to submit feedback");
    }
  };

  // ------------------ HANDLE MESSAGE FEEDBACK ------------------
  const handleMessageFeedback = async (messageId, type) => {
    // Update local state to reflect feedback immediately (green/red color)
    setMessages((prevMessages) =>
      prevMessages.map((msg) =>
        msg.id === messageId ? { ...msg, feedback: type } : msg
      )
    );

    try {
      await fetch(`${API_URL}/message-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message_id: messageId,
          type,
          email,
        }),
      });
    } catch {
      // Silently fail or log to console
      console.error("Failed to record feedback");
    }
  };

  // ------------------ BUG REPORT ------------------
  const handleBugSubmit = async () => {
    if (!bugText.trim()) return;
    try {
      await fetch(`${API_URL}/contact-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          type: "Bug Report",
          message: bugText,
        }),
      });
      setBugText("");
      setShowBugReport(false);
      alert("Bug reported successfully!");
    } catch (error) {
      console.error("Error reporting bug:", error);
      alert("Failed to report bug.");
    }
  };
  

  // Handle edited message - resend to AI
  const handleEditSave = (messageId, editedText) => {
    console.log('📝 Edited message:', { messageId, editedText });
    // Send edited message to AI
    sendMessage(editedText);
  };

  // Stop generation handler
  const handleStopGeneration = () => {
    console.log('⏹️ Stopping response generation');
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsProcessing(false);
      
      // Mark the current message as complete even if interrupted
      setMessages((prev) => {
        const msgs = [...prev];
        if (msgs[msgs.length - 1]?.role === "assistant") {
          msgs[msgs.length - 1].isComplete = true;
        }
        return msgs;
      });
    }
  };

  // ------------------ SEND MESSAGE ------------------
  const sendMessage = async (overrideText = null) => {
    if (isProcessing) return;
    const textToSend = typeof overrideText === 'string' ? overrideText : input.trim();
    if (!textToSend && attachedFiles.length === 0) return;
    
    const isContinuation = textToSend === "Continue generating";

    const filesToSend = attachedFiles;
    let previousText = "";
    let updatedMessages = [...messages];

    if (isContinuation) {
      // Capture previous text to append to
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "assistant") {
        previousText = lastMsg.text;
      }
      // We do NOT add the "Continue" user message to the UI state here
      // This keeps the UI clean immediately
    } else {
      // Normal flow: Add user message
      // Convert File objects to data URLs for persistence
      const fileDataUrls = { images: [], audio: [], video: [] };
      const filePromises = filesToSend.map(file => {
        return new Promise((resolve) => {
          if (file instanceof File) {
            const reader = new FileReader();
            reader.onload = (e) => {
              const dataUrl = e.target.result;
              if (file.type.startsWith("image/")) {
                fileDataUrls.images.push(dataUrl);
              } else if (file.type.startsWith("audio/")) {
                fileDataUrls.audio.push(dataUrl);
              } else if (file.type.startsWith("video/")) {
                fileDataUrls.video.push(dataUrl);
              }
              resolve();
            };
            reader.readAsDataURL(file);
          } else {
            resolve();
          }
        });
      });
      await Promise.all(filePromises);

      const newUserMsg = {
        id: Date.now(),
        role: "user",
        text: textToSend,
        files: filesToSend.map(f => ({ name: f.name, type: f.type })),
        attachedFiles: filesToSend, // Store actual File objects for preview
        fileDataUrls: Object.keys(fileDataUrls).some(k => fileDataUrls[k].length > 0) ? fileDataUrls : null, // Store data URLs for persistence
        isHidden: false,
      };
      updatedMessages = [...messages, newUserMsg];
      setMessages(updatedMessages);
    }

    setInput("");
    setAttachedFiles([]);
    if (textareaRef.current) {
  textareaRef.current.style.height = "auto";
}
    setIsProcessing(true);
    
    // Check if user is asking for download
    const shouldAutoDownload = isDownloadRequest(textToSend);
    console.log(`📥 Auto-download check: ${shouldAutoDownload ? 'YES - Will auto-download response' : 'NO'}`);

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const uploadedFiles = [];
      let imageUrlsForVision = []; // Track image URLs for Vision API

      for (const file of filesToSend) {
        const formData = new FormData();
        formData.append("file", file);
        if (email) formData.append("email", email);

        const endpoint =
          file.type.startsWith("audio/") ? "transcribe-audio" : "upload-file";

        const res = await fetch(`${API_URL}/${endpoint}`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        uploadedFiles.push({
          name: file.name,
          text: data.text || "[No text extracted]",
        });
        
        // If it's an image, store the S3 URL for Vision API
        if (file.type.startsWith("image/") && data.image_url) {
          imageUrlsForVision.push(data.image_url);
        }
      }

      let combined = textToSend;
      uploadedFiles.forEach((f) => {
        combined += `\n\n[File: ${f.name}]\n${f.text}`;
      });
      
      // Add image URLs to the message so backend can extract and use them with Vision API
      if (imageUrlsForVision.length > 0) {
        combined += `\n\n${imageUrlsForVision.join("\n")}`;
      }

      // Build conversation differently for continuation vs normal message
      let conversation;
      if (isContinuation) {
        // For continuation: Send ONLY the last user message and incomplete assistant response
        // This tells OpenAI we're ALREADY in a conversation and just need to continue
        const lastUserMsg = messages.findLast(m => m.role === "user");
        const lastAssistantMsg = messages.findLast(m => m.role === "assistant");
        
        conversation = [
          { role: "system", content: "You are a helpful AI assistant. Continue the response from where it was interrupted. Do NOT add any preamble, greeting, or explanation. Simply continue writing the next content naturally." },
          lastUserMsg ? { role: "user", content: lastUserMsg.text } : { role: "user", content: "Continue" },
          lastAssistantMsg ? { role: "assistant", content: lastAssistantMsg.text } : null,
        ].filter(msg => msg !== null);
      } else {
        // Normal flow: Send full conversation history
        conversation = [
          { role: "system", content: "You are a helpful AI assistant." },
          ...messages.map((m) => ({ role: m.role, content: m.text })),
          { role: "user", content: combined },
        ];
      }
      
      // Only add a new assistant placeholder if it's NOT a continuation
      // If it IS a continuation, we will append to the existing last message in the stream loop
      if (!isContinuation) {
        setMessages([...updatedMessages, { id: Date.now(), role: "assistant", text: "", isComplete: false, images: [], image_url: null }]);
      }

      const response = await fetch(`${API_URL}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation, email, session_id: sessionId, model }),
        signal: abortControllerRef.current.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";
      let imageUrls = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              
              // Handle typed events
              if (data.type === "beautified_image") {
                // Beautified image sent (typed event)
                imageUrls = [data.data];
                setMessages((prev) => {
                  const msgs = [...prev];
                  const lastIdx = isContinuation ? msgs.findLastIndex(m => m.role === "assistant") : msgs.length - 1;
                  if (lastIdx !== -1) {
                    msgs[lastIdx].images = imageUrls;
                    msgs[lastIdx].image_url = imageUrls;
                    msgs[lastIdx].beautified = true; // Mark as beautified
                    msgs[lastIdx].isComplete = true; // Mark as complete after image is received
                  }
                  return msgs;
                });
              } else if (data.type === "images") {
                // Images sent first (typed event)
                imageUrls = data.data || [];
                setMessages((prev) => {
                  const msgs = [...prev];
                  const lastIdx = isContinuation ? msgs.findLastIndex(m => m.role === "assistant") : msgs.length - 1;
                  if (lastIdx !== -1) {
                    msgs[lastIdx].images = imageUrls;
                    msgs[lastIdx].image_url = imageUrls; // Keep for backward compatibility
                  }
                  return msgs;
                });
              } else if (data.type === "chunk") {
                // Text chunks (typed event)
                accumulated += data.data;
                setMessages((prev) => {
                  const msgs = [...prev];
                  if (isContinuation) {
                    const lastIdx = msgs.findLastIndex(m => m.role === "assistant");
                    if (lastIdx !== -1) {
                      msgs[lastIdx] = {
                        ...msgs[lastIdx],
                        text: previousText + accumulated
                      };
                    }
                  } else {
                    msgs[msgs.length - 1].text = accumulated;
                  }
                  return msgs;
                });
                // Auto-scroll to bottom when receiving chunks
                setTimeout(() => {
                  if (bottomRef.current) {
                    bottomRef.current.scrollIntoView({ behavior: "smooth" });
                  }
                }, 10);
              } else if (data.type === "final") {
                // Final response (typed event)
                console.log('✅ Final response received with', (data.images || imageUrls).length, 'images');
                setMessages((prev) => {
                  const msgs = [...prev];
                  const lastIdx = isContinuation ? msgs.findLastIndex(m => m.role === "assistant") : msgs.length - 1;
                  if (lastIdx !== -1) {
                    msgs[lastIdx].text = previousText + data.data;
                    msgs[lastIdx].images = data.images || imageUrls || [];
                    msgs[lastIdx].image_url = data.images || imageUrls || []; // Keep for backward compatibility
                    msgs[lastIdx].isComplete = true;
                    msgs[lastIdx].finishReason = data.finish_reason;
                    msgs[lastIdx].message_id = data.message_id;
                  }
                  return msgs;
                });
              }
              // Legacy format support (for backward compatibility)
              else if (data.chunk) {
                accumulated += data.chunk;
                setMessages((prev) => {
                  const msgs = [...prev];
                  if (isContinuation) {
                    const lastIdx = msgs.findLastIndex(m => m.role === "assistant");
                    if (lastIdx !== -1) {
                      msgs[lastIdx] = {
                        ...msgs[lastIdx],
                        text: previousText + accumulated
                      };
                    }
                  } else {
                    msgs[msgs.length - 1].text = accumulated;
                  }
                  return msgs;
                });
              } else if (data.final) {
                console.log('✅ Legacy format: Final response with images');
                setMessages((prev) => {
                  const msgs = [...prev];
                  const lastIdx = isContinuation ? msgs.findLastIndex(m => m.role === "assistant") : msgs.length - 1;
                  if (lastIdx !== -1) {
                    msgs[lastIdx].text = previousText + data.final;
                    msgs[lastIdx].images = data.image_url || imageUrls || [];
                    msgs[lastIdx].image_url = data.image_url || imageUrls || [];

                    msgs[lastIdx].isComplete = true;
                    msgs[lastIdx].finishReason = data.finish_reason;
                    msgs[lastIdx].message_id = data.message_id;
                  }
                  return msgs;
                });
              }
            } catch (e) {
              console.error("Error parsing stream chunk:", e);
            }
          }
        }
      }
    } catch (err) {
      // Only show error if it's not an abort error (user clicked stop)
      if (err.name !== 'AbortError') {
        console.error('Error during response:', err);
        setMessages((prev) => {
          const msgs = [...prev];
          if (msgs[msgs.length - 1]) {
            msgs[msgs.length - 1].text = "Error: Backend connection failed";
            msgs[msgs.length - 1].isComplete = true;
          }
          return msgs;
        });
        // Do NOT reload or refresh - just show error message
      } else {
        console.log('Response generation stopped by user');
        // Mark message as complete with stopped status
        setMessages((prev) => {
          const msgs = [...prev];
          if (msgs[msgs.length - 1]?.role === "assistant") {
            msgs[msgs.length - 1].isComplete = true;
          }
          return msgs;
        });
      }
    } finally {
      setIsProcessing(false);
      abortControllerRef.current = null;
      
      // Auto-download response if user requested download
      if (shouldAutoDownload) {
        // Wait a bit for message to be fully rendered, then trigger download
        setTimeout(async () => {
          // Get the latest messages from current state
          setMessages(currentMsgs => {
            const lastMsg = currentMsgs[currentMsgs.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg?.text) {
              console.log("📥 Triggering auto-download of response");
              console.log("Response content length:", lastMsg.text.length);
              
              // Trigger download asynchronously (don't wait for setMessages callback)
              (async () => {
                try {
                  const filename = `response-${new Date().toISOString().slice(0, 10)}`;
                  console.log("📥 Calling triggerDownload with format detection from:", textToSend);
                  const result = await triggerDownload(lastMsg.text, filename, textToSend);
                  console.log("✅ Download triggered successfully", result);
                } catch (error) {
                  console.error("❌ Auto-download failed:", error);
                  console.error("Error details:", error.message);
                  // Show coming soon modal if feature not available
                  if (error.message === 'COMING_SOON') {
                    setShowComingSoonModal(true);
                  }
                }
              })();
            }
            return currentMsgs; // Always return current messages unchanged
          });
        }, 1500); // Increased delay to ensure message is fully rendered and PPTX generation completes
      }
    }
  };

  // ------------------ MICROPHONE ------------------
  const startMic = () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    // Support multiple languages - don't limit to specific language
    // The Web Speech API will try to use the browser's default, but will accept any language
    recognition.lang = language || "en-US";
    
    // Track the last result index we've added to prevent duplicates
    let lastAddedIndex = -1;

    recognition.onresult = (e) => {
      let transcript = "";
      let newFinalResults = false;
      
      // Only process NEW results that we haven't added yet
      for (let i = Math.max(e.resultIndex, lastAddedIndex + 1); i < e.results.length; i++) {
        const result = e.results[i];
        
        // Only add if this result is FINAL (not interim)
        if (result.isFinal) {
          transcript += result[0].transcript;
          lastAddedIndex = i;
          newFinalResults = true;
        }
      }
      
      // Only update input if we have new final results
      if (newFinalResults && transcript) {
        setInput((prevInput) => {
          // Add space between previous text and new transcript if needed
          return prevInput ? prevInput + " " + transcript : transcript;
        });
      }
    };

    recognition.onstart = () => {
      setRecording(true);
      setMicBlink(true);
    };
    
    recognition.onend = () => {
      setRecording(false);
      setMicBlink(false);
      lastAddedIndex = -1; // Reset for next recording session
    };
    
    recognition.onerror = (e) => {
      console.error("Speech recognition error:", e.error);
      setRecording(false);
      setMicBlink(false);
      lastAddedIndex = -1; // Reset on error
    };

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopMic = () => recognitionRef.current?.stop();

  // ------------------ CAMERA ------------------
  useEffect(() => {
    let stream = null;
    let isMounted = true;

    if (cameraOpen) {
      const enableStream = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Camera API not available");
          }
          const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });

          if (!isMounted) {
            // Component unmounted while waiting for camera; stop immediately to prevent lock
            mediaStream.getTracks().forEach((track) => track.stop());
            return;
          }

          stream = mediaStream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
        } catch (err) {
          if (!isMounted) return;
          console.error("Camera error:", err);
          let msg = "Unable to access camera.";
          if (err.name === "NotAllowedError") msg = "Camera permission denied. Please allow access in browser settings.";
          else if (err.name === "NotFoundError") msg = "No camera device found.";
          else if (err.name === "NotReadableError") msg = "Camera is currently in use by another application.";
          else if (err.message === "Camera API not available") msg = "Camera access requires a secure connection (HTTPS) or localhost.";
          else msg = `Unable to access camera: ${err.name} (${err.message})`;
          
          alert(msg);
          setCameraOpen(false);
        }
      };
      enableStream();
    }

    return () => {
      isMounted = false;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [cameraOpen]);

  const handleCameraClick = () => {
    setCameraOpen(true);
  };

  const handleCapture = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    
    // Draw the current frame from the video to the canvas.
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    // Flip the canvas context to match the mirrored video preview
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `capture_${Date.now()}.png`, { type: 'image/png' });
        setAttachedFiles((prev) => [...prev, file]);
      }
      setCameraOpen(false); // This will trigger the useEffect cleanup
    }, 'image/png');
  };

  // ------------------ RENDER ------------------
  return (
    <div className="flex h-screen bg-gradient-to-br from-blue-50 to-indigo-100 overflow-hidden">
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)} 
        isLoggedIn={isLoggedIn}
        name={name}
        email={email}
        onLogin={handleAuthAction}
        chatHistory={chatHistory}
        onNewChat={handleNewChat}
        onLoadChat={handleLoadChat}
        onDeleteChat={handleDeleteChat}
        onUpdateChat={handleUpdateChat}
      />
      <div className="flex-1 flex flex-col h-full relative min-w-0">
      <div className="sticky top-0 z-30 bg-white">
  <MenuBar
    onShare={handleShare}
    onContact={handleContact}
    onLogin={handleAuthAction}
    isLoggedIn={isLoggedIn}
    email={email}
    name={name}
    onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
    language={language}
    onLanguageChange={setLanguage}
  />
</div>

      <div className="flex-1 flex justify-center overflow-hidden min-h-0">
        <div ref={chatContainerRef} className="w-full flex flex-col bg-white md:rounded-lg md:shadow-lg overflow-hidden min-h-0 [&_img]:max-w-full [&_img]:h-auto overflow-y-auto">
          <ChatWindow messages={messages.filter(m => !m.isHidden)} bottomRef={bottomRef} onFeedback={handleMessageFeedback} onEditSave={handleEditSave} />
        </div>
      </div>
      

      {/* CONTACT MODAL */}
      {showContact && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[60]">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-full max-w-sm mx-4">
            <h2 className="font-bold mb-3 text-3xl text-gray-800">Contact Us</h2>

            <select
              className="w-full border p-3 mb-3 bg-white text-black rounded text-lg"
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value)}
            >
              <option>Feedback</option>
              <option>Issue</option>
              <option>Suggestion</option>
            </select>

            <textarea
              className="w-full border p-3 h-28 bg-white text-black rounded placeholder-gray-400 text-lg"
              placeholder="Type your message..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              
            />

            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => setShowContact(false)}
                className="px-3 py-1 bg-gray-400 text-white rounded hover:bg-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={submitFeedback}
                className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-500"
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ATTACHED FILES DISPLAY ABOVE FOOTER */}
      {attachedFiles.length > 0 && (
        <div className="p-1 bg-gray-50 border-t">
          <div className="grid grid-cols-6 sm:grid-cols-8 gap-1 overflow-y-auto max-h-32">
            {attachedFiles.map((f, idx) => (
              <div key={`${f.name}_${f.size}_${idx}`} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-md transition-shadow relative">
                {/* Image Preview */}
                {f.type.startsWith("image/") && (
                  <div className="relative group w-full h-16">
                    <img
                      src={URL.createObjectURL(f)}
                      alt={f.name}
                      className="w-full h-full object-cover"
                      onError={(e) => e.target.style.display = "none"}
                    />
                    <button
                      onClick={() => removeFile(idx)}
                      className="absolute top-0 right-0 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      title="Remove file"
                    >
                      {'\u00D7'}
                    </button>
                  </div>
                )}

                {/* Audio Preview */}
                {f.type.startsWith("audio/") && (
                  <div className="p-1 flex flex-col items-center justify-center h-16 gap-0.5">
                    <FaFileAudio size={16} className="text-green-500" />
                    <button
                      onClick={() => removeFile(idx)}
                      className="text-red-500 hover:text-red-700 text-xs"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                )}

                {/* Video Preview */}
                {f.type.startsWith("video/") && (
                  <div className="relative group w-full h-16">
                    <video
                      src={URL.createObjectURL(f)}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeFile(idx)}
                      className="absolute top-0 right-0 bg-red-500 hover:bg-red-600 text-white rounded-full p-0.5 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                      title="Remove file"
                    >
                      {'\u00D7'}
                    </button>
                  </div>
                )}

                {/* Other Files */}
                {!f.type.startsWith("image/") && !f.type.startsWith("audio/") && !f.type.startsWith("video/") && (
                  <div className="p-1 flex flex-col items-center justify-center h-16 gap-0.5">
                    <FaFile size={16} className="text-gray-500" />
                    <button
                      onClick={() => removeFile(idx)}
                      className="text-red-500 hover:text-red-700 text-xs"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BUG REPORT FLOATING BUTTON */}
      {!showBugReport && (
        <button
          onClick={() => setShowBugReport(true)}
          className="absolute bottom-32 right-4 bg-red-500 text-white p-3 rounded-full shadow-lg hover:bg-red-600 transition-all z-40"
          title="Report a Bug"
        >
          <FaBug size={20} />
        </button>
      )}

      {/* BUG REPORT POPUP */}
      {showBugReport && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 z-[60] md:hidden"
            onClick={() => setShowBugReport(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white p-4 rounded-xl shadow-2xl border border-red-100 z-[60] md:translate-x-0 md:translate-y-0 md:top-auto md:left-auto md:absolute md:bottom-20 md:right-4 md:w-80">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-bold text-red-600 flex items-center gap-2">
              <FaBug /> Report Issue
            </h3>
            <button 
              onClick={() => setShowBugReport(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              {'\u00D7'}
            </button>
          </div>
          <textarea
            className="w-full border border-gray-200 p-3 rounded-lg text-base mb-3 h-32 resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none bg-gray-50"
            placeholder="Describe the bug or issue..."
            value={bugText}
            onChange={(e) => setBugText(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              onClick={handleBugSubmit}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-base font-medium hover:bg-red-700 transition-colors shadow-md"
            >
              Submit Report
            </button>
          </div>
        </div>
        </>
      )}

      {/* SCROLL TO BOTTOM BUTTON */}
      {showScrollButton && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-40">
          <button
            onClick={handleScrollToBottom}
            className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-full shadow-lg hover:bg-indigo-50 transition-all text-base font-medium flex items-center gap-2"
            title="Scroll to bottom"
          >
            <FaChevronDown size={14} />
            New messages
          </button>
        </div>
      )}

      {/* CONTINUE BUTTON */}
      {messages.length > 0 && messages[messages.length - 1].role === "assistant" && !isProcessing && messages[messages.length - 1].finishReason === "length" && (
        <div className="absolute bottom-24 left-1/2 transform -translate-x-1/2 z-40">
          <button
            onClick={() => sendMessage("Continue generating")}
            className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-full shadow-lg hover:bg-indigo-50 transition-all text-sm font-medium flex items-center gap-2"
          >
            Continue generating <FaArrowRight size={12} />
          </button>
        </div>
      )}

      {/* FOOTER */}
      <footer className={`sticky bottom-0 z-40 flex p-2 bg-white border-t border-gray-200 items-center gap-1 sm:gap-2 md:z-40 transition-opacity ${sidebarOpen ? 'md:opacity-100 opacity-30 pointer-events-none md:pointer-events-auto' : 'opacity-100'}`}>
        <div className="pin-container relative flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!sidebarOpen) setPinOpen(!pinOpen);
            }}
            className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={sidebarOpen}
          >
            <FaPaperclip size={18} />
          </button>
          {pinOpen && !sidebarOpen && <PinDropdown onSelect={handleFilesSelect} />}
        </div>

        {/* Model Selector */}
        <div className="relative model-selector-container">
          <button
            onClick={() => {
              if (!sidebarOpen) setModelOpen(!modelOpen);
            }}
            className={`text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed ${modelOpen && !sidebarOpen ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-gray-200' : ''}`}
            title="Select Model"
            disabled={sidebarOpen}
          >
            <FaChevronDown size={18} className={`transition-transform ${modelOpen && !sidebarOpen ? 'rotate-180' : ''}`} />
          </button>
          
          {modelOpen && !sidebarOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 flex flex-col" style={{backgroundColor: modelOpen ? '#eef2ff' : 'white'}}>
              <div className="px-4 py-2 border-b border-gray-100 text-sm font-semibold text-gray-500 uppercase tracking-wider">
                Select Model
              </div>
              {[
                { id: 'gpt-4o-mini', label: 'GPT-4o Mini', icon: <FaRobot className="text-blue-500" /> },
                { id: 'gpt-4o', label: 'GPT-4o', icon: <FaStar className="text-yellow-500" /> },
                { id: 'gpt-4-turbo', label: 'GPT-4.1 (Turbo)', icon: <FaBolt className="text-orange-500" /> }
              ].map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setModel(opt.id);
                    setModelOpen(false);
                  }}
                  className="flex items-center gap-3 px-4 py-2 hover:bg-indigo-100 transition text-base"
                >
                  {opt.icon}
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

 <textarea
  ref={textareaRef}
  value={input}
  onChange={(e) => setInput(e.target.value)}
  onInput={(e) => {
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
  }}
  onKeyDown={(e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }}
  rows={1}
  placeholder="Type your prompt..."
  className="flex-1 min-w-0 resize-none py-3 px-4 text-lg md:text-base border rounded-2xl shadow-sm 
    bg-gray-50 dark:bg-gray-800 
    text-black dark:text-white 
    placeholder-gray-500 dark:placeholder-gray-400
    focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all
    overflow-y-auto max-h-[400px]"
/>





        <button
          onClick={recording ? stopMic : startMic}
          className={`p-2 rounded-full flex-shrink-0 transition-all ${
            micBlink ? "bg-red-600 animate-pulse text-white" : "bg-indigo-100 text-indigo-600 hover:bg-indigo-200"
          }`}
        >
          <FaMicrophone size={18} />
        </button>

        <button
          onClick={() => isProcessing ? handleStopGeneration() : sendMessage(null)}
          className={`p-2.5 rounded-full flex-shrink-0 transition-all shadow-md ${
            isProcessing 
              ? "bg-red-500 text-white hover:bg-red-600" 
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
          title={isProcessing ? "Stop generation" : "Send message"}
        >
          {isProcessing ? (
            <FaReact size={20} className="ml-0.5 animate-spin" />
          ) : (
            <FaPaperPlane size={18} className="ml-0.5" />
          )}
        </button>
      </footer>

      {/* CAMERA MODAL */}
      {cameraOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-50 p-4">
          <div className="relative w-full max-w-md bg-black rounded-2xl overflow-hidden shadow-2xl border border-gray-800">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={() => {
                if (videoRef.current) {
                  videoRef.current.play().catch(e => console.error("Auto-play error:", e));
                }
              }}
              className="w-full h-auto object-cover transform scale-x-[-1] rounded-lg"
            />
            <canvas 
              ref={canvasRef} 
              className="hidden"
            />
            <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-8">
              <button
                onClick={() => setCameraOpen(false)}
                className="px-6 py-2 bg-gray-600 text-white rounded-full hover:bg-gray-700 transition-colors font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleCapture}
                className="px-6 py-2 bg-white text-black rounded-full hover:bg-gray-200 transition-colors shadow-lg flex items-center gap-2 font-semibold"
              >
                <FaCamera size={20} />
                <span>Capture</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LOGIN MODAL */}
      {showLoginModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100]"
          onClick={() => setShowLoginModal(false)}
        >
          <div 
            className="bg-white p-8 rounded-xl shadow-2xl text-center max-w-sm mx-4 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-4xl font-bold mb-6 text-gray-800">Welcome</h2>
            
            {/* Google Login */}
            <button
              onClick={handleGoogleLogin}
              className="w-full bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition duration-300 shadow-md mb-6 flex items-center justify-center gap-2 font-medium"
            >
              <FaGoogle />
              Login with Google
            </button>

            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300"></div></div>
              <div className="relative flex justify-center text-base"><span className="px-2 bg-white text-gray-500">Or enter email</span></div>
            </div>

            {/* Manual Email */}
            <div className="mb-6">
              <input 
                type="email" 
                placeholder="Enter your email" 
                className="w-full p-3 border border-gray-300 rounded-lg mb-3 text-black focus:ring-2 focus:ring-indigo-500 outline-none"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualLogin()}
              />
              <button 
                onClick={handleManualLogin}
                className="w-full bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors font-medium"
              >
                Login
              </button>
            </div>

            {/* Ask me later */}
            <button
              onClick={() => setShowLoginModal(false)}
              className="text-gray-500 hover:text-gray-700 text-base underline"
            >
              Ask me later
            </button>
          </div>
        </div>
      )}

      {/* COMING SOON MODAL */}
      {showComingSoonModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[100]"
          onClick={() => setShowComingSoonModal(false)}
        >
          <div 
            className="bg-white p-8 rounded-xl shadow-2xl text-center max-w-sm mx-4 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-4xl font-bold mb-2 text-gray-800">Coming Soon!</h2>
            <p className="text-gray-600 text-lg mb-8">PowerPoint presentation export is currently not available, but we're working on it. Stay tuned!</p>
            
            <button 
              onClick={() => setShowComingSoonModal(false)}
              className="w-full bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition duration-300 shadow-md font-medium"
            >
              Got it!
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
