// TODO: ใส่ URL ของ Google Apps Script Web App หลัง deploy แล้ว
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzV_RkQ8-CXRrfnnu-dyt01LOtuqryB87CHHHMa3NOqQv3W4iH9eM0LcponI89G6Nc/exec";

const ADMIN_VERIFY_TIMEOUT_MS = 25000;
const ADMIN_VERIFY_INTERVAL_MS = 1500;
const ALLOWED_COMPLETED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf"
]);

const state = {
  token: sessionStorage.getItem("dsn_pr_admin_token") || "",
  items: [],
  selectedId: "",
  loadingCount: 0
};

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();

  if (window.lucide) {
    window.lucide.createIcons();
  }

  if (!isConfigured()) {
    showNotice(elements.loginAlert, "กรุณาใส่ GOOGLE_SCRIPT_URL ในไฟล์ admin.js ก่อนใช้งาน", "warning");
    return;
  }

  if (state.token) {
    showAdminView();
    loadAllNews();
  }
});

function cacheElements() {
  elements.loginView = document.getElementById("loginView");
  elements.adminView = document.getElementById("adminView");
  elements.loginForm = document.getElementById("loginForm");
  elements.adminPassword = document.getElementById("adminPassword");
  elements.loginButton = document.getElementById("loginButton");
  elements.loginAlert = document.getElementById("loginAlert");
  elements.adminAlert = document.getElementById("adminAlert");
  elements.refreshNews = document.getElementById("refreshNews");
  elements.logoutButton = document.getElementById("logoutButton");
  elements.newsSearch = document.getElementById("newsSearch");
  elements.statusFilter = document.getElementById("statusFilter");
  elements.newsList = document.getElementById("newsList");
  elements.emptyDetail = document.getElementById("emptyDetail");
  elements.detailContent = document.getElementById("detailContent");
  elements.detailStatusBadge = document.getElementById("detailStatusBadge");
  elements.detailId = document.getElementById("detailId");
  elements.detailCreatedAt = document.getElementById("detailCreatedAt");
  elements.detailImageCount = document.getElementById("detailImageCount");
  elements.detailForm = document.getElementById("detailForm");
  elements.detailNewsId = document.getElementById("detailNewsId");
  elements.detailReporter = document.getElementById("detailReporter");
  elements.detailNewsTitle = document.getElementById("detailNewsTitle");
  elements.detailNewsContent = document.getElementById("detailNewsContent");
  elements.detailStatus = document.getElementById("detailStatus");
  elements.openFolderLink = document.getElementById("openFolderLink");
  elements.saveDetail = document.getElementById("saveDetail");
  elements.completedPreview = document.getElementById("completedPreview");
  elements.completedFile = document.getElementById("completedFile");
  elements.uploadCompleted = document.getElementById("uploadCompleted");
  elements.deleteNews = document.getElementById("deleteNews");
  elements.globalLoading = document.getElementById("globalLoading");
  elements.stepQueue = document.getElementById("stepQueue");
  elements.stepDetail = document.getElementById("stepDetail");
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", handleLogin);
  elements.logoutButton.addEventListener("click", handleLogout);
  elements.refreshNews.addEventListener("click", loadAllNews);
  elements.newsSearch.addEventListener("input", renderNewsList);
  elements.statusFilter.addEventListener("change", renderNewsList);
  elements.detailForm.addEventListener("submit", handleSaveDetail);
  elements.uploadCompleted.addEventListener("click", handleUploadCompleted);
  elements.deleteNews.addEventListener("click", handleDeleteNews);
}

function isConfigured() {
  return GOOGLE_SCRIPT_URL &&
    !GOOGLE_SCRIPT_URL.includes("PASTE_YOUR") &&
    /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(GOOGLE_SCRIPT_URL);
}

async function handleLogin(event) {
  event.preventDefault();

  if (!isConfigured()) {
    showNotice(elements.loginAlert, "กรุณาใส่ GOOGLE_SCRIPT_URL ในไฟล์ admin.js ก่อนใช้งาน", "error");
    return;
  }

  const password = elements.adminPassword.value;
  if (!password) {
    showNotice(elements.loginAlert, "กรุณากรอกรหัสผ่าน", "error");
    return;
  }

  setButtonBusy(elements.loginButton, true, "กำลังเข้าสู่ระบบ...");
  showGlobalLoading();
  hideNotice(elements.loginAlert);

  try {
    const response = await gasGet("login", { password });
    if (!response.ok || !response.token) {
      throw new Error(response.error || "Invalid password");
    }

    state.token = response.token;
    sessionStorage.setItem("dsn_pr_admin_token", state.token);
    elements.adminPassword.value = "";
    showAdminView();
    await loadAllNews();
  } catch (error) {
    console.error(error);
    showNotice(elements.loginAlert, "รหัสผ่านไม่ถูกต้อง หรือเชื่อมต่อ Apps Script ไม่สำเร็จ", "error");
  } finally {
    setButtonBusy(elements.loginButton, false, "เข้าสู่ระบบ");
    hideGlobalLoading();
  }
}

