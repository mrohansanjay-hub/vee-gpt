export default function Audios({ onSelect }) {
  const handleClick = () => {
    const inputEl = document.createElement("input");
    inputEl.type = "file";
    inputEl.accept = "audio/*";
    inputEl.multiple = true;

    inputEl.onchange = (e) => {
      const files = Array.from(e.target.files);
      if (files.length > 0) {
        onSelect(files);
      }
    };
    inputEl.click();
  };

  return (
    <button
      className="px-3 py-1 hover:bg-gray-200 w-full text-left"
      onClick={handleClick}
    >
      Audio
    </button>
  );
}
