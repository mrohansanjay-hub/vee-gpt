// src/pages/Files.jsx
export default function Files({ onSelect }) {
  const handleFile = () => {
    const inputEl = document.createElement("input");
    inputEl.type = "file";
    inputEl.accept = ".pdf,.txt,.docx,.pptx";
    inputEl.multiple = true; // allow multiple files

    inputEl.onchange = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        // send the selected files to App.jsx via onSelect
        onSelect(files);
      }
    };
    inputEl.click();
  };

  return (
    <button
      className="px-3 py-1 hover:bg-gray-200 w-full text-left"
      onClick={handleFile}
    >
      Files
    </button>
  );
}
