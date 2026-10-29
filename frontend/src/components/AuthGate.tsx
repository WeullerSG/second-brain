import React, { useCallback, useEffect, useState } from "react";
import { Lock } from "lucide-react";
import App from "../App";
import { api, getToken, setToken, UNAUTHORIZED_EVENT } from "../api";

type GateState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "setup" }
  | { kind: "login"; notice?: string }
  | { kind: "ready"; username: string };

function prefersDark(): boolean {
  try {
    const saved = localStorage.getItem("sb_dark_mode");
    if (saved !== null) return saved === "1";
  } catch {
    // armazenamento indisponível
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

/** Mostra a tela de login (ou de criação da conta) antes de abrir o app. */
export const AuthGate: React.FC = () => {
  const [state, setState] = useState<GateState>({ kind: "loading" });
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dark = prefersDark();

  const checkStatus = useCallback(async () => {
    try {
      const st = await api.authStatus();
      if (st.authenticated && st.username) setState({ kind: "ready", username: st.username });
      else if (!st.has_user) setState({ kind: "setup" });
      else {
        if (getToken()) setToken(null);
        setState({ kind: "login" });
      }
    } catch (err: any) {
      setState({ kind: "error", message: err.message || String(err) });
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    checkStatus();
    const onUnauthorized = () => {
      setToken(null);
      setState({ kind: "login", notice: "Sua sessão expirou. Entre novamente." });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [checkStatus, dark]);

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // mesmo sem resposta do servidor, a sessão local é encerrada
    }
    setToken(null);
    setPassword("");
    setState({ kind: "login" });
  };

  if (state.kind === "ready") {
    return <App username={state.username} onLogout={logout} />;
  }

  const isSetup = state.kind === "setup";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isSetup && password !== confirm) {
      setError("As senhas não são iguais.");
      return;
    }
    setBusy(true);
    try {
      const res = isSetup
        ? await api.setupAccount(username.trim(), password)
        : await api.login(username.trim(), password);
      setToken(res.token);
      setPassword("");
      setConfirm("");
      setState({ kind: "ready", username: res.username });
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  const surface = dark ? "bg-[#182235] border-slate-800 text-slate-100" : "bg-white border-slate-200 text-[#283c50]";
  const input = dark
    ? "bg-[#0f172a] border-slate-700 text-slate-100 placeholder-slate-500"
    : "bg-[#f8fafc] border-slate-200 text-[#283c50] placeholder-slate-400";

  return (
    <div className={`min-h-[100dvh] flex items-center justify-center p-4 ${dark ? "bg-[#0f172a]" : "bg-[#f4f6f9]"}`}>
      <div className={`w-full max-w-sm rounded-2xl border p-6 space-y-5 shadow-xl ${surface}`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#3454d1] text-white flex items-center justify-center">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <div className="font-extrabold tracking-wider uppercase text-sm">
              Second <span className="text-[#3454d1]">Brain</span>
            </div>
            <div className="text-xs text-slate-400">
              {isSetup ? "Crie seu usuário para proteger seus dados" : "Entre para acessar seus dados"}
            </div>
          </div>
        </div>

        {state.kind === "loading" && <p className="text-sm text-slate-400">Carregando...</p>}

        {state.kind === "error" && (
          <div className="space-y-3">
            <p className="text-sm text-[#ea4d4d]">Não foi possível falar com o servidor: {state.message}</p>
            <button
              onClick={() => {
                setState({ kind: "loading" });
                checkStatus();
              }}
              className="w-full py-2.5 rounded-lg bg-[#3454d1] text-white text-sm font-bold"
            >
              Tentar de novo
            </button>
          </div>
        )}

        {(state.kind === "login" || state.kind === "setup") && (
          <form onSubmit={submit} className="space-y-3">
            {state.kind === "login" && state.notice && (
              <p className="text-xs text-[#ffa21d]">{state.notice}</p>
            )}
            {isSetup && (
              <p className="text-xs text-slate-400">
                Este é o primeiro acesso. O usuário criado aqui será o único com acesso ao app.
              </p>
            )}
            <input
              autoFocus
              autoComplete="username"
              placeholder="Usuário"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full rounded-lg px-3.5 py-2.5 text-sm border focus:outline-none focus:border-[#3454d1] ${input}`}
              required
              minLength={3}
            />
            <input
              type="password"
              autoComplete={isSetup ? "new-password" : "current-password"}
              placeholder={isSetup ? "Senha (mín. 8 caracteres)" : "Senha"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full rounded-lg px-3.5 py-2.5 text-sm border focus:outline-none focus:border-[#3454d1] ${input}`}
              required
              minLength={8}
            />
            {isSetup && (
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Repita a senha"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`w-full rounded-lg px-3.5 py-2.5 text-sm border focus:outline-none focus:border-[#3454d1] ${input}`}
                required
                minLength={8}
              />
            )}
            {error && <p className="text-xs text-[#ea4d4d]">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-[#3454d1] hover:bg-[#2945b8] text-white text-sm font-bold disabled:opacity-50"
            >
              {busy ? "Aguarde..." : isSetup ? "Criar usuário e entrar" : "Entrar"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
