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
} from "react-icons/fa";

import ChatWindow from "./components/ChatWindow";
import PinDropdown from "./components/PinDropdown";
import MenuBar from "./components/MenuBar";
import Sidebar from "./components/Sidebar";
import "./App.css";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function App() {
  const generateSessionId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

  // ------------------ STATE ------------------
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem("chat_messages");
      return saved ? JSON.parse(saved) : [];
    } catch (error) {
      console.error("Failed to load messages from localStorage:", error);
      return [];
    }
  });
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState(() => {
    try {
      const saved = localStorage.getItem("chat_session_id");
      return saved || generateSessionId();
    } catch (error) {
      return generateSessionId();
    }
  });
  const [pinOpen, setPinOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [micBlink, setMicBlink] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [capturedImage, setCapturedImage] = useState(null);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [opencvReady, setOpencvReady] = useState(false);

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState("");
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

  // ------------------ REFS ------------------
  const bottomRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const recognitionRef = useRef(null);

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
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // ------------------ AUTO SCROLL ------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // ------------------ PERSISTENCE ------------------
  useEffect(() => {
    localStorage.setItem("chat_messages", JSON.stringify(messages));
    localStorage.setItem("chat_session_id", sessionId);
  }, [messages, sessionId]);

  // ------------------ HANDLE ACCOUNT ------------------
  const handleAccount = async (user) => {
    if (!user) {
      setIsLoggedIn(false);
      setEmail("");
      setName("");
      localStorage.removeItem('user');
      // Logout from backend session
      await fetch(`${API_URL}/auth/google/logout`);
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
  };

  const handleLoadChat = async (sid) => {
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
  const textareaRef = useRef(null);

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
      const newUserMsg = {
        id: Date.now(),
        role: "user",
        text: textToSend,
        files: filesToSend.map(f => ({ name: f.name, type: f.type })),
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

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      const uploadedFiles = [];

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
      }

      let combined = textToSend;
      uploadedFiles.forEach((f) => {
        combined += `\n\n[File: ${f.name}]\n${f.text}`;
      });

      const conversation = [
        { role: "system", content: "You are a helpful AI assistant. When asked to process files (beautify, ATS resume, format), rewrite the content completely in the requested format. Wrap the processed content in a markdown code block (```). Do NOT include conversational text inside the code block. Provide a link '[Download Processed File](#download)'." },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: combined },
      ];
      // Only add a new assistant placeholder if it's NOT a continuation
      // If it IS a continuation, we will append to the existing last message in the stream loop
      if (!isContinuation) {
        setMessages([...updatedMessages, { id: Date.now(), role: "assistant", text: "", isComplete: false, image_url: null }]);
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
              if (data.type === "images") {
                // Images sent first (typed event)
                imageUrls = data.data || [];
                setMessages((prev) => {
                  const msgs = [...prev];
                  const lastIdx = isContinuation ? msgs.findLastIndex(m => m.role === "assistant") : msgs.length - 1;
                  if (lastIdx !== -1) {
                    msgs[lastIdx].image_url = imageUrls;
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
              } else if (data.type === "final") {
                // Final response (typed event)
                console.log('✅ Final response received with', imageUrls.length, 'images');
                setMessages((prev) => {
                  const msgs = [...prev];
                  const lastIdx = isContinuation ? msgs.findLastIndex(m => m.role === "assistant") : msgs.length - 1;
                  if (lastIdx !== -1) {
                    msgs[lastIdx].text = previousText + data.data;
                    msgs[lastIdx].image_url = data.images || imageUrls;
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
                    msgs[lastIdx].image_url = data.image_url || imageUrls || null;
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
          msgs[msgs.length - 1].text = "Error: Backend connection failed";
          return msgs;
        });
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
    }
  };

  // ------------------ MICROPHONE ------------------
  const startMic = () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onresult = (e) => {
      let transcript = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript;
      }
      setInput(transcript);
    };

    recognition.onstart = () => {
      setRecording(true);
      setMicBlink(true);
    };
    recognition.onend = () => {
      setRecording(false);
      setMicBlink(false);
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
  />
</div>

      <div className="flex-1 flex justify-center overflow-hidden min-h-0">
        <div className="w-full flex flex-col bg-white rounded-lg shadow-lg overflow-hidden min-h-0">
          <ChatWindow messages={messages.filter(m => !m.isHidden)} bottomRef={bottomRef} onFeedback={handleMessageFeedback} onEditSave={handleEditSave} />
        </div>
      </div>
      

      {/* CONTACT MODAL */}
      {showContact && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl shadow-2xl w-96 max-w-sm mx-4">
            <h2 className="font-bold mb-3 text-xl text-gray-800">Contact Us</h2>

            <select
              className="w-full border p-2 mb-3 bg-white text-black rounded"
              value={feedbackType}
              onChange={(e) => setFeedbackType(e.target.value)}
            >
              <option>Feedback</option>
              <option>Issue</option>
              <option>Suggestion</option>
            </select>

            <textarea
              className="w-full border p-2 h-28 bg-white text-black rounded placeholder-gray-400"
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
        <div className="flex items-center gap-2 p-2 bg-gray-50 border-t" >
          {attachedFiles.map((f, idx) => (
            <div key={`${f.name}_${f.size}_${idx}`} className="px-2 py-1 bg-gray-100 rounded text-sm flex items-center gap-1">              {f.type.startsWith("image/") ? <FaFileImage size={14} /> :
               f.type.startsWith("video/") ? <FaFileVideo size={14} /> :
               f.type.startsWith("audio/") ? <FaFileAudio size={14} /> :
               <FaFile size={14} />}              {f.name}
              <button
                onClick={() => removeFile(idx)}
                className="text-red-600 hover:text-red-800"
              >
                {'\u00D7'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* BUG REPORT FLOATING BUTTON */}
      {!showBugReport && (
        <button
          onClick={() => setShowBugReport(true)}
          className="absolute bottom-20 right-6 bg-red-500 text-white p-3 rounded-full shadow-lg hover:bg-red-600 transition-all z-40"
          title="Report a Bug"
        >
          <FaBug size={20} />
        </button>
      )}

      {/* BUG REPORT POPUP */}
      {showBugReport && (
        <>
          <div 
            className="fixed inset-0 bg-black/60 z-40 md:hidden"
            onClick={() => setShowBugReport(false)}
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-sm bg-white p-4 rounded-xl shadow-2xl border border-red-100 z-50 md:translate-x-0 md:translate-y-0 md:top-auto md:left-auto md:absolute md:bottom-20 md:right-6 md:w-80">
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
            className="w-full border border-gray-200 p-3 rounded-lg text-sm mb-3 h-32 resize-none focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none bg-gray-50"
            placeholder="Describe the bug or issue..."
            value={bugText}
            onChange={(e) => setBugText(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              onClick={handleBugSubmit}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors shadow-md"
            >
              Submit Report
            </button>
          </div>
        </div>
        </>
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
      <footer className="sticky bottom-0 z-30 flex p-2 bg-white border-t border-gray-200 items-center gap-1 sm:gap-2">
        <div className="pin-container relative flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPinOpen(!pinOpen);
            }}
            className="text-gray-500 hover:text-gray-700 p-2 rounded-full hover:bg-gray-100 transition-colors"
          >
            <FaPaperclip size={18} />
          </button>
          {pinOpen && <PinDropdown onSelect={handleFilesSelect} />}
        </div>

        {/* Model Selector */}
        <select 
          value={model} 
          onChange={(e) => setModel(e.target.value)}
          className="text-xs bg-gray-100 border-0 rounded-md px-2 py-1 text-gray-600 focus:ring-0 cursor-pointer hidden sm:block"
          title="Select AI Model"
        >
          <option value="gpt-4o-mini">GPT-4o Mini</option>
          <option value="gpt-4o">GPT-4o</option>
          <option value="gpt-4-turbo">GPT-4.1 (Turbo)</option>
        </select>

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
  className="flex-1 min-w-0 resize-none py-2 px-4 text-sm border rounded-2xl 
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
  onClick={() => alert("Coming Soon")} // or use a toast/modal here
  className="your-camera-button-classes"
>
  {/* Camera Icon */}
</button>


        <button
          onClick={() => isProcessing ? handleStopGeneration() : sendMessage(null)}
          className={`p-2 rounded-full flex-shrink-0 transition-all shadow-md ${
            isProcessing 
              ? "bg-red-500 text-white hover:bg-red-600" 
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
          title={isProcessing ? "Stop generation" : "Send message"}
        >
          {isProcessing ? (
            <>
              <span className="inline-block mr-1">⏹</span>
              
            </>
          ) : (
            <FaPaperPlane size={16} className="ml-0.5" />
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
            <h2 className="text-2xl font-bold mb-6 text-gray-800">Welcome</h2>
            
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
              <div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">Or enter email</span></div>
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
                Register / Login
              </button>
            </div>

            {/* Ask me later */}
            <button
              onClick={() => setShowLoginModal(false)}
              className="text-gray-500 hover:text-gray-700 text-sm underline"
            >
              Ask me later
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
