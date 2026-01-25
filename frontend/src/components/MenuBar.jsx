import { useState, useEffect } from "react";
import { FaShareSquare, FaMailBulk, FaBars } from "react-icons/fa";

export default function MenuBar({ onShare, onContact, onToggleSidebar }) {

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
      </div>
    </header>
  );
}
