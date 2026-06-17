// TODO: ใส่ URL ของ Google Apps Script Web App หลัง deploy แล้ว
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzV_RkQ8-CXRrfnnu-dyt01LOtuqryB87CHHHMa3NOqQv3W4iH9eM0LcponI89G6Nc/exec";

const MAX_IMAGES = 10;
const VERIFY_TIMEOUT_MS = 25000;
const VERIFY_INTERVAL_MS = 1600;

const state = {
  selectedImages: [],
  loadingCount: 0
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  renderImagePreview();
  loadNewsStatus();
  loadCompletedNews();

  if (window.lucide) {
    window.lucide.createIcons();
  }
});

function cacheElements() {
  elements.form = document.getElementById("newsForm");
  elements.reporterName = document.getElementById("reporterName");
  elements.newsTitle = document.getElementById("newsTitle");
  elements.newsContent = document.getElementById("newsContent");
  elements.newsImages = document.getElementById("newsImages");
  elements.imageCount = document.getElementById("imageCount");
  elements.imagePreview = document.getElementById("imagePreview");
  elements.clearImages = document.getElementById("clearImages");
  elements.formAlert = document.getElementById("formAlert");
  elements.submitButton = document.getElementById("submitButton");
  elements.completedList = document.getElementById("completedList");
  elements.completedAlert = document.getElementById("completedAlert");
  elements.refreshCompleted = document.getElementById("refreshCompleted");
  elements.statusList = document.getElementById("statusList");
  elements.statusAlert = document.getElementById("statusAlert");
  elements.refreshStatus = document.getElementById("refreshStatus");
  elements.globalLoading = document.getElementById("globalLoading");
}

function bindEvents() {
  elements.newsImages.addEventListener("change", handleImageSelect);
  elements.clearImages.addEventListener("click", clearImages);
  elements.form.addEventListener("submit", handleSubmit);
  elements.refreshCompleted.addEventListener("click", loadCompletedNews);
  elements.refreshStatus.addEventListener("click", loadNewsStatus);
}

function isConfigured() {
  return GOOGLE_SCRIPT_URL &&
    !GOOGLE_SCRIPT_URL.includes("PASTE_YOUR") &&
    /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(GOOGLE_SCRIPT_URL);
}

function handleImageSelect(event) {
  const files = Array.from(event.target.files || []);
  const accepted = [];
  let rejected = 0;

  files.forEach((file) => {
    if (!file.type.startsWith("image/")) {
      rejected += 1;
      return;
    }

    if (state.selectedImages.length + accepted.length >= MAX_IMAGES) {
      rejected += 1;
      return;
    }

    accepted.push({
      id: createId("img"),
      file,
      previewUrl: URL.createObjectURL(file)
    });
  });

  state.selectedImages.push(...accepted);
  elements.newsImages.value = "";
  renderImagePreview();

  if (rejected > 0) {
    showNotice(elements.formAlert, `เลือกเพิ่มได้เฉพาะรูปภาพ และรวมสูงสุด ${MAX_IMAGES} รูป`, "warning");
  } else {
    hideNotice(elements.formAlert);
  }
}

