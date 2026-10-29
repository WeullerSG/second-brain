import React, { useEffect, useState } from "react";
import { Dumbbell, Maximize2 } from "lucide-react";

interface Props {
  images?: string[] | null;
  alt: string;
  /** Classes de tamanho/forma (ex: "w-14 h-14 rounded-lg"). */
  className?: string;
  /** Intervalo entre as fotos, em ms. */
  intervalMs?: number;
  /** Ao tocar, abre o detalhe do exercício. */
  onClick?: () => void;
}

/**
 * Alterna as fotos do exercício (posição inicial e final), como um GIF.
 * Fotos do free-exercise-db (domínio público).
 */
export const ExerciseAnimation: React.FC<Props> = ({
  images,
  alt,
  className = "w-14 h-14 rounded-lg",
  intervalMs = 900,
  onClick,
}) => {
  const list = (images || []).filter(Boolean);
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFrame(0);
    setFailed(false);
    if (list.length < 2) return;
    const timer = setInterval(() => setFrame((f) => (f + 1) % list.length), intervalMs);
    return () => clearInterval(timer);
  }, [list.join("|"), intervalMs]);

  let content: React.ReactNode;
  if (list.length === 0 || failed) {
    content = (
      <div
        className={`${className} shrink-0 bg-slate-200/70 dark:bg-slate-800 text-slate-400 flex items-center justify-center`}
        aria-label={alt}
      >
        <Dumbbell className="w-1/3 h-1/3" />
      </div>
    );
  } else {
    content = (
    <div className={`${className} shrink-0 relative overflow-hidden bg-white`}>
      {list.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === 0 ? alt : ""}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${
            i === frame ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </div>
    );
  }

  if (!onClick) return <>{content}</>;
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Ver como fazer: ${alt}`}
      className={`relative shrink-0 group rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3454d1] ${
        className.includes("w-full") ? "block w-full" : ""
      }`}
    >
      {content}
      <span className="absolute bottom-1 right-1 w-5 h-5 rounded-full bg-black/55 text-white flex items-center justify-center opacity-80 group-hover:opacity-100">
        <Maximize2 className="w-3 h-3" />
      </span>
    </button>
  );
};
