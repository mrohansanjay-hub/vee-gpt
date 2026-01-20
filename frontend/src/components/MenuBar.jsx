import { useState, useEffect } from "react";
import { FaShareSquare, FaMailBulk, FaUser, FaWindowClose, FaBars, FaUserCircle } from "react-icons/fa";

export default function MenuBar({ onShare, onContact, onLogin, isLoggedIn, email, name, onToggleSidebar }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    document.title = "Vee-GPT";
  }, []);

  // 🔐 Google Login Redirect
  const handleLoginClick = () => {
    window.location.href = "#";
  };

  // Logout
  const handleLogout = () => {
    onLogin(null); // Call parent to clear login state
    setDropdownOpen(false);
  };

  return (
    <header className="w-full h-14 bg-gradient-to-r from-purple-800 to-black text-white flex items-center px-4 shadow-md relative">
      
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
        <span className="font-bold text-lg tracking-wide">Vee-GPT</span>
      </div>

      {/* RIGHT - Desktop */}
      <div className="flex flex-1 justify-end items-center gap-3 sm:gap-4 relative">

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

        {/* LOGIN / ACCOUNT */}
        {!isLoggedIn ? (
          <button
            onClick={handleLoginClick}
            className="flex items-center gap-2 bg-white text-indigo-600 px-3 py-1 rounded-full text-sm font-semibold hover:bg-indigo-100 transition"
          >
            <FaUser size={18} />
            <span className="hidden sm:inline">Login</span>
          </button>
        ) : (
          <div className="relative">
            {/* User info button */}
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 bg-white text-indigo-600 px-3 py-1 rounded-full text-sm font-semibold hover:bg-indigo-100 transition"
            >
              <FaUser size={18} />
              <span className="max-w-[140px] truncate">{name || email}</span>
            </button>

            {/* Dropdown menu */}
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-32 bg-white border rounded shadow-md z-50">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                >
                  <FaWindowClose size={14} />
                  <span>Logout</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

    </header>
  );
}
