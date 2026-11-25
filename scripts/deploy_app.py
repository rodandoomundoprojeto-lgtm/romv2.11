#!/usr/bin/env python3
"""
Mini aplicativo de Deploy — Rodando o Mundo
Interface simples com um botão para fazer deploy (commit + sync + push)
e uma tela de log detalhada que aponta claramente qualquer erro.
"""

from __future__ import annotations

import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import scrolledtext

REPO_ROOT = Path(__file__).resolve().parent.parent
LOG_FILE = REPO_ROOT / "_backups" / "deploy_app.log"

# Arquivos gerados automaticamente pelos bots do GitHub Actions
# (regra documentada em docs/gerenciamento-dados-gerados.md)
AUTO_GENERATED_REMOTE_WINS = {
    "data/vitrine_ia.json",
    "data/feed_output.json",
    "data/noticias_x.json",
    "data/entenda_v2.json",
}
HISTORY_FILE = "data/history.json"


def _creation_flags() -> int:
    if sys.platform == "win32":
        return subprocess.CREATE_NO_WINDOW
    return 0


def _git_env() -> dict[str, str]:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    env["GIT_EDITOR"] = "true"
    env["LC_ALL"] = "C"
    return env


def run_git(
    args: list[str],
    on_line=None,
    timeout: int = 120,
) -> tuple[int, str]:
    """Executa um comando git no diretório do projeto sem abrir janela preta."""
    cmd = ["git", *args]
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(REPO_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
            env=_git_env(),
            creationflags=_creation_flags(),
        )
    except FileNotFoundError:
        return 127, "Git não encontrado no sistema. Instale o Git for Windows."
    except Exception as exc:
        return 1, f"Falha ao iniciar o comando git: {exc}"

    lines: list[str] = []
    assert proc.stdout is not None
    try:
        for raw_line in proc.stdout:
            line = raw_line.rstrip("\r\n")
            lines.append(line)
            if on_line and line.strip():
                on_line(line)
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        return 124, f"Tempo limite ({timeout}s) excedido ao executar: git {' '.join(args)}"

    return proc.returncode, "\n".join(lines)


def diagnosticar_erro_git(etapa: str, saida: str) -> str:
    """Traduz erros comuns do Git em explicações diretas em português."""
    texto = (saida or "").lower()

    if "git não encontrado" in texto or "not recognized" in texto:
        return "O Git não está instalado ou não está no PATH do Windows."
    if "could not resolve host" in texto or "unable to access" in texto or "failed to connect" in texto or "timed out" in texto:
        return "Sem conexão com a internet ou não foi possível alcançar o GitHub."
    if "authentication failed" in texto or "permission denied" in texto or "403" in texto or "invalid username or password" in texto or "terminal prompts disabled" in texto:
        return (
            "Falha de autenticação no GitHub. Seu login/token do Git precisa ser "
            "renovado no Gerenciador de Credenciais do Windows."
        )
    if "nothing to commit" in texto:
        return "Não havia alterações novas para gravar no commit."
    if "non-fast-forward" in texto or "fetch first" in texto or "rejected" in texto:
        return "O GitHub recebeu atualizações novas durante o envio. Tente clicar em Fazer Deploy novamente."
    if "index.lock" in texto:
        return (
            "Existe outro processo do Git rodando (ou travado) usando .git/index.lock. "
            "Aguarde alguns segundos e tente novamente."
        )
    if "please tell me who you are" in texto or "author identity unknown" in texto:
        return (
            "Nome ou e-mail do Git não configurados. Configure user.name e user.email no Git."
        )
    if "conflict" in texto:
        return "Conflito de arquivos entre suas alterações locais e o que está no GitHub."
    if "tempo limite" in texto:
        return "A operação demorou demais para responder. Verifique sua internet e tente novamente."

    return f"Erro inesperado na etapa '{etapa}'. Veja os detalhes técnicos no log acima."


