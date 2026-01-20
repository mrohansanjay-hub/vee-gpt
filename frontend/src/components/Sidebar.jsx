import React from "react";
import { FaPlus, FaSearch, FaProjectDiagram, FaRobot, FaCommentDots, FaTimes } from "react-icons/fa";

export default function Sidebar({ isOpen, onClose }) {
  const handleNewChat = () => {
    window.location.reload();
  };

  const handleComingSoon = () => {
    alert("Coming soon");
  };

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
             <img src="/Beige and Blue Floral Wedding Logo.jpg" alt="Vee-GPT Logo" className="w-8 h-8 rounded-full object-cover" />
             <h1 className="text-xl font-bold tracking-wide">Vee-GPT</h1>
          </div>
          {/* Close button for mobile */}
          <button onClick={onClose} className="md:hidden text-gray-400 hover:text-white">
            <FaTimes size={20} />
          </button>
        </div>

        {/* Section 1: Actions */}
        <div className="p-4 flex flex-col gap-2">
          <button onClick={handleNewChat} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-left">
            <FaPlus className="text-indigo-400" />
            <span className="font-medium">New Chat</span>
          </button>
          <button onClick={handleComingSoon} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition text-left">
            <FaSearch className="text-gray-400" />
            <span className="font-medium">Search Chat</span>
          </button>
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
            {/* Example Chat Names */}
            {["Project Alpha Discussion", "Marketing Strategy", "React Components Help", "General Inquiry", "Wedding Plans"].map((chat, index) => (
              <button key={index} onClick={handleComingSoon} className="flex items-center gap-3 p-2 hover:bg-gray-800 rounded transition text-left text-sm text-gray-400 hover:text-white truncate">
                <FaCommentDots />
                <span className="truncate">{chat}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>
    </>
  );
}