(function () {
  const $ = (id) => document.getElementById(id);

  const els = {
    btnNew: $("btnNew"),
    btnDisable: $("btnDisable"),
    searchInput: $("searchInput"),
    profilesBody: $("profilesBody"),
    live: $("live"),

    activeName: $("activeName"),
    activeMeta: $("activeMeta"),

    modal: $("modal"),
    modalBackdrop: $("modalBackdrop"),
    modalTitle: $("modalTitle"),
    btnCloseModal: $("btnCloseModal"),

    form: $("profileForm"),
    formError: $("formError"),
    btnCancel: $("btnCancel"),

    name: $("name"),
    type: $("type"),
    host: $("host"),
    port: $("port"),

    pacValue: $("pacValue"),
    bypass: $("bypass"),

    username: $("username"),
    password: $("password"),

    hostField: $("hostField"),
    portField: $("portField"),
    pacUrlField: $("pacUrlField"),
  };

  const STORAGE_KEY = "proxy_ui_profiles_v1";
  const ACTIVE_KEY = "proxy_ui_active_profile_id_v1";

  /**
   * @type {{
   *  id:string,
   *  name:string,
   *  type:"direct"|"http"|"https"|"socks5"|"pac",
   *  host?:string,
   *  port?:number,
   *  pacUrl?:string,
   *  pacScript?:string,
   *  bypass?:string,
   *  username?:string,
   *  password?:string
   * }[]}
   */
  let profiles = loadProfiles();
  let activeProfileId = localStorage.getItem(ACTIVE_KEY);

  // Modal state
  let editingId = null;
  let lastFocusedBeforeModal = null;

  init();

  function init() {
    // Seed se vazio
    if (profiles.length === 0) {
      profiles = [
        { id: uid(), name: "Direto", type: "direct", bypass: "" },
        {
          id: uid(),
          name: "HTTP Exemplo",
          type: "http",
          host: "127.0.0.1",
          port: 8080,
          bypass: "localhost\n127.0.0.1",
        },
        {
          id: uid(),
          name: "PAC Exemplo (URL)",
          type: "pac",
          pacUrl: "https://exemplo.com/proxy.pac",
          bypass: "localhost\n127.0.0.1\n*.local",
        },
      ];
      saveProfiles();
    }

    // Garantir ativo válido
    if (activeProfileId && !profiles.some((p) => p.id === activeProfileId)) {
      activeProfileId = null;
      localStorage.removeItem(ACTIVE_KEY);
    }

    // Começa sempre fechado
    els.modal.classList.add("hidden");
    els.modalBackdrop.classList.add("hidden");
    els.modal.hidden = true;
    els.modalBackdrop.hidden = true;
    els.modalBackdrop.setAttribute("aria-hidden", "true");

    render();

    els.btnNew.addEventListener("click", () => openModalForCreate());
    els.btnDisable.addEventListener("click", () => setActive(null));
    els.searchInput.addEventListener("input", render);

    // Modal events
    els.btnCloseModal.addEventListener("click", closeModal);
    els.btnCancel.addEventListener("click", closeModal);
    els.modalBackdrop.addEventListener("click", closeModal);

    // Esc + focus trap
    document.addEventListener("keydown", (e) => {
      if (!isModalOpen()) return;

      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }

      if (e.key === "Tab") {
        trapFocus(e);
      }
    });

    els.type.addEventListener("change", syncFieldsByType);

    // Form submit
    els.form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearFormError();

      const data = readForm();
      const validation = validate(data);
      if (!validation.ok) {
        showFormError(validation.message);
        return;
      }

      const normalized = normalizeFormData(data);

      if (editingId) {
        profiles = profiles.map((p) =>
          p.id === editingId ? { ...p, ...normalized, id: editingId } : p
        );
        announce(`Perfil "${normalized.name}" atualizado.`);
      } else {
        const id = uid();
        profiles = [{ id, ...normalized }, ...profiles];
        announce(`Perfil "${normalized.name}" criado.`);
      }

      saveProfiles();
      closeModal();
      render();
    });
  }

  function render() {
    const query = (els.searchInput.value || "").trim().toLowerCase();
    const filtered = profiles.filter((p) => p.name.toLowerCase().includes(query));

    // Active panel
    const active = activeProfileId ? profiles.find((p) => p.id === activeProfileId) : null;
    if (active) {
      els.activeName.textContent = active.name;
      els.activeMeta.textContent = describeProfile(active);
      els.btnDisable.disabled = false;
    } else {
      els.activeName.textContent = "Nenhum (Direto)";
      els.activeMeta.textContent = "Sem proxy ativo (mock).";
      els.btnDisable.disabled = true;
    }

    // Table
    els.profilesBody.innerHTML = "";
    if (filtered.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.innerHTML = `<span class="muted">Nenhum perfil encontrado.</span>`;
      tr.appendChild(td);
      els.profilesBody.appendChild(tr);
      return;
    }

    for (const p of filtered) {
      els.profilesBody.appendChild(renderRow(p));
    }

    // Legenda colorblind (injetada uma vez abaixo da tabela)
    renderColorblindLegend();
  }

  function renderRow(p) {
    const tr = document.createElement("tr");

    // Marca a linha com classe se for o ativo (borda lateral via CSS)
    if (p.id === activeProfileId) {
      tr.classList.add("is-active");
    }

    // Nome + badge
    const tdName = document.createElement("td");
    tdName.innerHTML = `
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
        <strong>${escapeHtml(p.name)}</strong>
        ${
          p.id === activeProfileId
            ? `<span class="badge" aria-label="Perfil ativo">✔ Ativo</span>`
            : ""
        }
      </div>
    `;

    // Tipo com ícone (forma além de cor)
    const tdType = document.createElement("td");
    tdType.innerHTML = `<span style="font-family:'IBM Plex Mono',monospace;font-size:0.88rem;">${escapeHtml(typeLabel(p.type))}</span>`;

    // Servidor
    const tdServer = document.createElement("td");
    tdServer.style.cssText = "font-family:'IBM Plex Mono',monospace;font-size:0.85rem;word-break:break-all;";
    tdServer.textContent = serverLabel(p);

    // Ações com ícones (forma + texto, não só cor)
    const tdActions = document.createElement("td");
    const actions = document.createElement("div");
    actions.className = "actions";

    const btnActivate = document.createElement("button");
    btnActivate.className = "btn success";
    btnActivate.type = "button";
    btnActivate.innerHTML = `<span class="btn-icon" aria-hidden="true">▶</span> Ativar`;
    btnActivate.setAttribute("aria-label", `Ativar perfil ${p.name}`);
    btnActivate.addEventListener("click", () => setActive(p.id));

    const btnEdit = document.createElement("button");
    btnEdit.className = "btn warning";
    btnEdit.type = "button";
    btnEdit.innerHTML = `<span class="btn-icon" aria-hidden="true">✏</span> Editar`;
    btnEdit.setAttribute("aria-label", `Editar perfil ${p.name}`);
    btnEdit.addEventListener("click", () => openModalForEdit(p.id));

    const btnDelete = document.createElement("button");
    btnDelete.className = "btn danger";
    btnDelete.type = "button";
    btnDelete.innerHTML = `<span class="btn-icon" aria-hidden="true">🗑</span> Excluir`;
    btnDelete.setAttribute("aria-label", `Excluir perfil ${p.name}`);
    btnDelete.addEventListener("click", () => removeProfile(p.id));

    actions.append(btnActivate, btnEdit, btnDelete);
    tdActions.appendChild(actions);

    tr.append(tdName, tdType, tdServer, tdActions);
    return tr;
  }

  /**
   * Injeta (ou atualiza) uma legenda visual abaixo da tabela
   * visível apenas no tema colorblind, explicando a codificação de cores.
   */
  function renderColorblindLegend() {
    const tableWrap = document.querySelector(".table-wrap");
    if (!tableWrap) return;

    let legend = document.querySelector(".colorblind-legend");
    if (!legend) {
      legend = document.createElement("div");
      legend.className = "colorblind-legend";
      legend.setAttribute("aria-label", "Legenda de cores");
      tableWrap.insertAdjacentElement("afterend", legend);
    }

    legend.innerHTML = `
      <span><span class="legend-dot" style="background:var(--success)"></span> Ativar / Salvar (verde)</span>
      <span><span class="legend-dot" style="background:var(--warning)"></span> Editar (amarelo)</span>
      <span><span class="legend-dot" style="background:var(--danger)"></span> Excluir (laranja)</span>
      <span><span class="legend-dot" style="background:var(--badge-bg); border:1.5px solid var(--badge-border)"></span> Perfil ativo (azul)</span>
    `;
  }

  function setActive(idOrNull) {
    if (idOrNull === null) {
      activeProfileId = null;
      localStorage.removeItem(ACTIVE_KEY);
      announce("Modo direto ativado (mock).");
      render();
      return;
    }
    const p = profiles.find((p) => p.id === idOrNull);
    if (!p) return;

    activeProfileId = idOrNull;
    localStorage.setItem(ACTIVE_KEY, idOrNull);
    announce(`Perfil "${p.name}" ativado (mock).`);
    render();
  }

  function removeProfile(id) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;

    const ok = confirm(`Excluir o perfil "${p.name}"?`);
    if (!ok) return;

    profiles = profiles.filter((x) => x.id !== id);
    saveProfiles();

    if (activeProfileId === id) {
      activeProfileId = null;
      localStorage.removeItem(ACTIVE_KEY);
      announce(`Perfil "${p.name}" excluído. Modo direto ativado.`);
    } else {
      announce(`Perfil "${p.name}" excluído.`);
    }

    render();
  }

  function openModalForCreate() {
    editingId = null;
    els.modalTitle.textContent = "Novo perfil";
    fillForm({
      name: "",
      type: "direct",
      host: "",
      port: "",
      pacValue: "",
      bypass: "",
      username: "",
      password: "",
    });
    openModal(() => els.name.focus());
  }

  function openModalForEdit(id) {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;

    editingId = id;
    els.modalTitle.textContent = "Editar perfil";
    fillForm({
      name: p.name ?? "",
      type: p.type ?? "direct",
      host: p.host ?? "",
      port: p.port ? String(p.port) : "",
      pacValue: p.pacUrl ?? p.pacScript ?? "",
      bypass: p.bypass ?? "",
      username: p.username ?? "",
      password: p.password ?? "",
    });
    openModal(() => els.name.focus());
  }

  function openModal(focusFn) {
    lastFocusedBeforeModal = document.activeElement;

    els.modal.hidden = false;
    els.modalBackdrop.hidden = false;
    els.modal.classList.remove("hidden");
    els.modalBackdrop.classList.remove("hidden");
    els.modalBackdrop.setAttribute("aria-hidden", "false");

    syncFieldsByType();
    clearFormError();

    setTimeout(() => focusFn && focusFn(), 0);
  }

  function closeModal() {
    if (!isModalOpen()) return;

    els.modal.classList.add("hidden");
    els.modalBackdrop.classList.add("hidden");
    els.modalBackdrop.setAttribute("aria-hidden", "true");
    els.modal.hidden = true;
    els.modalBackdrop.hidden = true;

    editingId = null;

    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === "function") {
      lastFocusedBeforeModal.focus();
    }
  }

  function isModalOpen() {
    return !els.modal.classList.contains("hidden");
  }

  function trapFocus(e) {
    const focusables = els.modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const list = Array.from(focusables).filter((el) => !el.disabled && el.offsetParent !== null);
    if (list.length === 0) return;

    const first = list[0];
    const last = list[list.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function syncFieldsByType() {
    const t = els.type.value;

    const isDirect = t === "direct";
    const isPac = t === "pac";
    const needsHostPort = !isDirect && !isPac;

    els.hostField.classList.toggle("hidden", !needsHostPort);
    els.portField.classList.toggle("hidden", !needsHostPort);
    els.pacUrlField.classList.toggle("hidden", !isPac);

    els.host.required = needsHostPort;
    els.port.required = needsHostPort;
    if (els.pacValue) els.pacValue.required = isPac;

    if (isDirect) {
      els.host.value = "";
      els.port.value = "";
      if (els.pacValue) els.pacValue.value = "";
    }
    if (isPac) {
      els.host.value = "";
      els.port.value = "";
    }
  }

  function readForm() {
    return {
      name: els.name.value.trim(),
      type: els.type.value,
      host: els.host.value.trim(),
      port: els.port.value.trim(),
      pacValue: (els.pacValue?.value ?? "").trim(),
      bypass: els.bypass?.value ?? "",
      username: els.username.value.trim(),
      password: els.password.value,
    };
  }

  function fillForm(v) {
    els.name.value = v.name ?? "";
    els.type.value = v.type ?? "direct";
    els.host.value = v.host ?? "";
    els.port.value = v.port ?? "";
    if (els.pacValue) els.pacValue.value = v.pacValue ?? "";
    if (els.bypass) els.bypass.value = v.bypass ?? "";
    els.username.value = v.username ?? "";
    els.password.value = v.password ?? "";
  }

  function normalizeFormData(data) {
    const out = { ...data };

    if (typeof out.bypass === "string") {
      const normalizedLines = out.bypass
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      out.bypass = normalizedLines.join("\n");
    }

    if (out.type !== "direct" && out.type !== "pac") {
      out.port = Number(out.port);
    } else {
      delete out.host;
      delete out.port;
    }

    if (out.type === "pac") {
      const value = (out.pacValue || "").trim();
      const kind = detectPacKind(value);
      if (kind === "url") {
        out.pacUrl = value;
        delete out.pacScript;
      } else {
        out.pacScript = value;
        delete out.pacUrl;
      }
    } else {
      delete out.pacUrl;
      delete out.pacScript;
    }

    delete out.pacValue;
    return out;
  }

  function validate(data) {
    if (!data.name) return { ok: false, message: "Informe um nome para o perfil." };

    if (data.type === "pac") {
      const value = (data.pacValue || "").trim();
      if (!value) return { ok: false, message: "Informe uma URL de PAC ou cole um PAC script." };

      const kind = detectPacKind(value);
      if (kind === "url") {
        try {
          new URL(value);
        } catch {
          return { ok: false, message: "A URL do PAC não parece válida." };
        }
      } else {
        const looksLikePac = /FindProxyForURL\s*\(/i.test(value) || /^function\s+/i.test(value);
        if (!looksLikePac) {
          return {
            ok: false,
            message:
              "Esse texto não parece um PAC script. Para script, cole algo contendo FindProxyForURL(url, host).",
          };
        }
      }
      return { ok: true };
    }

    if (data.type === "direct") return { ok: true };

    if (!data.host) return { ok: false, message: "Informe o host do proxy." };
    if (!data.port) return { ok: false, message: "Informe a porta do proxy." };

    const portNum = Number(data.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      return { ok: false, message: "A porta precisa ser um número entre 1 e 65535." };
    }

    return { ok: true };
  }

  function detectPacKind(value) {
    const v = (value || "").trim().toLowerCase();
    if (v.startsWith("http://") || v.startsWith("https://")) return "url";
    return "script";
  }

  function clearFormError() {
    els.formError.classList.add("hidden");
    els.formError.textContent = "";
  }

  function showFormError(msg) {
    els.formError.textContent = msg;
    els.formError.classList.remove("hidden");
    els.formError.focus?.();
  }

  function announce(msg) {
    els.live.textContent = "";
    setTimeout(() => (els.live.textContent = msg), 10);
  }

  function saveProfiles() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
  }

  function loadProfiles() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  function uid() {
    return "p_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  }

  function typeLabel(t) {
    switch (t) {
      case "direct": return "Direto";
      case "http":   return "HTTP";
      case "https":  return "HTTPS";
      case "socks5": return "SOCKS5";
      case "pac":    return "PAC";
      default:       return t;
    }
  }

  function serverLabel(p) {
    if (p.type === "direct") return "—";
    if (p.type === "pac") {
      if (p.pacUrl) return p.pacUrl;
      if (p.pacScript) return "PAC script (colado)";
      return "—";
    }
    const host = p.host ?? "—";
    const port = p.port ?? "—";
    return `${host}:${port}`;
  }

  function describeProfile(p) {
    const bypassInfo =
      p.bypass && String(p.bypass).trim().length > 0
        ? ` | Bypass: ${String(p.bypass).split(/\r?\n/).length} regra(s)`
        : "";

    if (p.type === "direct") return `Sem proxy.${bypassInfo}`;
    if (p.type === "pac")    return `PAC → ${serverLabel(p)}${bypassInfo}`;
    return `${typeLabel(p.type)} → ${serverLabel(p)}${bypassInfo}`;
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();

/* =========================
   TEMAS
========================= */
const themeButtons = document.querySelectorAll(".theme-btn");

themeButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    const theme = btn.dataset.theme;

    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);

    themeButtons.forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });

    btn.classList.add("active");
    btn.setAttribute("aria-pressed", "true");
  });
});

/* Carregar tema salvo */
const savedTheme = localStorage.getItem("theme");
if (savedTheme) {
  document.body.setAttribute("data-theme", savedTheme);
  const activeBtn = document.querySelector(`[data-theme="${savedTheme}"]`);
  if (activeBtn) {
    themeButtons.forEach(b => {
      b.classList.remove("active");
      b.setAttribute("aria-pressed", "false");
    });
    activeBtn.classList.add("active");
    activeBtn.setAttribute("aria-pressed", "true");
  }
}