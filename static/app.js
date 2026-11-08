(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  /* ------------------------------------------------------------------ */
  /* 主题                                                                */
  /* ------------------------------------------------------------------ */
  const root = document.documentElement;
  const savedTheme = localStorage.getItem("b64-theme");
  if (savedTheme === "light" || savedTheme === "dark") root.dataset.theme = savedTheme;

  function syncThemeIcon() {
    $("theme-toggle").textContent = root.dataset.theme === "light" ? "☀️" : "🌙";
  }
  syncThemeIcon();

  $("theme-toggle").addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
    localStorage.setItem("b64-theme", root.dataset.theme);
    syncThemeIcon();
  });

  /* ------------------------------------------------------------------ */
  /* 通用工具                                                            */
  /* ------------------------------------------------------------------ */
  let toastTimer;
  function toast(message, kind = "") {
    const el = $("toast");
    el.textContent = message;
    el.className = "toast show " + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = "toast " + kind; }, 2400);
  }

  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (!res.ok || !data || data.ok === false) {
      throw new Error((data && data.error) || "请求失败（HTTP " + res.status + "）");
    }
    return data;
  }

  function debounce(fn, wait) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  }

  function copyText(text) {
    if (!text) { toast("没有可复制的内容"); return; }
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        toast("已复制到剪贴板", "ok");
      } catch (_) {
        toast("复制失败，请手动选择", "error");
      }
      ta.remove();
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => toast("已复制到剪贴板", "ok"))
        .catch(fallback);
    } else {
      fallback();
    }
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadText(text, filename) {
    downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
  }

  function formatBytes(n) {
    if (n < 1024) return n + " B";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
    return (n / 1024 / 1024).toFixed(2) + " MB";
  }

  function timestampName(prefix, ext) {
    const d = new Date();
    const pad = (v) => String(v).padStart(2, "0");
    return prefix + "-" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
      "-" + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + ext;
  }

  /* ------------------------------------------------------------------ */
  /* 模式切换                                                            */
  /* ------------------------------------------------------------------ */
  const panels = {
    text: $("panel-text"),
    file: $("panel-file"),
  };

  function switchMode(mode) {
    document.querySelectorAll(".seg").forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", String(active));
    });
    Object.entries(panels).forEach(([key, panel]) => {
      panel.classList.toggle("active", key === mode);
    });
  }

  document.querySelectorAll(".seg").forEach((btn) => {
    btn.addEventListener("click", () => switchMode(btn.dataset.mode));
  });

  /* ------------------------------------------------------------------ */
  /* 文本：一次输入，同时编码 + 解码                                     */
  /* ------------------------------------------------------------------ */
  const input = $("input-text");
  const outEncode = $("out-encode");
  const outDecode = $("out-decode");
  const inputMeta = $("input-meta");
  const encodeMeta = $("encode-meta");
  const decodeMeta = $("decode-meta");
  const encodeNote = $("encode-note");
  const decodeNote = $("decode-note");

  let seq = 0;

  function resetResults() {
    outEncode.value = "";
    outDecode.value = "";
    encodeMeta.textContent = "";
    decodeMeta.textContent = "";
    encodeNote.textContent = "";
    decodeNote.textContent = "";
    encodeNote.className = "result-note";
    decodeNote.className = "result-note";
  }

  async function convert() {
    const text = input.value;
    inputMeta.textContent = text ? [...text].length + " 字符" : "";

    if (!text) {
      seq++;
      resetResults();
      return;
    }

    const current = ++seq;
    const options = {
      text,
      urlsafe: $("text-urlsafe").checked,
      wrap: $("text-wrap").checked,
    };

    // 编码与解码互不影响，并行请求
    const [encodeRes, decodeRes] = await Promise.allSettled([
      postJSON("/api/encode", options),
      postJSON("/api/decode", { text }),
    ]);

    if (current !== seq) return;

    // 编码结果
    if (encodeRes.status === "fulfilled") {
      const data = encodeRes.value;
      outEncode.value = data.result;
      encodeMeta.textContent = formatBytes(data.bytes) + " → " + data.length + " 字符";
      encodeNote.textContent = "";
      encodeNote.className = "result-note";
    } else {
      outEncode.value = "";
      encodeMeta.textContent = "失败";
      encodeNote.textContent = encodeRes.reason.message;
      encodeNote.className = "result-note error";
    }

    // 解码结果
    decodeNote.className = "result-note";
    if (decodeRes.status === "rejected") {
      outDecode.value = "";
      decodeMeta.textContent = "无法解码";
      decodeNote.textContent = decodeRes.reason.message;
      decodeNote.className = "result-note error";
      return;
    }

    const data = decodeRes.value;
    if (data.encoding === "utf-8") {
      outDecode.value = data.result;
      decodeMeta.textContent = formatBytes(data.size) + " · UTF-8";
      decodeNote.textContent = "";
    } else {
      outDecode.value = data.hex || "";
      decodeMeta.textContent = formatBytes(data.size) + " · 二进制";
      decodeNote.textContent = data.truncated
        ? "二进制内容，仅显示前 4 KB 的十六进制预览；可下载解码文件保存原始字节。"
        : "二进制内容，以上为十六进制预览；可下载解码文件保存原始字节。";
    }
  }

  const scheduleConvert = debounce(convert, 200);

  input.addEventListener("input", scheduleConvert);
  [$("text-urlsafe"), $("text-wrap")].forEach((el) => {
    el.addEventListener("change", convert);
  });

  $("input-clear").addEventListener("click", () => {
    input.value = "";
    inputMeta.textContent = "";
    seq++;
    resetResults();
    input.focus();
  });

  $("input-paste").addEventListener("click", async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error("unsupported");
      const text = await navigator.clipboard.readText();
      if (!text) { toast("剪贴板是空的"); return; }
      input.value = text;
      await convert();
    } catch (_) {
      input.focus();
      toast("无法读取剪贴板，请按 Ctrl+V 粘贴");
    }
  });

  // 复制
  $("encode-copy").addEventListener("click", () => copyText(outEncode.value));
  $("decode-copy").addEventListener("click", () => copyText(outDecode.value));

  // 把结果放回输入框，继续转换
  $("encode-fill").addEventListener("click", () => {
    if (!outEncode.value) { toast("还没有编码结果"); return; }
    input.value = outEncode.value;
    convert();
  });

  $("decode-fill").addEventListener("click", () => {
    if (!outDecode.value) { toast("还没有解码结果"); return; }
    input.value = outDecode.value;
    convert();
  });

  // 下载
  $("encode-download").addEventListener("click", () => {
    if (!outEncode.value) { toast("还没有编码结果"); return; }
    downloadText(outEncode.value, timestampName("base64", ".txt"));
  });

  $("decode-download").addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) { toast("输入框是空的"); return; }

    const res = await fetch("/api/file/decode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, filename: "decoded.bin" }),
    });
    if (!res.ok) {
      let message = "解码失败（HTTP " + res.status + "）";
      try {
        const data = await res.json();
        if (data && data.error) message = data.error;
      } catch (_) { /* ignore */ }
      toast(message, "error");
      return;
    }
    downloadBlob(await res.blob(), "decoded.bin");
    toast("已开始下载", "ok");
  });

  /* ------------------------------------------------------------------ */
  /* 文件 → Base64                                                       */
  /* ------------------------------------------------------------------ */
  const encFile = $("enc-file");
  const encDrop = $("enc-drop");
  const encFileMeta = $("enc-file-meta");
  const encFileOutput = $("enc-file-output");
  let selectedFile = null;

  function setSelectedFile(file) {
    selectedFile = file || null;
    encFileOutput.value = "";
    if (!file) {
      encDrop.classList.remove("has-file");
      encFileMeta.textContent = "支持任意类型，单文件上限 32 MB";
      return;
    }
    encDrop.classList.add("has-file");
    encFileMeta.textContent = file.name + " · " + formatBytes(file.size);
  }

  encFile.addEventListener("change", () => setSelectedFile(encFile.files[0]));

  ["dragenter", "dragover"].forEach((type) => {
    encDrop.addEventListener(type, (e) => {
      e.preventDefault();
      encDrop.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((type) => {
    encDrop.addEventListener(type, (e) => {
      e.preventDefault();
      encDrop.classList.remove("dragover");
    });
  });
  encDrop.addEventListener("drop", (e) => {
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if (file) setSelectedFile(file);
  });

  $("enc-file-run").addEventListener("click", async () => {
    if (!selectedFile) { toast("请先选择一个文件"); return; }
    const form = new FormData();
    form.append("file", selectedFile);
    form.append("urlsafe", $("enc-file-urlsafe").checked ? "1" : "0");
    form.append("wrap", $("enc-file-wrap").checked ? "1" : "0");

    const btn = $("enc-file-run");
    btn.disabled = true;
    try {
      const res = await fetch("/api/file/encode", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || data.ok === false) {
        throw new Error((data && data.error) || "编码失败（HTTP " + res.status + "）");
      }
      encFileOutput.value = data.result;
      toast("已生成 Base64（" + formatBytes(data.size) + "）", "ok");
    } catch (err) {
      toast(err.message, "error");
    } finally {
      btn.disabled = false;
    }
  });

  $("enc-file-copy").addEventListener("click", () => copyText(encFileOutput.value));
  $("enc-file-download").addEventListener("click", () => {
    if (!encFileOutput.value) { toast("没有可下载的内容"); return; }
    const base = selectedFile ? selectedFile.name : "base64";
    downloadText(encFileOutput.value, base + ".base64.txt");
  });

  /* ------------------------------------------------------------------ */
  /* Base64 → 文件                                                       */
  /* ------------------------------------------------------------------ */
  $("dec-file-run").addEventListener("click", async () => {
    const text = $("dec-file-input").value.trim();
    if (!text) { toast("请先粘贴 Base64 内容"); return; }
    const statusEl = $("dec-file-status");
    const filename = $("dec-file-name").value.trim() || "decoded.bin";
    statusEl.textContent = "正在解码…";

    const res = await fetch("/api/file/decode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, filename }),
    });
    if (!res.ok) {
      let message = "解码失败（HTTP " + res.status + "）";
      try {
        const data = await res.json();
        if (data && data.error) message = data.error;
      } catch (_) { /* ignore */ }
      statusEl.textContent = message;
      toast(message, "error");
      return;
    }
    downloadBlob(await res.blob(), filename);
    statusEl.textContent = "文件已开始下载。";
  });
})();