def _resolver_conflito_history() -> bool:
    """Faz união dos processed_ids de data/history.json conforme regra do projeto."""
    rc_a, out_a = run_git(["show", f":2:{HISTORY_FILE}"])
    rc_b, out_b = run_git(["show", f":3:{HISTORY_FILE}"])
    if rc_a != 0 or rc_b != 0:
        return False

    try:
        dados_a = json.loads(out_a)
        dados_b = json.loads(out_b)
    except json.JSONDecodeError:
        return False

    ids: list = []
    vistos: set = set()
    for fonte in (dados_a, dados_b):
        for item in fonte.get("processed_ids", []):
            if item not in vistos:
                vistos.add(item)
                ids.append(item)

    destino = REPO_ROOT / HISTORY_FILE
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=str(destino.parent), delete=False
    ) as tmp:
        json.dump({"processed_ids": ids}, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        tmp_path = Path(tmp.name)

    os.replace(tmp_path, destino)
    rc_add, _ = run_git(["add", HISTORY_FILE])
    return rc_add == 0


class DeployApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Deploy — Rodando o Mundo")
        self.root.geometry("680x460")
        self.root.minsize(540, 360)
        self.root.configure(bg="#0f172a")

        self._running = False
        self._queue: queue.Queue[tuple[str, str, str]] = queue.Queue()

        self._build_ui()
        self._poll_queue()
        self._carregar_status_inicial()

    def _build_ui(self) -> None:
        bg = "#0f172a"
        card_bg = "#1e293b"
        text_fg = "#f8fafc"
        muted_fg = "#94a3b8"

        container = tk.Frame(self.root, bg=bg, padx=18, pady=16)
        container.pack(fill=tk.BOTH, expand=True)

        # Cabeçalho compacto
        header = tk.Frame(container, bg=bg)
        header.pack(fill=tk.X, pady=(0, 12))

        title_col = tk.Frame(header, bg=bg)
        title_col.pack(side=tk.LEFT, fill=tk.X, expand=True)

        tk.Label(
            title_col,
            text="Deploy do Site — Rodando o Mundo",
            font=("Segoe UI", 14, "bold"),
            fg=text_fg,
            bg=bg,
            anchor="w",
        ).pack(fill=tk.X)

        self.subtitle_label = tk.Label(
            title_col,
            text=f"Pasta: {REPO_ROOT.name}",
            font=("Segoe UI", 9),
            fg=muted_fg,
            bg=bg,
            anchor="w",
        )
        self.subtitle_label.pack(fill=tk.X, pady=(2, 0))

        self.status_badge = tk.Label(
            header,
            text="Pronto",
            font=("Segoe UI", 9, "bold"),
            fg="#e2e8f0",
            bg="#334155",
            padx=12,
            pady=5,
        )
        self.status_badge.pack(side=tk.RIGHT, anchor="n")

        # Botão único principal de Deploy
        self.deploy_btn = tk.Button(
            container,
            text="OK — Fazer Deploy Agora",
            command=self.iniciar_deploy,
            font=("Segoe UI", 12, "bold"),
            fg="#ffffff",
            bg="#16a34a",
            activebackground="#15803d",
            activeforeground="#ffffff",
            disabledforeground="#cbd5e1",
            relief=tk.FLAT,
            cursor="hand2",
            pady=12,
        )
        self.deploy_btn.pack(fill=tk.X, pady=(0, 14))
        self.root.bind("<Return>", lambda _e: self.iniciar_deploy())

        # Barra do Log
        log_bar = tk.Frame(container, bg=bg)
        log_bar.pack(fill=tk.X, pady=(0, 6))

        tk.Label(
            log_bar,
            text="Log do Deploy",
            font=("Segoe UI", 10, "bold"),
            fg="#cbd5e1",
            bg=bg,
        ).pack(side=tk.LEFT)

        self.copy_btn = tk.Button(
            log_bar,
            text="Copiar log",
            command=self.copiar_log,
            font=("Segoe UI", 8),
            fg="#cbd5e1",
            bg=card_bg,
            activebackground="#334155",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            cursor="hand2",
            padx=10,
            pady=3,
        )
        self.copy_btn.pack(side=tk.RIGHT)

        # Telinha de Log
        self.log_box = scrolledtext.ScrolledText(
            container,
            wrap=tk.WORD,
            font=("Consolas", 9),
            bg="#020617",
            fg="#e2e8f0",
            insertbackground="#e2e8f0",
            relief=tk.FLAT,
            borderwidth=8,
            state=tk.DISABLED,
        )
        self.log_box.pack(fill=tk.BOTH, expand=True)

        # Cores por tipo de mensagem
        self.log_box.tag_config("time", foreground="#64748b")
        self.log_box.tag_config("info", foreground="#e2e8f0")
        self.log_box.tag_config("step", foreground="#38bdf8", font=("Consolas", 9, "bold"))
        self.log_box.tag_config("detail", foreground="#94a3b8")
        self.log_box.tag_config("warn", foreground="#fbbf24")
        self.log_box.tag_config("ok", foreground="#4ade80", font=("Consolas", 9, "bold"))
        self.log_box.tag_config("error", foreground="#f87171", font=("Consolas", 9, "bold"))

    def _emit(self, kind: str, text: str, extra: str = "") -> None:
        self._queue.put((kind, text, extra))

    def _poll_queue(self) -> None:
        try:
            while True:
                kind, text, extra = self._queue.get_nowait()
                if kind == "log":
                    self._append_log(text, extra or "info")
                elif kind == "status":
                    self._set_badge(text, extra or "idle")
                elif kind == "subtitle":
                    self.subtitle_label.configure(text=text)
                elif kind == "done":
                    self._running = False
                    self.deploy_btn.configure(
                        state=tk.NORMAL,
                        text="OK — Fazer Deploy Agora",
                        bg="#16a34a",
                    )
        except queue.Empty:
            pass
        self.root.after(60, self._poll_queue)

    def _set_badge(self, text: str, style: str) -> None:
        palette = {
            "idle": ("#334155", "#e2e8f0"),
            "running": ("#0369a1", "#ffffff"),
            "ok": ("#15803d", "#ffffff"),
            "warn": ("#b45309", "#ffffff"),
            "error": ("#b91c1c", "#ffffff"),
        }
        bg_c, fg_c = palette.get(style, ("#334155", "#e2e8f0"))
        self.status_badge.configure(text=text, bg=bg_c, fg=fg_c)

    def _append_log(self, msg: str, tag: str = "info") -> None:
        hora = datetime.now().strftime("%H:%M:%S")
        self.log_box.configure(state=tk.NORMAL)
        self.log_box.insert(tk.END, f"[{hora}] ", "time")
        self.log_box.insert(tk.END, f"{msg}\n", tag)
        self.log_box.see(tk.END)
        self.log_box.configure(state=tk.DISABLED)

        try:
            LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            with LOG_FILE.open("a", encoding="utf-8") as fh:
                fh.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{tag.upper()}] {msg}\n")
        except OSError:
            pass

    def copiar_log(self) -> None:
        conteudo = self.log_box.get("1.0", tk.END).strip()
        self.root.clipboard_clear()
        self.root.clipboard_append(conteudo)
        self.copy_btn.configure(text="Copiado!")
        self.root.after(1500, lambda: self.copy_btn.configure(text="Copiar log"))

    def _carregar_status_inicial(self) -> None:
        def worker() -> None:
            rc_b, branch = run_git(["branch", "--show-current"])
            branch_name = branch.strip() if rc_b == 0 and branch.strip() else "(desconhecida)"
            self._emit("subtitle", f"Pasta: {REPO_ROOT.name}  •  Branch: {branch_name}")

            rc_s, status_out = run_git(["status", "--short"])
            if rc_s != 0:
                self._emit("log", f"Aviso ao verificar Git: {status_out}", "error")
                self._emit("status", "Erro no Git", "error")
                return

            linhas = [ln for ln in status_out.splitlines() if ln.strip()]
            if linhas:
                self._emit(
                    "log",
                    f"Pronto para deploy. {len(linhas)} arquivo(s) alterado(s) localmente:",
                    "step",
                )
                for ln in linhas[:15]:
                    self._emit("log", f"  {ln}", "detail")
                if len(linhas) > 15:
                    self._emit("log", f"  ... e mais {len(linhas) - 15} arquivo(s).", "detail")
            else:
                self._emit(
                    "log",
                    "Pronto. Nenhuma alteração local não salva no momento (clicar em Deploy ainda envia commits pendentes, se houver).",
                    "info",
                )

        threading.Thread(target=worker, daemon=True).start()

    def iniciar_deploy(self) -> None:
        if self._running:
            return
        self._running = True
        self.deploy_btn.configure(
            state=tk.DISABLED,
            text="Fazendo deploy... aguarde",
            bg="#475569",
        )
        self._set_badge("Enviando...", "running")
        self._append_log("=" * 56, "detail")
        self._append_log("Iniciando deploy do site...", "step")

        threading.Thread(target=self._executar_deploy, daemon=True).start()

    def _falhar(self, etapa: str, saida_tecnica: str, motivo_extra: str = "") -> None:
        if saida_tecnica.strip():
            for ln in saida_tecnica.splitlines():
                if ln.strip():
                    self._emit("log", f"  {ln}", "detail")
        explicacao = motivo_extra or diagnosticar_erro_git(etapa, saida_tecnica)
        self._emit("log", f"FALHA ({etapa}): {explicacao}", "error")
        self._emit("status", "Erro no deploy", "error")
        self._emit("done", "", "")

    def _tentar_rebase_com_recuperacao(self, branch: str) -> tuple[bool, str]:
        """Executa git rebase origin/<branch> e resolve automaticamente JSONs de bots."""
        rc, out = run_git(
            ["rebase", f"origin/{branch}"],
            on_line=lambda ln: self._emit("log", f"  {ln}", "detail"),
        )
        if rc == 0:
            return True, ""

        # Pode haver vários commits em rebase; tenta resolver conflitos de dados gerados
        for _ in range(10):
            rc_u, conflitos_out = run_git(["diff", "--name-only", "--diff-filter=U"])
            conflitos = [c.strip() for c in conflitos_out.splitlines() if c.strip()]
            if not conflitos:
                break

            bloqueadores = [
                f for f in conflitos
                if f not in AUTO_GENERATED_REMOTE_WINS and f != HISTORY_FILE
            ]
            if bloqueadores:
                run_git(["rebase", "--abort"])
                lista = ", ".join(bloqueadores)
                return (
                    False,
                    f"Conflito nos arquivos: {lista}. "
                    "O rebase foi cancelado com segurança para não perder seu trabalho.",
                )

            self._emit(
                "log",
                "Conflito apenas em arquivos automáticos dos bots; resolvendo automaticamente...",
                "warn",
            )
            for arq in conflitos:
                if arq == HISTORY_FILE:
                    if not _resolver_conflito_history():
                        run_git(["rebase", "--abort"])
                        return False, f"Não foi possível mesclar automaticamente {HISTORY_FILE}."
                else:
                    rc_co, out_co = run_git(["checkout", f"origin/{branch}", "--", arq])
                    rc_ad, out_ad = run_git(["add", arq])
                    if rc_co != 0 or rc_ad != 0:
                        run_git(["rebase", "--abort"])
                        return False, f"Falha ao resolver {arq}: {out_co or out_ad}"

            rc_cont, out_cont = run_git(["rebase", "--continue"])
            if rc_cont == 0:
                return True, ""
            out = out_cont

        run_git(["rebase", "--abort"])
        return False, out or "Falha ao sincronizar alterações com o GitHub (rebase)."

    def _executar_deploy(self) -> None:
        # 1. Validar estado do repositório
        git_dir = REPO_ROOT / ".git"
        if not git_dir.exists():
            self._falhar("Verificação", "", f"A pasta {REPO_ROOT} não é um repositório Git.")
            return

        if (git_dir / "rebase-merge").exists() or (git_dir / "rebase-apply").exists() or (git_dir / "MERGE_HEAD").exists():
            self._falhar(
                "Verificação",
                "",
                "Existe um rebase ou merge inacabado no Git. Finalize ou aborte antes de fazer deploy.",
            )
            return

        rc_b, branch_out = run_git(["branch", "--show-current"])
        branch = branch_out.strip()
        if rc_b != 0 or not branch:
            self._falhar(
                "Branch",
                branch_out,
                "Não foi possível identificar a branch atual (ou o repositório está em detached HEAD).",
            )
            return

        rc_r, remote_out = run_git(["remote", "get-url", "origin"])
        if rc_r != 0:
            self._falhar("Remote", remote_out, "O repositório não tem um destino 'origin' configurado.")
            return

        self._emit("log", f"[1/4] Verificando alterações na branch '{branch}'...", "step")

        # 2. Adicionar e commitar alterações locais (se houver)
        rc_st, st_out = run_git(["status", "--porcelain"])
        if rc_st != 0:
            self._falhar("Status", st_out)
            return

        mudancas = [ln for ln in st_out.splitlines() if ln.strip()]
        if mudancas:
            self._emit("log", f"[2/4] Salvando {len(mudancas)} alteração(ões) no commit...", "step")
            rc_add, add_out = run_git(["add", "-A"])
            if rc_add != 0:
                self._falhar("git add", add_out)
                return

            rc_diff, _ = run_git(["diff", "--cached", "--quiet"])
            if rc_diff != 0:
                msg_commit = f"deploy ({datetime.now().strftime('%Y-%m-%d %H:%M')})"
                rc_cm, cm_out = run_git(
                    ["commit", "-m", msg_commit],
                    on_line=lambda ln: self._emit("log", f"  {ln}", "detail"),
                )
                if rc_cm != 0:
                    self._falhar("git commit", cm_out)
                    return
                self._emit("log", f"Commit criado: {msg_commit}", "info")
        else:
            self._emit("log", "[2/4] Nenhuma alteração local nova; verificando commits pendentes...", "step")

        # 3. Sincronizar com o GitHub (fetch + rebase se necessário) e fazer push (com 1 retry em corrida de bot)
        for tentativa in (1, 2):
            self._emit("log", f"[3/4] Sincronizando com o GitHub (origin/{branch})...", "step")
            rc_f, f_out = run_git(["fetch", "origin", branch])
            if rc_f != 0:
                self._falhar("git fetch", f_out)
                return

            rc_beh, beh_out = run_git(["rev-list", "--count", f"HEAD..origin/{branch}"])
            atrasados = int(beh_out.strip()) if rc_beh == 0 and beh_out.strip().isdigit() else 0
            if atrasados > 0:
                self._emit(
                    "log",
                    f"Há {atrasados} commit(s) novo(s) no GitHub. Atualizando sua cópia antes de enviar...",
                    "warn",
                )
                ok_reb, err_reb = self._tentar_rebase_com_recuperacao(branch)
                if not ok_reb:
                    self._falhar("Sincronização (rebase)", err_reb, err_reb)
                    return

            rc_ah, ah_out = run_git(["rev-list", "--count", f"origin/{branch}..HEAD"])
            adiantados = int(ah_out.strip()) if rc_ah == 0 and ah_out.strip().isdigit() else 0
            if adiantados == 0:
                self._emit(
                    "log",
                    "Nenhuma alteração pendente — o site no GitHub já está 100% atualizado.",
                    "ok",
                )
                self._emit("status", "Já atualizado", "ok")
                self._emit("done", "", "")
                return

            self._emit("log", f"[4/4] Enviando {adiantados} commit(s) para o site (git push)...", "step")
            rc_p, p_out = run_git(
                ["push", "origin", branch],
                on_line=lambda ln: self._emit("log", f"  {ln}", "detail"),
            )
            if rc_p == 0:
                rc_h, hash_out = run_git(["rev-parse", "--short", "HEAD"])
                commit_hash = hash_out.strip() if rc_h == 0 else ""
                self._emit(
                    "log",
                    f"SUCESSO! Deploy enviado para origin/{branch} (commit {commit_hash}).",
                    "ok",
                )
                self._emit(
                    "log",
                    "O servidor (Cloudflare Pages / GitHub) já iniciou a publicação automática.",
                    "ok",
                )
                self._emit("status", "Deploy concluído", "ok")
                self._emit("done", "", "")
                return

            # Se deu non-fast-forward porque um bot publicou no exato instante, tenta mais uma vez
            texto_p = (p_out or "").lower()
            if tentativa == 1 and ("non-fast-forward" in texto_p or "fetch first" in texto_p):
                self._emit(
                    "log",
                    "O GitHub recebeu um commit automático durante o envio. Re-sincronizando e tentando novamente...",
                    "warn",
                )
                continue

            self._falhar("git push", p_out)
            return


def main() -> None:
    root = tk.Tk()
    DeployApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
