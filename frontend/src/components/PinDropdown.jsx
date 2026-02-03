import React, { useRef } from "react";
import { FaFile, FaFileImage, FaFileVideo, FaFileAudio } from "react-icons/fa";

const PinDropdown = ({ onSelect }) => {
  const fileInputRef = useRef(null);

  const handleOptionClick = (accept) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      onSelect(Array.from(e.target.files));
    }
  };

  const options = [
    { label: "Document", icon: <FaFile size={16} />, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/50", accept: "*/*" },
    { label: "Image", icon: <FaFileImage size={16} />, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/50", accept: "image/*" },
    // { label: "Video", icon: <FaFileVideo size={16} />, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/50", accept: "video/*" },
    { label: "Audio", icon: <FaFileAudio size={16} />, color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-100 dark:bg-yellow-900/50", accept: "audio/*" },
  ];

  return (
    <div className="absolute bottom-full left-0 mb-2 w-40 sm:w-48 max-h-96 overflow-y-auto bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-100 dark:border-gray-700 z-30"> 
      <input
        type="file"
        multiple
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileChange}
      />
      <div className="p-1">
        {options.map((opt) => (
          <button
            key={opt.label}
            onClick={() => handleOptionClick(opt.accept)}
            className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-all group text-left"
          >
            <div className={`p-2 rounded-full ${opt.bg} ${opt.color} group-hover:scale-110 transition-transform`}>
              {opt.icon}
            </div>
<span className="text-black dark:text-gray-300 font-medium text-base">
  {opt.label}
</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default PinDropdown;