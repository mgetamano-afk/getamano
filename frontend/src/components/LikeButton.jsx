import { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../lib/api";
import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";

/**
 * Like button. Shows count and toggle state. Prompts login if not authed.
 */
export default function LikeButton({ providerId, initialCount = 0, size = "sm", onChangeCount }) {
  const { user } = useAuth();
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(false);
  const [bouncing, setBouncing] = useState(false);

  useEffect(() => { setCount(initialCount); }, [initialCount]);

  useEffect(() => {
    if (!user || !providerId) return;
    api.get(`/providers/${providerId}/like-status`).then(r => setLiked(r.data.liked)).catch(() => {});
  }, [user, providerId]);

  const toggle = async (e) => {
    e?.preventDefault?.(); e?.stopPropagation?.();
    if (!user) {
      toast.error("Inicia sesión para recomendar a este negocio", { duration: 3000 });
      return;
    }
    try {
      const { data } = await api.post(`/providers/${providerId}/like`);
      const newCount = count + (data.liked ? 1 : -1);
      setLiked(data.liked);
      setCount(newCount);
      onChangeCount?.(newCount);
      if (data.liked) {
        setBouncing(true); setTimeout(() => setBouncing(false), 400);
      }
    } catch { toast.error("Error"); }
  };

  if (size === "lg") {
    return (
      <button onClick={toggle} className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border-2 transition ${liked ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-orange-300"}`} data-testid={`like-button-lg-${providerId}`}>
        <ThumbsUp className={`w-4 h-4 ${liked ? "fill-white" : ""} ${bouncing ? "animate-bounce" : ""}`} />
        <span className="text-sm font-medium">{liked ? `✓ Recomiendas este negocio` : `Recomendar`}</span>
        <span className="text-sm font-bold ml-1">{count}</span>
      </button>
    );
  }

  return (
    <button onClick={toggle} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs transition ${liked ? "bg-orange-50 text-orange-600" : "bg-white/90 hover:bg-white text-slate-600"} shadow-sm`} data-testid={`like-button-${providerId}`}>
      <ThumbsUp className={`w-3.5 h-3.5 ${liked ? "fill-orange-500 text-orange-500" : ""} ${bouncing ? "animate-bounce" : ""}`} />
      <span className="font-medium">{count}</span>
    </button>
  );
}