function renderImagePreview() {
  elements.imagePreview.replaceChildren();
  elements.imageCount.textContent = state.selectedImages.length
    ? `เลือกรูปแล้ว ${state.selectedImages.length}/${MAX_IMAGES} รูป`
    : "ยังไม่ได้เลือกรูป";
  elements.clearImages.hidden = state.selectedImages.length === 0;

  state.selectedImages.forEach((item) => {
    const card = document.createElement("div");
    card.className = "preview-card";

    const image = document.createElement("img");
    image.src = item.previewUrl;
    image.alt = item.file.name;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.setAttribute("aria-label", `ลบรูป ${item.file.name}`);
    removeButton.innerHTML = '<i data-lucide="x" aria-hidden="true"></i>';
    removeButton.addEventListener("click", () => removeImage(item.id));

    card.append(image, removeButton);
    elements.imagePreview.append(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function removeImage(id) {
  const item = state.selectedImages.find((image) => image.id === id);
  if (item) {
    URL.revokeObjectURL(item.previewUrl);
  }

  state.selectedImages = state.selectedImages.filter((image) => image.id !== id);
  renderImagePreview();
}

function clearImages() {
  state.selectedImages.forEach((item) => URL.revokeObjectURL(item.previewUrl));
  state.selectedImages = [];
  renderImagePreview();
  hideNotice(elements.formAlert);
}

async function handleSubmit(event) {
  event.preventDefault();

  if (!isConfigured()) {
    showNotice(elements.formAlert, "กรุณาใส่ GOOGLE_SCRIPT_URL ในไฟล์ script.js ก่อนใช้งาน", "error");
    return;
  }

  const reporterName = elements.reporterName.value.trim();
  const title = elements.newsTitle.value.trim();
  const content = elements.newsContent.value.trim();

  if (!reporterName || !title || !content) {
    showNotice(elements.formAlert, "กรุณากรอกชื่อ-สกุล หัวข้อข่าว และเนื้อหาข่าวให้ครบถ้วน", "error");
    return;
  }

  setFormBusy(true);
  showGlobalLoading();
  showNotice(elements.formAlert, "กำลังเตรียมไฟล์และส่งข้อมูล...", "info");

  const clientRequestId = createId("request");

  try {
    const images = await Promise.all(
      state.selectedImages.map((item) => fileToDataUrl(item.file))
    );

    await postToAppsScript({
      action: "submitNews",
      clientRequestId,
      reporterName,
      title,
      content,
      images
    });

    await waitForVerification(
      () => gasGet("getByClientRequestId", { clientRequestId }),
      (response) => response && response.ok && response.item && response.item.id
    );

    elements.form.reset();
    clearImages();
    showNotice(elements.formAlert, "ส่งข้อมูลเรียบร้อยแล้ว แอดมินได้รับรายการข่าวนี้แล้ว", "success");
    await loadNewsStatus();
    await loadCompletedNews();
  } catch (error) {
    console.error(error);
    showNotice(
      elements.formAlert,
      "ส่งคำขอแล้ว แต่ระบบยังยืนยันผลไม่สำเร็จ กรุณาตรวจสอบ Google Sheet หรือทดลองส่งใหม่อีกครั้ง",
      "warning"
    );
  } finally {
    setFormBusy(false);
    hideGlobalLoading();
  }
}

function setFormBusy(isBusy) {
  elements.submitButton.disabled = isBusy;
  elements.newsImages.disabled = isBusy;
  elements.clearImages.disabled = isBusy;
  elements.submitButton.querySelector("span").textContent = isBusy ? "กำลังส่ง..." : "ส่งข้อมูล";
}

async function loadNewsStatus() {
  if (!isConfigured()) {
    renderEmptyStatus("ยังไม่ได้ตั้งค่า GOOGLE_SCRIPT_URL");
    showNotice(elements.statusAlert, "ตั้งค่า GOOGLE_SCRIPT_URL ในไฟล์ script.js หลัง deploy Apps Script", "warning");
    return;
  }

  showGlobalLoading();
  hideNotice(elements.statusAlert);
  elements.statusList.replaceChildren(renderLoadingState("กำลังโหลดสถานะข่าว..."));

  try {
    const response = await gasGet("listStatus");
    if (!response.ok) {
      throw new Error(response.error || "Cannot load news status");
    }

    renderNewsStatus(response.items || []);
  } catch (error) {
    if (error.message === "UNKNOWN_ACTION") {
      renderEmptyStatus("รออัปเดต Apps Script เพื่อเปิดใช้การติดตามสถานะข่าว");
      showNotice(elements.statusAlert, "กรุณานำ Code.gs เวอร์ชันล่าสุดไป deploy ใน Apps Script เพื่อแสดงสถานะข่าวทั้งหมด", "warning");
    } else {
      console.error(error);
      renderEmptyStatus("ยังโหลดสถานะข่าวไม่ได้");
      showNotice(elements.statusAlert, "ไม่สามารถโหลดสถานะข่าวได้ กรุณาตรวจสอบการ deploy Apps Script", "error");
    }
  } finally {
    hideGlobalLoading();
  }
}

function renderNewsStatus(items) {
  elements.statusList.replaceChildren();

  if (!items.length) {
    renderEmptyStatus("ยังไม่มีรายการแจ้งข่าว");
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "status-card";

    const badge = document.createElement("span");
    badge.className = `status-badge${item.status === "เสร็จสิ้น" ? " done" : ""}`;
    badge.textContent = item.status || "กำลังดำเนินการ";

    const title = document.createElement("h3");
    title.textContent = item.title || "ไม่มีหัวข้อข่าว";

    const meta = document.createElement("div");
    meta.className = "status-meta";

    const reporter = document.createElement("span");
    reporter.innerHTML = '<i data-lucide="user-round" aria-hidden="true"></i>';
    reporter.append(document.createTextNode(item.reporterName || "-"));

    const date = document.createElement("span");
    date.innerHTML = '<i data-lucide="clock-3" aria-hidden="true"></i>';
    date.append(document.createTextNode(formatDate(item.updatedAt || item.createdAt)));

    const images = document.createElement("span");
    images.innerHTML = '<i data-lucide="image" aria-hidden="true"></i>';
    images.append(document.createTextNode(`${item.originalImageCount || 0} รูป`));

    meta.append(reporter, date, images);

    const progress = document.createElement("div");
    progress.className = `status-progress${item.status === "เสร็จสิ้น" ? " done" : ""}`;
    progress.innerHTML = "<span></span>";

    const step = document.createElement("p");
    step.className = "status-step";
    step.textContent = item.status === "เสร็จสิ้น"
      ? "แผ่นข่าวเสร็จสมบูรณ์แล้ว"
      : "รับเรื่องแล้ว กำลังดำเนินการจัดทำข่าว";

    card.append(badge, title, meta, progress, step);
    elements.statusList.append(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderEmptyStatus(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = '<i data-lucide="list-checks" aria-hidden="true"></i>';

  const title = document.createElement("strong");
  title.textContent = message;

  empty.append(title);
  elements.statusList.replaceChildren(empty);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

async function loadCompletedNews() {
  if (!isConfigured()) {
    renderEmptyCompleted("ยังไม่ได้ตั้งค่า GOOGLE_SCRIPT_URL");
    showNotice(elements.completedAlert, "ตั้งค่า GOOGLE_SCRIPT_URL ในไฟล์ script.js หลัง deploy Apps Script", "warning");
    return;
  }

  showGlobalLoading();
  hideNotice(elements.completedAlert);
  elements.completedList.replaceChildren(renderLoadingState("กำลังโหลดข่าวที่เสร็จสมบูรณ์..."));

  try {
    const response = await gasGet("listCompleted");
    if (!response.ok) {
      throw new Error(response.error || "Cannot load completed news");
    }

    renderCompletedNews(response.items || []);
  } catch (error) {
    console.error(error);
    renderEmptyCompleted("ยังโหลดรายการข่าวไม่ได้");
    showNotice(elements.completedAlert, "ไม่สามารถโหลดข่าวที่เสร็จสมบูรณ์ได้ กรุณาตรวจสอบการ deploy Apps Script", "error");
  } finally {
    hideGlobalLoading();
  }
}

function renderCompletedNews(items) {
  elements.completedList.replaceChildren();

  if (!items.length) {
    renderEmptyCompleted("ยังไม่มีข่าวประชาสัมพันธ์ที่เสร็จสมบูรณ์");
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "news-card";

    const mediaLink = document.createElement("a");
    mediaLink.href = item.completedFileUrl || item.completedPreviewUrl || "#";
    mediaLink.target = "_blank";
    mediaLink.rel = "noopener";
    mediaLink.setAttribute("aria-label", `เปิดไฟล์ข่าว ${item.title || ""}`);

    if (item.completedMimeType === "application/pdf") {
      mediaLink.className = "pdf-card";
      mediaLink.innerHTML = '<i data-lucide="file-text" aria-hidden="true"></i><strong>เปิดไฟล์ PDF</strong>';
    } else {
      const image = document.createElement("img");
      image.className = "news-media";
      image.src = item.completedThumbnailUrl || item.completedFileUrl;
      image.alt = item.title || "แผ่นข่าวประชาสัมพันธ์";
      image.loading = "lazy";
      mediaLink.append(image);
    }

    const body = document.createElement("div");
    body.className = "news-card-body";

    const date = document.createElement("span");
    date.className = "news-date";
    date.textContent = formatDate(item.completedUploadedAt || item.updatedAt || item.createdAt);

    const title = document.createElement("h3");
    title.textContent = item.title || "ไม่มีหัวข้อข่าว";

    const content = document.createElement("p");
    content.textContent = compactText(item.content || "", 180);

    body.append(date, title, content);
    card.append(mediaLink, body);
    elements.completedList.append(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderEmptyCompleted(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = '<i data-lucide="newspaper" aria-hidden="true"></i>';

  const title = document.createElement("strong");
  title.textContent = message;

  empty.append(title);
  elements.completedList.replaceChildren(empty);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderLoadingState(message) {
  const loading = document.createElement("div");
  loading.className = "empty-state";
  loading.innerHTML = '<i data-lucide="loader-circle" aria-hidden="true"></i>';

  const text = document.createElement("strong");
  text.textContent = message;
  loading.append(text);

  if (window.lucide) {
    window.requestAnimationFrame(() => window.lucide.createIcons());
  }

  return loading;
}

function gasGet(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__gasCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Apps Script request timed out"));
    }, 18000);

    const script = document.createElement("script");
    const url = new URL(GOOGLE_SCRIPT_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("callback", callbackName);

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, String(value));
      }
    });

    window[callbackName] = (payload) => {
      cleanup();
      resolve(payload);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("Cannot load Apps Script response"));
    };

    script.src = url.toString();
    document.body.append(script);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }
  });
}

function postToAppsScript(payload) {
  return fetch(GOOGLE_SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload)
  });
}

async function waitForVerification(fetcher, predicate) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < VERIFY_TIMEOUT_MS) {
    try {
      const response = await fetcher();
      if (predicate(response)) {
        return response;
      }
    } catch (error) {
      lastError = error;
    }

    await delay(VERIFY_INTERVAL_MS);
  }

  throw lastError || new Error("Verification timed out");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      resolve({
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        dataUrl: reader.result
      });
    };

    reader.onerror = () => reject(reader.error || new Error("Cannot read file"));
    reader.readAsDataURL(file);
  });
}

function showNotice(target, message, type = "success") {
  target.hidden = false;
  target.className = `alert ${target.classList.contains("compact") ? "compact " : ""}${type === "error" ? "error" : type === "warning" ? "warning" : ""}`.trim();
  target.textContent = message;
}

function hideNotice(target) {
  target.hidden = true;
  target.textContent = "";
}

function showGlobalLoading() {
  state.loadingCount += 1;
  if (elements.globalLoading) {
    elements.globalLoading.classList.add("is-active");
  }
}

function hideGlobalLoading() {
  state.loadingCount = Math.max(0, state.loadingCount - 1);
  if (state.loadingCount === 0 && elements.globalLoading) {
    elements.globalLoading.classList.remove("is-active");
  }
}

function compactText(text, maxLength) {
  const clean = String(text).replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}...` : clean;
}

function formatDate(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function createId(prefix) {
  if (window.crypto && window.crypto.randomUUID) {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
