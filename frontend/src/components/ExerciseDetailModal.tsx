import React, { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, PlayCircle, Search, X } from "lucide-react";
import { api } from "../api";
import type { WorkoutExercise } from "../types";
import { ExerciseAnimation } from "./ExerciseAnimation";

interface Props {
  exercise: WorkoutExercise;
  darkMode: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/** Extrai o id do vídeo de um link do YouTube (watch, youtu.be, shorts, embed). */
function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

/** Janela com tudo sobre o exercício: vídeo (YouTube) ou animação, execução, erros comuns e recorde. */
export const ExerciseDetailModal: React.FC<Props> = ({ exercise, darkMode, onClose, onSaved }) => {
  const [videoInput, setVideoInput] = useState(exercise.youtube_url || "");
  const [videoUrl, setVideoUrl] = useState(exercise.youtube_url || "");
  const [editingVideo, setEditingVideo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoId = youtubeId(videoUrl);

  // Fecha com Esc e trava a rolagem da página por trás
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const saveVideo = async (value: string) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.setExerciseVideo(exercise.id, value);
      setVideoUrl(res.youtube_url || "");
      setVideoInput(res.youtube_url || "");
      setEditingVideo(false);
      await onSaved();
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setSaving(false);
    }
  };

  const surface = darkMode ? "bg-[#182235] text-slate-100" : "bg-white text-[#283c50]";
  const input = darkMode
    ? "bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-[#f8fafc] border-slate-200 text-[#283c50] placeholder-slate-400";
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${exercise.name} execução correta`)}`;
  const steps = exercise.instructions.split(/(?<=\.)\s+/).filter(Boolean);

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={exercise.name}
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-2xl max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-2xl ${surface}`}
      >
        {/* Mídia: vídeo do YouTube (se houver) ou animação das fotos */}
        <div className="relative bg-black">
          {videoId ? (
            <iframe
              className="w-full aspect-video"
              src={`https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1`}
              title={exercise.name}
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          ) : (
            <ExerciseAnimation images={exercise.image_urls} alt={exercise.name} className="w-full aspect-video" intervalMs={1000} />
          )}
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          <div>
            <div className="flex flex-wrap gap-1.5 mb-1.5">
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#3454d1]/15 text-[#3454d1]">
                {exercise.muscle_group}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-500/15">{exercise.equipment}</span>
              <span className="text-[10px] font-semibold text-slate-400">
                {exercise.mechanic} • {exercise.difficulty}
              </span>
            </div>
            <h3 className="font-extrabold text-base sm:text-lg leading-snug">{exercise.name}</h3>
            {exercise.secondary_muscles && (
              <p className="text-xs text-slate-400">Também trabalha: {exercise.secondary_muscles}</p>
            )}
          </div>

          {/* Vídeo */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <PlayCircle className="w-4 h-4 text-[#ea4d4d]" />
                {videoId ? "Vídeo de demonstração" : "Sem vídeo ainda"}
              </span>
              {!editingVideo && (
                <button
                  onClick={() => setEditingVideo(true)}
                  className="text-[11px] font-bold text-[#3454d1] hover:underline"
                >
                  {videoId ? "Trocar vídeo" : "Adicionar vídeo do YouTube"}
                </button>
              )}
            </div>
            {editingVideo && (
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    value={videoInput}
                    onChange={(e) => setVideoInput(e.target.value)}
                    placeholder="Cole o link do YouTube (youtube.com/watch?v=... ou youtu.be/...)"
                    className={`flex-1 min-w-0 rounded-lg px-3 py-2 text-xs border ${input}`}
                  />
                  <button
                    disabled={saving}
                    onClick={() => saveVideo(videoInput)}
                    className="px-3 py-2 rounded-lg bg-[#17c666] text-white text-xs font-bold disabled:opacity-50"
                  >
                    Salvar
                  </button>
                </div>
                <div className="flex flex-wrap gap-3 text-[11px]">
                  <a href={searchUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-[#ea4d4d] flex items-center gap-1">
                    <Search className="w-3 h-3" /> Procurar no YouTube
                  </a>
                  {videoId && (
                    <button onClick={() => saveVideo("")} className="font-bold text-slate-400 hover:text-[#ea4d4d]">
                      Remover vídeo
                    </button>
                  )}
                  <button onClick={() => setEditingVideo(false)} className="font-bold text-slate-400">
                    Cancelar
                  </button>
                </div>
                {error && <p className="text-[11px] text-[#ea4d4d]">{error}</p>}
              </div>
            )}
          </div>

          {/* Como executar */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Como executar</h4>
            <ol className="list-decimal pl-5 space-y-1 text-sm leading-relaxed">
              {steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>

          {exercise.common_mistakes && (
            <div className="rounded-xl bg-[#ffa21d]/10 border border-[#ffa21d]/30 p-3 text-xs flex gap-2">
              <AlertTriangle className="w-4 h-4 text-[#ffa21d] shrink-0 mt-0.5" />
              <span>
                <strong>Evite:</strong> {exercise.common_mistakes}
              </span>
            </div>
          )}

          {exercise.times_trained > 0 && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-slate-500/10 p-2">
                <div className="text-slate-400 text-[10px]">Recorde</div>
                <div className="font-extrabold">{exercise.personal_record_kg} kg</div>
              </div>
              <div className="rounded-lg bg-slate-500/10 p-2">
                <div className="text-slate-400 text-[10px]">Última carga</div>
                <div className="font-extrabold">{exercise.last_weight_kg} kg</div>
              </div>
              <div className="rounded-lg bg-slate-500/10 p-2">
                <div className="text-slate-400 text-[10px]">Vezes</div>
                <div className="font-extrabold">{exercise.times_trained}x</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400">
            <span>Fotos: free-exercise-db (domínio público)</span>
            <a
              href={exercise.video_url || "https://smartworkout.app/pt/biblioteca-de-exercicios"}
              target="_blank"
              rel="noopener noreferrer"
              className="font-bold text-[#3454d1] flex items-center gap-1"
            >
              Ver no SmartWorkout <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