function handleLogout() {
  state.token = "";
  state.items = [];
  state.selectedId = "";
  sessionStorage.removeItem("dsn_pr_admin_token");
  showLoginView();
}

function showAdminView() {
  elements.loginView.hidden = true;
  elements.adminView.hidden = false;
}

function showLoginView() {
  elements.loginView.hidden = false;
  elements.adminView.hidden = true;
  renderEmptyDetail();
  updateAdminSteps(false);
}

async function loadAllNews() {
  if (!state.token) {
    showLoginView();
    return;
  }

  elements.newsList.replaceChildren(renderLoadingState("กำลังโหลดรายการข่าว..."));
  showGlobalLoading();
  hideNotice(elements.adminAlert);

  try {
    const response = await gasGet("listAll", { token: state.token });
    if (!response.ok) {
      if (response.error === "UNAUTHORIZED") {
        handleExpiredSession();
        return;
      }
      throw new Error(response.error || "Cannot load news");
    }

    state.items = response.items || [];
    if (state.selectedId && !state.items.some((item) => item.id === state.selectedId)) {
      state.selectedId = "";
    }

    renderNewsList();

    if (!state.selectedId && state.items.length) {
      selectNews(state.items[0].id);
    } else if (state.selectedId) {
      renderDetail(getSelectedItem());
    } else {
      renderEmptyDetail();
    }
  } catch (error) {
    console.error(error);
    elements.newsList.replaceChildren(renderEmptyState("ยังโหลดรายการข่าวไม่ได้"));
    showNotice(elements.adminAlert, "ไม่สามารถโหลดรายการข่าวได้ กรุณาตรวจสอบ Apps Script Web App URL", "error");
  } finally {
    hideGlobalLoading();
  }
}

function renderNewsList() {
  const search = elements.newsSearch.value.trim().toLowerCase();
  const status = elements.statusFilter.value;
  const items = state.items.filter((item) => {
    const statusMatch = status === "all" || item.status === status;
    const text = `${item.reporterName || ""} ${item.title || ""} ${item.content || ""}`.toLowerCase();
    const searchMatch = !search || text.includes(search);
    return statusMatch && searchMatch;
  });

  elements.newsList.replaceChildren();

  if (!items.length) {
    elements.newsList.append(renderEmptyState("ไม่พบรายการข่าว"));
    if (!state.items.length) {
      renderEmptyDetail();
    }
    return;
  }

  items.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `queue-item${item.id === state.selectedId ? " active" : ""}`;
    button.addEventListener("click", () => selectNews(item.id));

    const title = document.createElement("span");
    title.className = "queue-title";
    title.textContent = item.title || "ไม่มีหัวข้อข่าว";

    const meta = document.createElement("span");
    meta.className = "queue-meta";

    const reporter = document.createElement("span");
    reporter.textContent = item.reporterName || "-";

    const date = document.createElement("span");
    date.textContent = formatDate(item.createdAt);

    const badge = document.createElement("span");
    badge.className = `status-badge${item.status === "เสร็จสิ้น" ? " done" : ""}`;
    badge.textContent = item.status || "กำลังดำเนินการ";

    meta.append(reporter, date, badge);
    button.append(title, meta);
    elements.newsList.append(button);
  });
}

function selectNews(id) {
  state.selectedId = id;
  renderNewsList();
  renderDetail(getSelectedItem());
  updateAdminSteps(true);
}

function getSelectedItem() {
  return state.items.find((item) => item.id === state.selectedId) || null;
}

