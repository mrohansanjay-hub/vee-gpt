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
} from "react-icons/fa";

import ChatWindow from "./components/ChatWindow";
import PinDropdown from "./components/PinDropdown";
import MenuBar from "./components/MenuBar";
import Sidebar from "./components/Sidebar";
import "./App.css";

export default function App() {
  // ------------------ STATE ------------------
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
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
  }, [messages]);

  // ------------------ HANDLE ACCOUNT ------------------
  const handleAccount = (user) => {
    if (!user) {
      setIsLoggedIn(false);
      setEmail("");
      setName("");
      localStorage.removeItem('user');
    } else {
      setIsLoggedIn(true);
      setEmail(user.email);
      setName(user.name || "");
      setShowLoginModal(false);  // Close modal on login

      // 🔐 store email in DB
      fetch("http://127.0.0.1:8000/auth/store-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
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

  // ------------------ CHECK URL PARAM FOR LOGIN ------------------
  /*
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mail = params.get("email");
    const uname = params.get("name");
    if (mail) {
      const user = { email: mail, name: uname };
      handleAccount(user);
      localStorage.setItem('user', JSON.stringify(user));
      window.history.replaceState({}, document.title, "/");
    } else {
      // Check localStorage for persisted login
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        handleAccount(JSON.parse(savedUser));
      }
    }
  }, []);
  */

  // ------------------ LOGIN MODAL ------------------
  const [showLoginModal, setShowLoginModal] = useState(false);

  /*
  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    if (!savedUser && !isLoggedIn && !showLoginModal) {
      // Delay to allow state to set
      setTimeout(() => setShowLoginModal(true), 100);
    } else if (isLoggedIn) {
      setShowLoginModal(false);
    }
  }, [isLoggedIn, showLoginModal]);
  */

  const handleLoginClick = () => {
    // window.location.href = "http://127.0.0.1:8000/auth/google/login";
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
      await fetch("http://127.0.0.1:8000/contact-feedback", {
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
      await fetch("http://127.0.0.1:8000/message-feedback", {
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

  // ------------------ SEND MESSAGE ------------------
  const sendMessage = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;

    const newUserMsg = {
      id: Date.now(),
      role: "user",
      text: input.trim(),
      files: attachedFiles, // Pass full file objects
    };

    const updatedMessages = [...messages, newUserMsg];
    setMessages(updatedMessages);
    setInput("");

    try {
      const uploadedFiles = [];

      for (const file of attachedFiles) {
        const formData = new FormData();
        formData.append("file", file);

        const endpoint =
          file.type.startsWith("audio/") ? "transcribe-audio" : "upload-file";

        const res = await fetch(`http://127.0.0.1:8000/${endpoint}`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json();
        uploadedFiles.push({
          name: file.name,
          text: data.text || "[No text extracted]",
        });
      }

      let combined = input.trim();
      uploadedFiles.forEach((f) => {
        combined += `\n\n[File: ${f.name}]\n${f.text}`;
      });

      const conversation = [
        { role: "system", content: "You are a helpful AI assistant." },
        ...messages.map((m) => ({ role: m.role, content: m.text })),
        { role: "user", content: combined },
      ];

      setMessages([...updatedMessages, { id: Date.now(), role: "assistant", text: "" }]);

      const response = await fetch("http://127.0.0.1:8000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: conversation }),
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = JSON.parse(line.slice(6));
            if (data.chunk) {
              accumulated += data.chunk;
              setMessages((prev) => {
                const msgs = [...prev];
                msgs[msgs.length - 1].text = accumulated;
                return msgs;
              });
            }
            if (data.final) {
              setMessages((prev) => {
                const msgs = [...prev];
                msgs[msgs.length - 1].text = data.final;
                msgs[msgs.length - 1].image_url = data.image_url || null;
                msgs[msgs.length - 1].isComplete = true;
                return msgs;
              });
            }
          }
        }
      }
    } catch {
      setMessages((prev) => {
        const msgs = [...prev];
        msgs[msgs.length - 1].text = "Error: Backend connection failed";
        return msgs;
      });
    }

    setAttachedFiles([]);
  };

  // ------------------ MICROPHONE ------------------
  const startMic = () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

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
    let animationId = null;
    let src = null;
    let cap = null;

    if (cameraOpen) {
      if (!opencvReady) {
        alert("OpenCV is loading... please wait a moment and try again.");
        setCameraOpen(false);
        return;
      }

      const enableStream = async () => {
        try {
          if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Camera API not available");
          }
          const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });

          stream = mediaStream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();

            const processVideo = () => {
              if (!cameraOpen || !videoRef.current) return;

              const width = videoRef.current.videoWidth;
              const height = videoRef.current.videoHeight;

              // Wait for video to have valid dimensions
              if (width === 0 || height === 0) {
                animationId = requestAnimationFrame(processVideo);
                return;
              }

              // Initialize OpenCV objects if not already done
              if (!src) {
                if (canvasRef.current) {
                  canvasRef.current.width = width;
                  canvasRef.current.height = height;
                }
                src = new window.cv.Mat(height, width, window.cv.CV_8UC4);
                cap = new window.cv.VideoCapture(videoRef.current);
              }

              try {
                // Read frame from video and show on canvas
                if (cap && src) {
                  cap.read(src);
                  window.cv.imshow(canvasRef.current, src);
                }
              } catch (err) {
                console.error("OpenCV processing error:", err);
              }
              animationId = requestAnimationFrame(processVideo);
            };
            requestAnimationFrame(processVideo);
          }
        } catch (err) {
          console.error("Camera error:", err);
          // let msg = "Unable to access camera.";
          if (err.name === "NotAllowedError") msg = "Camera permission denied. Please allow access in browser settings.";
          else if (err.name === "NotFoundError") msg = "No camera device found.";
          // else if (err.name === "NotReadableError") msg = "Camera is currently in use by another application.";
          else if (err.message === "Camera API not available") msg = "Camera access requires a secure connection (HTTPS) or localhost.";
          
          alert(msg);
          setCameraOpen(false);
        }
      };
      enableStream();
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
      if (animationId) cancelAnimationFrame(animationId);
      if (src) src.delete();
      // cap cleanup is handled by JS GC usually, but we stop using it
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [cameraOpen, opencvReady]);

  const handleCameraClick = () => {
    setCameraOpen(true);
  };

  const handleCapture = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Canvas already contains the OpenCV processed image
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
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col h-full relative min-w-0">
      <MenuBar
        onShare={handleShare}
        onContact={handleContact}
        onLogin={handleAccount}
        isLoggedIn={isLoggedIn}
        email={email}
        name={name}
        onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex justify-center overflow-hidden">
        <div className="w-full flex flex-col bg-white rounded-lg shadow-lg overflow-hidden">
          <ChatWindow messages={messages} bottomRef={bottomRef} onFeedback={handleMessageFeedback} />
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

      {/* FOOTER */}
      <footer className="flex p-2 bg-white border-t border-gray-200 items-center gap-1 sm:gap-2">
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

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 min-w-0 py-2 px-3 text-sm border rounded-full bg-gray-50 text-black placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all"
          placeholder="Type your prompt..."
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
          onClick={handleCameraClick}
          className="p-2 bg-green-100 text-green-600 rounded-full hover:bg-green-200 flex-shrink-0 transition-all"
        >
          <FaCamera size={18} />
        </button>

        <button
          onClick={sendMessage}
          className="p-2 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 flex-shrink-0 transition-all shadow-md"
        >
          <FaPaperPlane size={16} className="ml-0.5" />
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
              className="absolute opacity-0 pointer-events-none" // Hide video visually but keep in DOM
            />
            <canvas 
              ref={canvasRef} 
              className="w-full h-auto object-cover transform scale-x-[-1] rounded-lg"
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
      {/* {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
          <div className="bg-white p-8 rounded-xl shadow-2xl text-center max-w-sm mx-4">
            <h2 className="text-3xl font-bold mb-4 text-gray-800">Welcome to ChatbotAI</h2>
            <p className="mb-6 text-gray-600">Please log in with Google to continue.</p>
            <button
              onClick={handleLoginClick}
              className="bg-gradient-to-r from-red-500 to-red-600 text-white px-8 py-3 rounded-lg hover:from-red-600 hover:to-red-700 transition duration-300 shadow-lg"
            >
              Login with Google
            </button>
          </div>
        </div>
      )} */}

      </div>
    </div>
  );
}
