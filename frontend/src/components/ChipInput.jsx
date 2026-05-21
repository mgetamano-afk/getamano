import { useState, useEffect, useRef, KeyboardEvent } from "react";
import { X } from "lucide-react";

/**
 * Tag/chip input. Press Enter or comma to add. × to remove.
 */
export default function ChipInput({ value = [], onChange, placeholder, max, testid, className = "" }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  const add = (raw) => {
    const v = (raw || "").trim().replace(/,$/, "");
    if (!v) return;
    if (value.includes(v)) { setInput(""); return; }
    if (max && value.length >= max) return;
    onChange([...value, v]);
    setInput("");
  };

  const remove = (idx) => onChange(value.filter((_, i) => i !== idx));

  const onKey = (e) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(input);
    } else if (e.key === "Backspace" && !input && value.length) {
      remove(value.length - 1);
    }
  };

  const onChangeInput = (e) => {
    const v = e.target.value;
    if (v.endsWith(",")) { add(v); return; }
    setInput(v);
  };

  return (
    <div className={`min-h-[48px] w-full p-2 rounded-xl border border-slate-200 bg-white focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-100 flex flex-wrap gap-2 items-center ${className}`} data-testid={testid} onClick={() => inputRef.current?.focus()}>
      {value.map((tag, i) => (
        <span key={i} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-sm" data-testid={`${testid}-chip-${i}`}>
          {tag}
          <button type="button" onClick={() => remove(i)} className="hover:bg-blue-200 rounded-full p-0.5" data-testid={`${testid}-chip-remove-${i}`}>
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={input}
        onChange={onChangeInput}
        onKeyDown={onKey}
        onBlur={() => add(input)}
        placeholder={value.length === 0 ? placeholder : ""}
        className="flex-1 min-w-[120px] outline-none text-sm py-1 bg-transparent"
        data-testid={`${testid}-input`}
      />
      {max && <span className="text-xs text-slate-400 ml-auto pr-2">{value.length}/{max}</span>}
    </div>
  );
}
