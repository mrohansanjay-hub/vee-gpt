import React, { useState, useEffect, useRef } from "react";
import { FaPlus, FaSearch, FaProjectDiagram, FaRobot, FaCommentDots, FaTimes, FaCog, FaGoogle, FaUser, FaSignOutAlt, FaEllipsisH, FaThumbtack, FaArchive, FaTrash, FaEdit, FaCheck } from "react-icons/fa";
import "./sidebar.css"
export default function Sidebar({ isOpen, onClose, isLoggedIn, name, email, onLogin, chatHistory, onNewChat, onLoadChat, onDeleteChat, onUpdateChat }) {
  const [showSettings, setShowSettings] = useState(false);
  const [theme, setTheme] = useState('light'); // 'light', 'dark', 'midnight', 'system'
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [renameId, setRenameId] = useState(null);
  const [renameValue, setRenameValue] = useState("");

  const handleComingSoon = () => {
    alert("Coming soon");
  };

  const handleLoginClick = () => {
    if (onLogin) onLogin();
    setShowSettings(false);
  };

  const handleLogout = () => {
    if (onLogin) onLogin(null);
  };

  // Apply theme to document
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }, [theme]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setMenuOpenId(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  const handleRenameSubmit = (sid) => {
    if (onUpdateChat && renameValue.trim()) {
      onUpdateChat(sid, { title: renameValue });
    }
    setRenameId(null);
  };

  // Filter chats based on search query
  // Also filter out archived chats for the main list
  const activeChats = chatHistory?.filter(chat => !chat.is_archived) || [];
  
  // Sort: Pinned first, then by timestamp (already sorted by backend usually, but good to ensure)
  const sortedChats = [...activeChats].sort((a, b) => {
    if (a.is_pinned === b.is_pinned) return 0;
    return a.is_pinned ? -1 : 1;
  });

  const filteredChats = sortedChats.filter(chat => 
    (chat.title || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayChats = searchQuery ? filteredChats : sortedChats;

  // For Settings
  const pinnedChats = chatHistory?.filter(c => c.is_pinned) || [];
  const archivedChats = chatHistory?.filter(c => c.is_archived) || [];

  const ChatItem = ({ chat, isSettingsView = false }) => (
    <div className="group flex items-center justify-between p-2 hover:bg-gray-800 rounded transition relative">
      {renameId === chat.session_id ? (
        <div className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
          <input 
            type="text" 
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            className="bg-gray-700 text-white text-sm rounded px-2 py-1 w-full outline-none border border-indigo-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRenameSubmit(chat.session_id);
              if (e.key === 'Escape') setRenameId(null);
            }}
          />
          <button onClick={() => handleRenameSubmit(chat.session_id)} className="text-green-400 hover:text-green-300"><FaCheck /></button>
          <button onClick={() => setRenameId(null)} className="text-red-400 hover:text-red-300"><FaTimes /></button>
        </div>
      ) : (
        <>
          <button onClick={() => onLoadChat(chat.session_id)} className="flex items-center gap-3 text-left text-sm text-gray-400 hover:text-white truncate flex-1 min-w-0">
            {chat.is_pinned ? <FaThumbtack className="text-indigo-400 flex-shrink-0" size={12} /> : <FaCommentDots className="flex-shrink-0" />}
            <span className="truncate">{chat.title || "Untitled Chat"}</span>
          </button>
          
          <div className="relative">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpenId(menuOpenId === chat.session_id ? null : chat.session_id);
              }}
              className={`text-gray-500 hover:text-white p-1 transition-opacity ${menuOpenId === chat.session_id ? 'opacity-100 text-white' : 'opacity-0 group-hover:opacity-100'}`}
            >
              <FaEllipsisH size={12} />
            </button>

            {/* Dropdown Menu */}
            {menuOpenId === chat.session_id && (
              <div className="absolute right-0 top-6 w-32 bg-gray-800 border border-gray-700 rounded shadow-xl z-50 overflow-hidden flex flex-col py-1" onClick={e => e.stopPropagation()}>
                <button 
                  onClick={() => { onUpdateChat(chat.session_id, { is_pinned: !chat.is_pinned }); setMenuOpenId(null); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white w-full text-left"
                >
                  <FaThumbtack size={10} /> {chat.is_pinned ? "Unpin" : "Pin"}
                </button>
                <button 
                  onClick={() => { setRenameId(chat.session_id); setRenameValue(chat.title || ""); setMenuOpenId(null); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white w-full text-left"
                >
                  <FaEdit size={10} /> Rename
                </button>
                <button 
                  onClick={() => { onUpdateChat(chat.session_id, { is_archived: !chat.is_archived }); setMenuOpenId(null); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-gray-300 hover:bg-gray-700 hover:text-white w-full text-left"
                >
                  <FaArchive size={10} /> {chat.is_archived ? "Unarchive" : "Archive"}
                </button>
                <div className="h-px bg-gray-700 my-1"></div>
                <button 
                  onClick={() => { onDeleteChat(chat.session_id); setMenuOpenId(null); }}
                  className="flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-gray-700 hover:text-red-300 w-full text-left"
                >
                  <FaTrash size={10} /> Delete
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${isOpen ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />

      {/* Sidebar Container */}
      <aside 
        className={`
          fixed md:static top-0 left-0 h-full bg-gray-900 text-white flex flex-col border-r border-gray-700 z-50 transition-transform duration-300
          w-[80%] md:w-[20%] flex-shrink-0
          ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        {/* Header with Logo */}
        <div className="p-4 flex items-center justify-between border-b border-gray-800 h-14">
          <div className="flex items-center gap-3">
             <img src="/Beige%20and%20Blue%20Floral%20Wedding%20Logo.jpg" alt="Vee-GPT Logo" className="w-8 h-8 rounded-full object-cover" />
             <h1 className="text-xl font-bold tracking-wide">Vee-GPT</h1>
          </div>
          {/* Close button for mobile */}
          <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Section 1: Actions */}
        <div className="p-4 flex flex-col gap-2">
          <button onClick={onNewChat} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-left">
            <FaPlus className="text-indigo-400" />
            <span className="font-medium">New Chat</span>
          </button>
          
          {isSearching ? (
            <div className="flex items-center gap-2 p-3 bg-gray-800 rounded-lg border border-indigo-500/50">
              <FaSearch className="text-indigo-400 flex-shrink-0" size={14} />
              <input 
                type="text"
                autoFocus
                placeholder="Search..."
                className="bg-transparent border-none outline-none text-white text-sm w-full placeholder-gray-500 min-w-0"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredChats.length > 0) {
                    onLoadChat(filteredChats[0].session_id);
                  }
                }}
              />
              <button onClick={() => { setIsSearching(false); setSearchQuery(""); }} className="text-gray-400 hover:text-white flex-shrink-0">
                <FaTimes size={14} />
              </button>
            </div>
          ) : (
            <button onClick={() => setIsSearching(true)} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-left">
              <FaSearch className="text-gray-400" />
              <span className="font-medium">Search Chat</span>
            </button>
          )}
        </div>

        {/* Section 2: Projects & Vee-GPT */}
        <div className="px-4 py-2 flex flex-col gap-1 border-t border-gray-800">
          <button onClick={handleComingSoon} className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded transition text-left text-gray-300 hover:text-white">
            <FaProjectDiagram />
            <span>Add Project</span>
          </button>
          <button onClick={handleComingSoon} className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded transition text-left text-gray-300 hover:text-white">
            <FaRobot />
            <span>Vee-GPT</span>
          </button>
        </div>

        {/* Section 3: Vee Chat History */}
        <div className="flex-1 overflow-y-auto px-4 py-4 border-t border-gray-800">
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wider">Vee Chat</h3>
          <div className="flex flex-col gap-1">
            {/* Dynamic Chat History */}
            {displayChats.length > 0 ? (
              displayChats.map((chat) => <ChatItem key={chat.session_id} chat={chat} />)
            ) : (
              <div className="text-gray-500 text-sm p-2 italic">No chats found</div>
            )}
          </div>
        </div>

        {/* Settings Button */}
        <div className="p-2 border-t border-gray-800">
          <button 
            onClick={() => setShowSettings(true)}
            className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-gray-700 transition text-left"
          >
            <FaCog />
            <span className="font-medium">Settings</span>
          </button>
        </div>
      </aside>

      {/* Settings Modal */}
      {showSettings && (
        <div className="settings-modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="settings-modal" onClick={e => e.stopPropagation()}>
            <div className="settings-header">
              <h2 className="text-lg font-semibold">Settings</h2>
              <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wider">Theme</h3>
              <div className="theme-grid">
                <button 
                  className={`theme-option ${theme === 'system' ? 'active' : ''}`}
                  onClick={() => setTheme('system')}
                >
                  <span role="img" aria-label="Desktop computer">💻</span>
                  <span>System</span>
                </button>
                <button 
                  className={`theme-option ${theme === 'light' ? 'active' : ''}`}
                  onClick={() => setTheme('light')}
                >
                  <span role="img" aria-label="Sun">☀️</span>
                  <span>Light</span>
                </button>
                <button 
                  className={`theme-option ${theme === 'dark' ? 'active' : ''}`}
                  onClick={() => setTheme('dark')}
                >
                  <span role="img" aria-label="Moon">🌙</span>
                  <span>Dark</span>
                </button>
                <button 
                  className={`theme-option ${theme === 'midnight' ? 'active' : ''}`}
                  onClick={() => setTheme('midnight')}
                >
                  <span role="img" aria-label="Milky way">🌌</span>
                  <span>Midnight</span>
                </button>
              </div>
            </div>

            {/* Pinned Chats Section */}
            {isLoggedIn && pinnedChats.length > 0 && (
              <div className="mb-4 border-t border-gray-700 pt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wider flex items-center gap-2">
                  <FaThumbtack size={10} /> Pinned Chats
                </h3>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {pinnedChats.map(chat => <ChatItem key={chat.session_id} chat={chat} isSettingsView={true} />)}
                </div>
              </div>
            )}

            {/* Archived Chats Section */}
            {isLoggedIn && archivedChats.length > 0 && (
              <div className="mb-4 border-t border-gray-700 pt-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wider flex items-center gap-2">
                  <FaArchive size={10} /> Archived Chats
                </h3>
                <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  {archivedChats.map(chat => <ChatItem key={chat.session_id} chat={chat} isSettingsView={true} />)}
                </div>
              </div>
            )}

            {/* Account Section */}
            <div className="mb-4 border-t border-gray-700 pt-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wider">Account</h3>
              {isLoggedIn ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 p-2 bg-gray-800 rounded-lg">
                    <FaUser className="text-indigo-400" />
                    <div className="flex flex-col overflow-hidden">
                      <span className="text-sm font-medium text-white truncate">{name || "User"}</span>
                      <span className="text-xs text-gray-400 truncate">{email}</span>
                    </div>
                  </div>
                  <button onClick={handleLogout} className="flex items-center gap-3 p-2 text-red-400 hover:text-red-300 hover:bg-gray-800 rounded transition w-full text-left">
                    <FaSignOutAlt />
                    <span>Logout</span>
                  </button>
                </div>
              ) : (
                <button onClick={handleLoginClick} className="flex items-center justify-center gap-2 w-full p-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition font-medium">
                  <FaUser />
                  <span>Login</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}