function renderDetail(item) {
  if (!item) {
    renderEmptyDetail();
    return;
  }

  updateAdminSteps(true);
  elements.emptyDetail.hidden = true;
  elements.detailContent.hidden = false;

  elements.detailStatusBadge.textContent = item.status || "กำลังดำเนินการ";
  elements.detailStatusBadge.className = `status-badge${item.status === "เสร็จสิ้น" ? " done" : ""}`;
  elements.detailId.textContent = item.id || "-";
  elements.detailCreatedAt.textContent = formatDate(item.createdAt);
  elements.detailImageCount.textContent = `${item.originalImageCount || 0} รูป`;

  elements.detailNewsId.value = item.id || "";
  elements.detailReporter.value = item.reporterName || "";
  elements.detailNewsTitle.value = item.title || "";
  elements.detailNewsContent.value = item.content || "";
  elements.detailStatus.value = item.status || "กำลังดำเนินการ";

  if (item.originalFolderUrl) {
    elements.openFolderLink.href = item.originalFolderUrl;
    elements.openFolderLink.classList.remove("is-disabled");
    elements.openFolderLink.removeAttribute("aria-disabled");
  } else {
    elements.openFolderLink.href = "#";
    elements.openFolderLink.classList.add("is-disabled");
    elements.openFolderLink.setAttribute("aria-disabled", "true");
  }

  renderCompletedPreview(item);

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderEmptyDetail() {
  elements.emptyDetail.hidden = false;
  elements.detailContent.hidden = true;
  updateAdminSteps(false);
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function renderCompletedPreview(item) {
  elements.completedPreview.replaceChildren();

  if (!item.completedFileId) {
    elements.completedPreview.append(renderEmptyState("ยังไม่มีแผ่นข่าวที่อัปโหลด"));
    return;
  }

  if (item.completedMimeType === "application/pdf") {
    const iframe = document.createElement("iframe");
    iframe.title = `ตัวอย่างไฟล์ PDF ${item.title || ""}`;
    iframe.src = item.completedPreviewUrl || item.completedFileUrl;
    elements.completedPreview.append(iframe);
  } else {
    const image = document.createElement("img");
    image.src = item.completedThumbnailUrl || item.completedFileUrl;
    image.alt = item.title || "แผ่นข่าวที่เสร็จสมบูรณ์";
    elements.completedPreview.append(image);
  }

  const link = document.createElement("a");
  link.className = "file-link";
  link.href = item.completedFileUrl || item.completedPreviewUrl || "#";
  link.target = "_blank";
  link.rel = "noopener";
  link.innerHTML = '<i data-lucide="external-link" aria-hidden="true"></i><span>เปิดไฟล์ต้นฉบับ</span>';
  elements.completedPreview.append(link);
}

async function handleSaveDetail(event) {
  event.preventDefault();

  const id = elements.detailNewsId.value;
  if (!id) {
    return;
  }

  const reporterName = elements.detailReporter.value.trim();
  const title = elements.detailNewsTitle.value.trim();
  const content = elements.detailNewsContent.value.trim();
  const status = elements.detailStatus.value;

  if (!reporterName || !title || !content) {
    showNotice(elements.adminAlert, "กรุณากรอกชื่อผู้แจ้ง หัวข้อข่าว และเนื้อหาข่าวให้ครบถ้วน", "error");
    return;
  }

  const mutationId = createId("mutation");
  setButtonBusy(elements.saveDetail, true, "กำลังบันทึก...");
  showGlobalLoading();
  hideNotice(elements.adminAlert);

  try {
    await postToAppsScript({
      action: "updateNews",
      token: state.token,
      mutationId,
      id,
      reporterName,
      title,
      content,
      status
    });

    await waitForVerification(
      () => gasGet("getNews", { token: state.token, id }),
      (response) => response && response.ok && response.item && response.item.lastMutationId === mutationId
    );

    await loadAllNews();
    state.selectedId = id;
    renderNewsList();
    renderDetail(getSelectedItem());
    showNotice(elements.adminAlert, "บันทึกการแก้ไขเรียบร้อยแล้ว", "success");
  } catch (error) {
    console.error(error);
    showNotice(elements.adminAlert, "ส่งคำสั่งบันทึกแล้ว แต่ยังยืนยันผลไม่สำเร็จ กรุณารีเฟรชเพื่อตรวจสอบ", "warning");
  } finally {
    setButtonBusy(elements.saveDetail, false, "บันทึกการแก้ไข");
    hideGlobalLoading();
  }
}

async function handleUploadCompleted() {
  const item = getSelectedItem();
  const file = elements.completedFile.files && elements.completedFile.files[0];

  if (!item) {
    return;
  }

  if (!file) {
    showNotice(elements.adminAlert, "กรุณาเลือกไฟล์แผ่นข่าวก่อนอัปโหลด", "error");
    return;
  }

  if (!ALLOWED_COMPLETED_TYPES.has(file.type)) {
    showNotice(elements.adminAlert, "อัปโหลดได้เฉพาะไฟล์ jpg, png, webp หรือ pdf", "error");
    return;
  }

  const mutationId = createId("mutation");
  setButtonBusy(elements.uploadCompleted, true, "กำลังอัปโหลด...");
  showGlobalLoading();
  hideNotice(elements.adminAlert);

  try {
    const completedFile = await fileToDataUrl(file);
    await postToAppsScript({
      action: "uploadCompleted",
      token: state.token,
      mutationId,
      id: item.id,
      completedFile
    });

    await waitForVerification(
      () => gasGet("getNews", { token: state.token, id: item.id }),
      (response) => response && response.ok && response.item && response.item.lastMutationId === mutationId && response.item.completedFileId
    );

    elements.completedFile.value = "";
    await loadAllNews();
    state.selectedId = item.id;
    renderNewsList();
    renderDetail(getSelectedItem());
    showNotice(elements.adminAlert, "อัปโหลดแผ่นข่าวเรียบร้อยแล้ว และจะแสดงบนหน้าแรก", "success");
  } catch (error) {
    console.error(error);
    showNotice(elements.adminAlert, "ส่งไฟล์แล้ว แต่ยังยืนยันผลไม่สำเร็จ กรุณารีเฟรชเพื่อตรวจสอบ", "warning");
  } finally {
    setButtonBusy(elements.uploadCompleted, false, "อัปโหลดแผ่นข่าว");
    hideGlobalLoading();
  }
}

async function handleDeleteNews() {
  const item = getSelectedItem();
  if (!item) {
    return;
  }

  const confirmed = window.confirm(`ยืนยันลบข่าว "${item.title || item.id}" ออกจากระบบหรือไม่`);
  if (!confirmed) {
    return;
  }

  const mutationId = createId("mutation");
  setButtonBusy(elements.deleteNews, true, "กำลังลบ...");
  showGlobalLoading();
  hideNotice(elements.adminAlert);

  try {
    await postToAppsScript({
      action: "deleteNews",
      token: state.token,
      mutationId,
      id: item.id
    });

    await waitForVerification(
      () => gasGet("getNews", { token: state.token, id: item.id, includeDeleted: "true" }),
      (response) => response && response.ok && response.item && response.item.deleted === true && response.item.lastMutationId === mutationId
    );

    state.selectedId = "";
    await loadAllNews();
    showNotice(elements.adminAlert, "ลบข่าวออกจากระบบเรียบร้อยแล้ว", "success");
  } catch (error) {
    console.error(error);
    showNotice(elements.adminAlert, "ส่งคำสั่งลบแล้ว แต่ยังยืนยันผลไม่สำเร็จ กรุณารีเฟรชเพื่อตรวจสอบ", "warning");
  } finally {
    setButtonBusy(elements.deleteNews, false, "ลบข่าว");
    hideGlobalLoading();
  }
}

function handleExpiredSession() {
  handleLogout();
  showNotice(elements.loginAlert, "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่", "warning");
}

function gasGet(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName = `__gasAdminCallback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
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

  while (Date.now() - startedAt < ADMIN_VERIFY_TIMEOUT_MS) {
    try {
      const response = await fetcher();
      if (response && response.error === "UNAUTHORIZED") {
        handleExpiredSession();
        throw new Error("UNAUTHORIZED");
      }

      if (predicate(response)) {
        return response;
      }
    } catch (error) {
      lastError = error;
      if (error.message === "UNAUTHORIZED") {
        throw error;
      }
    }

    await delay(ADMIN_VERIFY_INTERVAL_MS);
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

function renderEmptyState(message) {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = '<i data-lucide="inbox" aria-hidden="true"></i>';

  const text = document.createElement("strong");
  text.textContent = message;
  empty.append(text);

  if (window.lucide) {
    window.requestAnimationFrame(() => window.lucide.createIcons());
  }

  return empty;
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

function updateAdminSteps(hasSelection) {
  if (!elements.stepQueue || !elements.stepDetail) {
    return;
  }

  elements.stepQueue.classList.add("active");
  elements.stepDetail.classList.toggle("active", Boolean(hasSelection));
}

function setButtonBusy(button, isBusy, label) {
  button.disabled = isBusy;
  const span = button.querySelector("span");
  if (span) {
    span.textContent = label;
  }
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
