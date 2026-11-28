#!/usr/bin/env python3
"""
Mini aplicativo de Deploy — Rodando o Mundo
Interface simples com seletor de pasta/versão, botão de deploy (commit + sync + push)
e uma tela de log detalhada que aponta claramente qualquer erro.
"""

from __future__ import annotations

import json
import os
import queue
import re
import subprocess
import sys
import tempfile
import threading
import tkinter as tk
from datetime import datetime
from pathlib import Path
from tkinter import filedialog, messagebox, scrolledtext, ttk

# Arquivos gerados automaticamente pelos bots do GitHub Actions
# (regra documentada em docs/gerenciamento-dados-gerados.md)
AUTO_GENERATED_REMOTE_WINS = {
    "data/vitrine_ia.json",
    "data/feed_output.json",
    "data/noticias_x.json",
    "data/entenda_v2.json",
}
HISTORY_FILE = "data/history.json"
CONFIG_FILE = Path.home() / ".rom_deploy_config.json"


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
    cwd: Path,
    on_line=None,
    timeout: int = 120,
) -> tuple[int, str]:
    """Executa um comando git no diretório cwd sem abrir janela preta."""
    cmd = ["git", *args]
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd),
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


def _resolver_conflito_history(repo_root: Path) -> bool:
    """Faz união dos processed_ids de data/history.json conforme regra do projeto."""
    rc_a, out_a = run_git(["show", f":2:{HISTORY_FILE}"], cwd=repo_root)
    rc_b, out_b = run_git(["show", f":3:{HISTORY_FILE}"], cwd=repo_root)
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

    destino = repo_root / HISTORY_FILE
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=str(destino.parent), delete=False
    ) as tmp:
        json.dump({"processed_ids": ids}, tmp, ensure_ascii=False, indent=2)
        tmp.write("\n")
        tmp_path = Path(tmp.name)

    os.replace(tmp_path, destino)
    rc_add, _ = run_git(["add", HISTORY_FILE], cwd=repo_root)
    return rc_add == 0


def find_rom_directories() -> list[Path]:
    """Descobre pastas de versões do projeto RoM ordenadas da mais nova para a mais antiga."""
    candidatos: list[Path] = []
    vistos: set[Path] = set()

    # Pasta do script atual
    este_script_repo = Path(__file__).resolve().parent.parent
    if este_script_repo.is_dir():
        candidatos.append(este_script_repo)
        vistos.add(este_script_repo.resolve())

    # Diretório base comum (ex: C:\...\prj\RoM)
    base_dir = este_script_repo.parent
    if base_dir.is_dir():
        for item in base_dir.iterdir():
            if item.is_dir() and item.resolve() not in vistos:
                if (item / ".git").is_dir() or re.search(r"ROM\s*V", item.name, re.IGNORECASE):
                    candidatos.append(item)
                    vistos.add(item.resolve())

    def versao_sort_key(p: Path):
        m = re.search(r"ROM\s*V?(\d+)(?:\.(\d+))?", p.name, re.IGNORECASE)
        if m:
            maj = int(m.group(1))
            min_v = int(m.group(2)) if m.group(2) else 0
            return (1, maj, min_v)
        return (0, 0, str(p.name))

    candidatos.sort(key=versao_sort_key, reverse=True)
    return candidatos


def load_preferred_repo(candidatos: list[Path]) -> Path:
    """Carrega o repositório salvo nas preferências ou escolhe o mais atual."""
    if CONFIG_FILE.is_file():
        try:
            with CONFIG_FILE.open("r", encoding="utf-8") as f:
                data = json.load(f)
                salvo = Path(data.get("last_selected_folder", ""))
                if salvo.is_dir() and (salvo / ".git").is_dir():
                    return salvo
        except Exception:
            pass

    # Se não houver configuração salva válida, escolhe o candidato com maior versão com .git
    for c in candidatos:
        if (c / ".git").is_dir():
            return c

    # Fallback
    return Path(__file__).resolve().parent.parent


def save_preferred_repo(p: Path) -> None:
    """Salva a pasta escolhida como preferida para as próximas aberturas."""
    try:
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        with CONFIG_FILE.open("w", encoding="utf-8") as f:
            json.dump({"last_selected_folder": str(p.resolve())}, f, indent=2)
    except Exception:
        pass


class DeployApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("Deploy — Rodando o Mundo")
        self.root.geometry("720x540")
        self.root.minsize(580, 420)
        self.root.configure(bg="#0f172a")

        self._running = False
        self._queue: queue.Queue[tuple[str, str, str]] = queue.Queue()

        self.candidatos = find_rom_directories()
        self.repo_root = load_preferred_repo(self.candidatos)

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
        header.pack(fill=tk.X, pady=(0, 10))

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
            text=f"Pasta ativa: {self.repo_root.name}",
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

        # Cartão de Seleção de Pasta / Versão
        folder_card = tk.Frame(container, bg=card_bg, padx=12, pady=10, relief=tk.FLAT)
        folder_card.pack(fill=tk.X, pady=(0, 12))

        top_folder_row = tk.Frame(folder_card, bg=card_bg)
        top_folder_row.pack(fill=tk.X, pady=(0, 6))

        tk.Label(
            top_folder_row,
            text="📁 Selecionar pasta da versão para fazer deploy:",
            font=("Segoe UI", 9, "bold"),
            fg="#93c5fd",
            bg=card_bg,
        ).pack(side=tk.LEFT)

        # Linha com Dropdown + Botão Procurar + Botão Recarregar
        pick_row = tk.Frame(folder_card, bg=card_bg)
        pick_row.pack(fill=tk.X)

        self._folder_map: dict[str, Path] = {}
        valores_combo: list[str] = []
        for c in self.candidatos:
            tag_git = "" if (c / ".git").is_dir() else " [sem .git]"
            rotulo = f"{c.name}{tag_git}"
            self._folder_map[rotulo] = c
            valores_combo.append(rotulo)

        self.folder_var = tk.StringVar()
        self.folder_combo = ttk.Combobox(
            pick_row,
            textvariable=self.folder_var,
            values=valores_combo,
            state="readonly",
            font=("Segoe UI", 9),
        )
        self.folder_combo.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=(0, 8))
        self.folder_combo.bind("<<ComboboxSelected>>", self._on_folder_selected)

        # Seleciona o item correspondente ao repo_root atual
        self._sincronizar_combobox_com_repo()

        self.browse_btn = tk.Button(
            pick_row,
            text="Procurar pasta...",
            command=self._procurar_outra_pasta,
            font=("Segoe UI", 9),
            fg="#ffffff",
            bg="#2563eb",
            activebackground="#1d4ed8",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            cursor="hand2",
            padx=10,
            pady=3,
        )
        self.browse_btn.pack(side=tk.LEFT, padx=(0, 6))

        self.refresh_btn = tk.Button(
            pick_row,
            text="↻ Atualizar",
            command=self._recarregar_lista_pastas,
            font=("Segoe UI", 8),
            fg="#cbd5e1",
            bg="#334155",
            activebackground="#475569",
            activeforeground="#ffffff",
            relief=tk.FLAT,
            cursor="hand2",
            padx=8,
            pady=3,
        )
        self.refresh_btn.pack(side=tk.LEFT)

        # Informação detalhada do caminho
        self.path_info_label = tk.Label(
            folder_card,
            text=str(self.repo_root.resolve()),
            font=("Consolas", 8),
            fg="#64748b",
            bg=card_bg,
            anchor="w",
        )
        self.path_info_label.pack(fill=tk.X, pady=(6, 0))

        # Botão único principal de Deploy
        self.deploy_btn = tk.Button(
            container,
            text=f"OK — Fazer Deploy de {self.repo_root.name}",
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
        self.deploy_btn.pack(fill=tk.X, pady=(0, 12))
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

    def _sincronizar_combobox_com_repo(self) -> None:
        escolhido = None
        for rotulo, path in self._folder_map.items():
            if path.resolve() == self.repo_root.resolve():
                escolhido = rotulo
                break
        if not escolhido:
            tag_git = "" if (self.repo_root / ".git").is_dir() else " [sem .git]"
            escolhido = f"{self.repo_root.name}{tag_git}"
            self._folder_map[escolhido] = self.repo_root
            vals = list(self.folder_combo["values"])
            if escolhido not in vals:
                vals.insert(0, escolhido)
                self.folder_combo["values"] = vals
        self.folder_var.set(escolhido)

    def _on_folder_selected(self, _event=None) -> None:
        if self._running:
            return
        rotulo = self.folder_var.get()
        if rotulo in self._folder_map:
            self.trocar_pasta(self._folder_map[rotulo])

    def _procurar_outra_pasta(self) -> None:
        if self._running:
            return
        inicial = self.repo_root.parent if self.repo_root.parent.is_dir() else self.repo_root
        caminho = filedialog.askdirectory(
            initialdir=str(inicial),
            title="Selecione a pasta do projeto (ex: ROM V2.2)",
        )
        if caminho:
            pasta = Path(caminho)
            self.trocar_pasta(pasta)

    def _recarregar_lista_pastas(self) -> None:
        if self._running:
            return
        self.candidatos = find_rom_directories()
        self._folder_map.clear()
        valores: list[str] = []
        for c in self.candidatos:
            tag_git = "" if (c / ".git").is_dir() else " [sem .git]"
            rotulo = f"{c.name}{tag_git}"
            self._folder_map[rotulo] = c
            valores.append(rotulo)
        self.folder_combo["values"] = valores
        self._sincronizar_combobox_com_repo()
        self._append_log("Lista de pastas atualizada.", "info")

    def trocar_pasta(self, nova_pasta: Path) -> None:
        if self._running:
            return

        self.repo_root = nova_pasta
        save_preferred_repo(nova_pasta)
        self._sincronizar_combobox_com_repo()

        self.path_info_label.configure(text=str(self.repo_root.resolve()))
        self.subtitle_label.configure(text=f"Pasta ativa: {self.repo_root.name}")

        tem_git = (self.repo_root / ".git").is_dir()
        if not tem_git:
            self.deploy_btn.configure(
                state=tk.DISABLED,
                text="A pasta não tem Git (.git)",
                bg="#475569",
            )
            self._set_badge("Sem Git", "warn")
            self._limpar_log()
            self._append_log(f"Pasta alterada para: {self.repo_root}", "step")
            self._append_log(
                "Atenção: Esta pasta não possui repositório Git (.git). "
                "Selecione uma pasta com repositório Git válido para fazer deploy.",
                "warn",
            )
            return

        self.deploy_btn.configure(
            state=tk.NORMAL,
            text=f"OK — Fazer Deploy de {self.repo_root.name}",
            bg="#16a34a",
        )
        self._limpar_log()
        self._append_log(f"Pasta alterada para: {self.repo_root.name}", "step")
        self._append_log(f"Caminho: {self.repo_root.resolve()}", "detail")
        self._carregar_status_inicial()

    def _limpar_log(self) -> None:
        self.log_box.configure(state=tk.NORMAL)
        self.log_box.delete("1.0", tk.END)
        self.log_box.configure(state=tk.DISABLED)

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
                    tem_git = (self.repo_root / ".git").is_dir()
                    if tem_git:
                        self.deploy_btn.configure(
                            state=tk.NORMAL,
                            text=f"OK — Fazer Deploy de {self.repo_root.name}",
                            bg="#16a34a",
                        )
                    else:
                        self.deploy_btn.configure(
                            state=tk.DISABLED,
                            text="A pasta não tem Git (.git)",
                            bg="#475569",
                        )
                    self.browse_btn.configure(state=tk.NORMAL)
                    self.folder_combo.configure(state="readonly")
                    self.refresh_btn.configure(state=tk.NORMAL)
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
            log_file = self.repo_root / "_backups" / "deploy_app.log"
            log_file.parent.mkdir(parents=True, exist_ok=True)
            with log_file.open("a", encoding="utf-8") as fh:
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
        def worker(alvo: Path) -> None:
            if not (alvo / ".git").is_dir():
                self._emit("subtitle", f"Pasta: {alvo.name}  •  Sem repositório Git")
                self._emit("status", "Sem Git", "warn")
                return

            rc_b, branch = run_git(["branch", "--show-current"], cwd=alvo)
            branch_name = branch.strip() if rc_b == 0 and branch.strip() else "(desconhecida)"
            self._emit("subtitle", f"Pasta: {alvo.name}  •  Branch: {branch_name}")

            rc_s, status_out = run_git(["status", "--short"], cwd=alvo)
            if rc_s != 0:
                self._emit("log", f"Aviso ao verificar Git em {alvo.name}: {status_out}", "error")
                self._emit("status", "Erro no Git", "error")
                return

            self._emit("status", "Pronto", "idle")
            linhas = [ln for ln in status_out.splitlines() if ln.strip()]
            if linhas:
                self._emit(
                    "log",
                    f"Pronto para deploy em '{alvo.name}'. {len(linhas)} arquivo(s) alterado(s) localmente:",
                    "step",
                )
                for ln in linhas[:15]:
                    self._emit("log", f"  {ln}", "detail")
                if len(linhas) > 15:
                    self._emit("log", f"  ... e mais {len(linhas) - 15} arquivo(s).", "detail")
            else:
                self._emit(
                    "log",
                    f"Pronto em '{alvo.name}'. Nenhuma alteração local não salva no momento (o deploy enviará commits pendentes, se houver).",
                    "info",
                )

        threading.Thread(target=worker, args=(self.repo_root,), daemon=True).start()

    def iniciar_deploy(self) -> None:
        if self._running:
            return
        if not (self.repo_root / ".git").is_dir():
            messagebox.showwarning(
                "Pasta inválida",
                f"A pasta '{self.repo_root.name}' não possui um repositório Git (.git).\n"
                "Selecione uma pasta de versão válida antes de continuar.",
            )
            return

        self._running = True
        self.deploy_btn.configure(
            state=tk.DISABLED,
            text=f"Fazendo deploy de {self.repo_root.name}... aguarde",
            bg="#475569",
        )
        self.browse_btn.configure(state=tk.DISABLED)
        self.folder_combo.configure(state=tk.DISABLED)
        self.refresh_btn.configure(state=tk.DISABLED)

        self._set_badge("Enviando...", "running")
        self._append_log("=" * 56, "detail")
        self._append_log(f"Iniciando deploy da pasta: {self.repo_root.name} ({self.repo_root.resolve()})", "step")

        threading.Thread(target=self._executar_deploy, args=(self.repo_root,), daemon=True).start()

    def _falhar(self, etapa: str, saida_tecnica: str, motivo_extra: str = "") -> None:
        if saida_tecnica.strip():
            for ln in saida_tecnica.splitlines():
                if ln.strip():
                    self._emit("log", f"  {ln}", "detail")
        explicacao = motivo_extra or diagnosticar_erro_git(etapa, saida_tecnica)
        self._emit("log", f"FALHA ({etapa}): {explicacao}", "error")
        self._emit("status", "Erro no deploy", "error")
        self._emit("done", "", "")

    def _tentar_rebase_com_recuperacao(self, branch: str, cwd: Path) -> tuple[bool, str]:
        """Executa git rebase origin/<branch> e resolve automaticamente JSONs de bots."""
        rc, out = run_git(
            ["rebase", f"origin/{branch}"],
            cwd=cwd,
            on_line=lambda ln: self._emit("log", f"  {ln}", "detail"),
        )
        if rc == 0:
            return True, ""

        # Pode haver vários commits em rebase; tenta resolver conflitos de dados gerados
        for _ in range(10):
            rc_u, conflitos_out = run_git(["diff", "--name-only", "--diff-filter=U"], cwd=cwd)
            conflitos = [c.strip() for c in conflitos_out.splitlines() if c.strip()]
            if not conflitos:
                break

            bloqueadores = [
                f for f in conflitos
                if f not in AUTO_GENERATED_REMOTE_WINS and f != HISTORY_FILE
            ]
            if bloqueadores:
                run_git(["rebase", "--abort"], cwd=cwd)
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
                    if not _resolver_conflito_history(cwd):
                        run_git(["rebase", "--abort"], cwd=cwd)
                        return False, f"Não foi possível mesclar automaticamente {HISTORY_FILE}."
                else:
                    rc_co, out_co = run_git(["checkout", f"origin/{branch}", "--", arq], cwd=cwd)
                    rc_ad, out_ad = run_git(["add", arq], cwd=cwd)
                    if rc_co != 0 or rc_ad != 0:
                        run_git(["rebase", "--abort"], cwd=cwd)
                        return False, f"Falha ao resolver {arq}: {out_co or out_ad}"

            rc_cont, out_cont = run_git(["rebase", "--continue"], cwd=cwd)
            if rc_cont == 0:
                return True, ""
            out = out_cont

        run_git(["rebase", "--abort"], cwd=cwd)
        return False, out or "Falha ao sincronizar alterações com o GitHub (rebase)."

    def _executar_deploy(self, cwd: Path) -> None:
        # 1. Validar estado do repositório
        git_dir = cwd / ".git"
        if not git_dir.exists():
            self._falhar("Verificação", "", f"A pasta {cwd} não é um repositório Git.")
            return

        if (git_dir / "rebase-merge").exists() or (git_dir / "rebase-apply").exists() or (git_dir / "MERGE_HEAD").exists():
            self._falhar(
                "Verificação",
                "",
                "Existe um rebase ou merge inacabado no Git. Finalize ou aborte antes de fazer deploy.",
            )
            return

        rc_b, branch_out = run_git(["branch", "--show-current"], cwd=cwd)
        branch = branch_out.strip()
        if rc_b != 0 or not branch:
            self._falhar(
                "Branch",
                branch_out,
                "Não foi possível identificar a branch atual (ou o repositório está em detached HEAD).",
            )
            return

        rc_r, remote_out = run_git(["remote", "get-url", "origin"], cwd=cwd)
        if rc_r != 0:
            self._falhar("Remote", remote_out, "O repositório não tem um destino 'origin' configurado.")
            return

        self._emit("log", f"[1/4] Verificando alterações na branch '{branch}' ({cwd.name})...", "step")

        # 2. Adicionar e commitar alterações locais (se houver)
        rc_st, st_out = run_git(["status", "--porcelain"], cwd=cwd)
        if rc_st != 0:
            self._falhar("Status", st_out)
            return

        mudancas = [ln for ln in st_out.splitlines() if ln.strip()]
        if mudancas:
            self._emit("log", f"[2/4] Salvando {len(mudancas)} alteração(ões) no commit...", "step")
            rc_add, add_out = run_git(["add", "-A"], cwd=cwd)
            if rc_add != 0:
                self._falhar("git add", add_out)
                return

            rc_diff, _ = run_git(["diff", "--cached", "--quiet"], cwd=cwd)
            if rc_diff != 0:
                msg_commit = f"deploy ({datetime.now().strftime('%Y-%m-%d %H:%M')})"
                rc_cm, cm_out = run_git(
                    ["commit", "-m", msg_commit],
                    cwd=cwd,
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
            rc_f, f_out = run_git(["fetch", "origin", branch], cwd=cwd)
            if rc_f != 0:
                self._falhar("git fetch", f_out)
                return

            rc_beh, beh_out = run_git(["rev-list", "--count", f"HEAD..origin/{branch}"], cwd=cwd)
            atrasados = int(beh_out.strip()) if rc_beh == 0 and beh_out.strip().isdigit() else 0
            if atrasados > 0:
                self._emit(
                    "log",
                    f"Há {atrasados} commit(s) novo(s) no GitHub. Atualizando sua cópia antes de enviar...",
                    "warn",
                )
                ok_reb, err_reb = self._tentar_rebase_com_recuperacao(branch, cwd=cwd)
                if not ok_reb:
                    self._falhar("Sincronização (rebase)", err_reb, err_reb)
                    return

            rc_ah, ah_out = run_git(["rev-list", "--count", f"origin/{branch}..HEAD"], cwd=cwd)
            adiantados = int(ah_out.strip()) if rc_ah == 0 and ah_out.strip().isdigit() else 0
            if adiantados == 0:
                self._emit(
                    "log",
                    f"Nenhuma alteração pendente — o site no GitHub já está 100% atualizado com '{cwd.name}'.",
                    "ok",
                )
                self._emit("status", "Já atualizado", "ok")
                self._emit("done", "", "")
                return

            self._emit("log", f"[4/4] Enviando {adiantados} commit(s) para o site (git push)...", "step")
            rc_p, p_out = run_git(
                ["push", "origin", branch],
                cwd=cwd,
                on_line=lambda ln: self._emit("log", f"  {ln}", "detail"),
            )
            if rc_p == 0:
                rc_h, hash_out = run_git(["rev-parse", "--short", "HEAD"], cwd=cwd)
                commit_hash = hash_out.strip() if rc_h == 0 else ""
                self._emit(
                    "log",
                    f"SUCESSO! Deploy da pasta {cwd.name} enviado para origin/{branch} (commit {commit_hash}).",
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
