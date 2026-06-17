/**
 * Google Apps Script backend
 * ระบบแจ้งทำข่าวประชาสัมพันธ์ กลุ่มสาระการเรียนรู้สังคมศึกษาฯ โรงเรียนเทพศิรินทร์ นนทบุรี
 *
 * จุดที่ต้องตั้งค่า:
 * 1) SHEET_ID: ID ของ Google Sheet
 * 2) ROOT_FOLDER_ID: ID ของ Google Drive folder หลักสำหรับเก็บรูป
 * 3) ADMIN_PASSWORD: ตั้งใน Script Properties เท่านั้น ไม่ใส่ใน HTML/JS
 */

const CONFIG = {
  SHEET_ID: "1PFh--mYibtXQMawDiSWcbBVhn9U6ppZwtX-KMyiEmz0",
  SHEET_NAME: "News",
  ROOT_FOLDER_ID: "1uOFQwByOplC-E3zyxgtHZrMO0TK7y-Hw",
  NOTIFY_EMAIL: "gritsn.th@gmail.com",
  ADMIN_TOKEN_SECONDS: 21600
};

const STATUS_IN_PROGRESS = "กำลังดำเนินการ";
const STATUS_DONE = "เสร็จสิ้น";

const HEADERS = [
  "ID",
  "ClientRequestId",
  "CreatedAt",
  "UpdatedAt",
  "ReporterName",
  "Title",
  "Content",
  "Status",
  "OriginalFolderId",
  "OriginalFolderUrl",
  "OriginalImageCount",
  "CompletedFileId",
  "CompletedFileUrl",
  "CompletedPreviewUrl",
  "CompletedThumbnailUrl",
  "CompletedFileName",
  "CompletedMimeType",
  "CompletedUploadedAt",
  "Deleted",
  "LastMutationId"
];

const COMPLETED_MIME_TYPES = {
  "image/jpeg": true,
  "image/png": true,
  "image/webp": true,
  "application/pdf": true
};

function setup() {
  const sheet = ensureSheet_();
  const rootFolder = DriveApp.getFolderById(requiredConfig_("ROOT_FOLDER_ID"));
  const adminPassword = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");

  Logger.log("Sheet ready: " + sheet.getName());
  Logger.log("Root folder ready: " + rootFolder.getUrl());

  if (!adminPassword) {
    Logger.log("ยังไม่ได้ตั้ง ADMIN_PASSWORD ใน Script Properties");
  }
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = params.callback || "";

  try {
    const action = params.action || "health";
    let payload;

    switch (action) {
      case "health":
        payload = handleHealth_();
        break;
      case "login":
        payload = handleLogin_(params);
        break;
      case "listCompleted":
        payload = handleListCompleted_();
        break;
      case "getByClientRequestId":
        payload = handleGetByClientRequestId_(params);
        break;
      case "listAll":
        requireAdmin_(params.token);
        payload = handleListAll_();
        break;
      case "getNews":
        requireAdmin_(params.token);
        payload = handleGetNews_(params);
        break;
      default:
        throw new Error("UNKNOWN_ACTION");
    }

    return respond_(payload, callback);
  } catch (error) {
    return respond_(errorResponse_(error), callback);
  }
}

function doPost(e) {
  try {
    const payload = parsePostPayload_(e);
    const action = payload.action || "";
    let result;

    switch (action) {
      case "submitNews":
        result = handleSubmitNews_(payload);
        break;
      case "updateNews":
        requireAdmin_(payload.token);
        result = handleUpdateNews_(payload);
        break;
      case "deleteNews":
        requireAdmin_(payload.token);
        result = handleDeleteNews_(payload);
        break;
      case "uploadCompleted":
        requireAdmin_(payload.token);
        result = handleUploadCompleted_(payload);
        break;
      default:
        throw new Error("UNKNOWN_ACTION");
    }

    return respond_(result, "");
  } catch (error) {
    return respond_(errorResponse_(error), "");
  }
}

function handleHealth_() {
  return {
    ok: true,
    configured: {
      sheetId: Boolean(getConfig_("SHEET_ID")),
      rootFolderId: Boolean(getConfig_("ROOT_FOLDER_ID")),
      adminPassword: Boolean(PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD"))
    }
  };
}

function handleLogin_(params) {
  const expectedPassword = PropertiesService.getScriptProperties().getProperty("ADMIN_PASSWORD");
  if (!expectedPassword) {
    throw new Error("ADMIN_PASSWORD_NOT_SET");
  }

  if (String(params.password || "") !== expectedPassword) {
    throw new Error("INVALID_PASSWORD");
  }

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put(adminTokenKey_(token), "1", CONFIG.ADMIN_TOKEN_SECONDS);

  return {
    ok: true,
    token: token,
    expiresIn: CONFIG.ADMIN_TOKEN_SECONDS
  };
}

function handleListCompleted_() {
  const items = readAllItems_()
    .filter(function(item) {
      return !item.deleted && item.status === STATUS_DONE && item.completedFileId;
    })
    .sort(sortNewestFirst_)
    .map(publicItem_);

  return {
    ok: true,
    items: items
  };
}

function handleGetByClientRequestId_(params) {
  const clientRequestId = String(params.clientRequestId || "").trim();
  if (!clientRequestId) {
    throw new Error("BAD_REQUEST");
  }

  const found = findRowBy_("ClientRequestId", clientRequestId);
  if (!found || found.item.deleted) {
    return {
      ok: true,
      item: null
    };
  }

  return {
    ok: true,
    item: publicProgressItem_(found.item)
  };
}

function handleListAll_() {
  const items = readAllItems_()
    .filter(function(item) {
      return !item.deleted;
    })
    .sort(sortNewestFirst_)
    .map(adminItem_);

  return {
    ok: true,
    items: items
  };
}

function handleGetNews_(params) {
  const id = String(params.id || "").trim();
  const includeDeleted = String(params.includeDeleted || "") === "true";
  const found = findRowBy_("ID", id);

  if (!found || (!includeDeleted && found.item.deleted)) {
    throw new Error("NOT_FOUND");
  }

  return {
    ok: true,
    item: adminItem_(found.item)
  };
}

function handleSubmitNews_(payload) {
  const reporterName = cleanText_(payload.reporterName);
  const title = cleanText_(payload.title);
  const content = cleanText_(payload.content);
  const clientRequestId = cleanText_(payload.clientRequestId);
  const images = Array.isArray(payload.images) ? payload.images : [];

  if (!reporterName || !title || !content) {
    throw new Error("BAD_REQUEST");
  }

  if (images.length > 10) {
    throw new Error("TOO_MANY_IMAGES");
  }

  if (clientRequestId) {
    const duplicate = findRowBy_("ClientRequestId", clientRequestId);
    if (duplicate && !duplicate.item.deleted) {
      return {
        ok: true,
        item: publicProgressItem_(duplicate.item),
        duplicate: true
      };
    }
  }

  const id = createNewsId_();
  const now = nowIso_();
  const rootFolder = DriveApp.getFolderById(requiredConfig_("ROOT_FOLDER_ID"));
  const folder = rootFolder.createFolder(newsFolderName_(title, id));

  let imageCount = 0;
  images.forEach(function(file, index) {
    if (!file || !file.dataUrl) {
      return;
    }

    const mimeType = cleanText_(file.type) || dataUrlMimeType_(file.dataUrl);
    if (!mimeType || mimeType.indexOf("image/") !== 0) {
      throw new Error("INVALID_IMAGE_TYPE");
    }

    const fileName = sanitizeDriveName_(file.name) || ("image-" + pad2_(index + 1) + extensionFromMime_(mimeType));
    const blob = dataUrlToBlob_(file.dataUrl, mimeType, fileName);
    folder.createFile(blob).setName(fileName);
    imageCount += 1;
  });

  const record = {
    ID: id,
    ClientRequestId: clientRequestId,
    CreatedAt: now,
    UpdatedAt: now,
    ReporterName: reporterName,
    Title: title,
    Content: content,
    Status: STATUS_IN_PROGRESS,
    OriginalFolderId: folder.getId(),
    OriginalFolderUrl: folder.getUrl(),
    OriginalImageCount: imageCount,
    CompletedFileId: "",
    CompletedFileUrl: "",
    CompletedPreviewUrl: "",
    CompletedThumbnailUrl: "",
    CompletedFileName: "",
    CompletedMimeType: "",
    CompletedUploadedAt: "",
    Deleted: false,
    LastMutationId: clientRequestId
  };

  appendRecord_(record);

  const item = itemFromRecord_(record, 0);
  notifyNewSubmission_(item);

  return {
    ok: true,
    item: publicProgressItem_(item)
  };
}

function handleUpdateNews_(payload) {
  const id = cleanText_(payload.id);
  const found = requireNewsRow_(id);
  const reporterName = cleanText_(payload.reporterName);
  const title = cleanText_(payload.title);
  const content = cleanText_(payload.content);
  const status = normalizeStatus_(payload.status);
  const mutationId = cleanText_(payload.mutationId);

  if (!reporterName || !title || !content) {
    throw new Error("BAD_REQUEST");
  }

  const fields = {
    UpdatedAt: nowIso_(),
    ReporterName: reporterName,
    Title: title,
    Content: content,
    Status: status,
    LastMutationId: mutationId
  };

  updateRow_(found.sheet, found.headers, found.rowIndex, fields);
  renameNewsFolder_(found.item.originalFolderId, id, title);

  return {
    ok: true,
    item: adminItem_(requireNewsRow_(id).item)
  };
}

function handleDeleteNews_(payload) {
  const id = cleanText_(payload.id);
  const mutationId = cleanText_(payload.mutationId);
  const found = requireNewsRow_(id, true);

  updateRow_(found.sheet, found.headers, found.rowIndex, {
    UpdatedAt: nowIso_(),
    Deleted: true,
    LastMutationId: mutationId
  });

  return {
    ok: true,
    item: adminItem_(requireNewsRow_(id, true).item)
  };
}

function handleUploadCompleted_(payload) {
  const id = cleanText_(payload.id);
  const mutationId = cleanText_(payload.mutationId);
  const completedFile = payload.completedFile || {};
  const found = requireNewsRow_(id);
  const mimeType = cleanText_(completedFile.type) || dataUrlMimeType_(completedFile.dataUrl);

  if (!completedFile.dataUrl || !COMPLETED_MIME_TYPES[mimeType]) {
    throw new Error("INVALID_COMPLETED_FILE");
  }

  const folder = getOrCreateNewsFolder_(found.item);
  const fileName = sanitizeDriveName_(completedFile.name) || ("completed" + extensionFromMime_(mimeType));
  const blob = dataUrlToBlob_(completedFile.dataUrl, mimeType, fileName);

  trashOldCompletedFile_(found.item.completedFileId);

  const file = folder.createFile(blob).setName(fileName);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (error) {
    Logger.log("Cannot set sharing for completed file: " + error);
  }

  const links = driveLinks_(file.getId());
  const now = nowIso_();

  const fields = {
    UpdatedAt: now,
    Status: STATUS_DONE,
    CompletedFileId: file.getId(),
    CompletedFileUrl: links.fileUrl,
    CompletedPreviewUrl: links.previewUrl,
    CompletedThumbnailUrl: links.thumbnailUrl,
    CompletedFileName: fileName,
    CompletedMimeType: mimeType,
    CompletedUploadedAt: now,
    LastMutationId: mutationId
  };

  if (!found.item.originalFolderId) {
    fields.OriginalFolderId = folder.getId();
    fields.OriginalFolderUrl = folder.getUrl();
  }

  updateRow_(found.sheet, found.headers, found.rowIndex, fields);

  return {
    ok: true,
    item: adminItem_(requireNewsRow_(id).item)
  };
}

function ensureSheet_() {
  const spreadsheet = SpreadsheetApp.openById(requiredConfig_("SHEET_ID"));
  const sheetName = getConfig_("SHEET_NAME") || "News";
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  } else {
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    let currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function(header) {
      return String(header || "").trim();
    });

    if (currentHeaders.length === 1 && currentHeaders[0] === "") {
      sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
      currentHeaders = HEADERS.slice();
    }

    const missingHeaders = HEADERS.filter(function(header) {
      return currentHeaders.indexOf(header) === -1;
    });

    if (missingHeaders.length) {
      sheet.getRange(1, currentHeaders.length + 1, 1, missingHeaders.length).setValues([missingHeaders]);
    }
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function readAllItems_() {
  const sheet = ensureSheet_();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow <= 1) {
    return [];
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map(function(header) {
    return String(header || "").trim();
  });

  const items = [];
  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const item = itemFromRow_(headers, values[rowIndex], rowIndex + 1);
    if (item.id) {
      items.push(item);
    }
  }

  return items;
}

function findRowBy_(headerName, expectedValue) {
  const sheet = ensureSheet_();
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();

  if (lastRow <= 1) {
    return null;
  }

  const values = sheet.getRange(1, 1, lastRow, lastColumn).getValues();
  const headers = values[0].map(function(header) {
    return String(header || "").trim();
  });
  const headerIndex = headers.indexOf(headerName);

  if (headerIndex === -1) {
    return null;
  }

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    if (String(values[rowIndex][headerIndex] || "") === String(expectedValue || "")) {
      return {
        sheet: sheet,
        headers: headers,
        rowIndex: rowIndex + 1,
        item: itemFromRow_(headers, values[rowIndex], rowIndex + 1)
      };
    }
  }

  return null;
}

function requireNewsRow_(id, includeDeleted) {
  const found = findRowBy_("ID", id);
  if (!found || (!includeDeleted && found.item.deleted)) {
    throw new Error("NOT_FOUND");
  }

  return found;
}

function appendRecord_(record) {
  const sheet = ensureSheet_();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function(header) {
    return String(header || "").trim();
  });
  const row = headers.map(function(header) {
    return record[header] !== undefined ? record[header] : "";
  });

  sheet.appendRow(row);
}

function updateRow_(sheet, headers, rowIndex, fields) {
  const row = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];

  Object.keys(fields).forEach(function(header) {
    const index = headers.indexOf(header);
    if (index !== -1) {
      row[index] = fields[header];
    }
  });

  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([row]);
}

function itemFromRow_(headers, row, rowNumber) {
  function value(header) {
    const index = headers.indexOf(header);
    return index === -1 ? "" : row[index];
  }

  return itemFromRecord_({
    ID: value("ID"),
    ClientRequestId: value("ClientRequestId"),
    CreatedAt: value("CreatedAt"),
    UpdatedAt: value("UpdatedAt"),
    ReporterName: value("ReporterName"),
    Title: value("Title"),
    Content: value("Content"),
    Status: value("Status"),
    OriginalFolderId: value("OriginalFolderId"),
    OriginalFolderUrl: value("OriginalFolderUrl"),
    OriginalImageCount: value("OriginalImageCount"),
    CompletedFileId: value("CompletedFileId"),
    CompletedFileUrl: value("CompletedFileUrl"),
    CompletedPreviewUrl: value("CompletedPreviewUrl"),
    CompletedThumbnailUrl: value("CompletedThumbnailUrl"),
    CompletedFileName: value("CompletedFileName"),
    CompletedMimeType: value("CompletedMimeType"),
    CompletedUploadedAt: value("CompletedUploadedAt"),
    Deleted: value("Deleted"),
    LastMutationId: value("LastMutationId")
  }, rowNumber);
}

function itemFromRecord_(record, rowNumber) {
  return {
    rowNumber: rowNumber || 0,
    id: stringValue_(record.ID),
    clientRequestId: stringValue_(record.ClientRequestId),
    createdAt: dateValue_(record.CreatedAt),
    updatedAt: dateValue_(record.UpdatedAt),
    reporterName: stringValue_(record.ReporterName),
    title: stringValue_(record.Title),
    content: stringValue_(record.Content),
    status: stringValue_(record.Status) || STATUS_IN_PROGRESS,
    originalFolderId: stringValue_(record.OriginalFolderId),
    originalFolderUrl: stringValue_(record.OriginalFolderUrl),
    originalImageCount: Number(record.OriginalImageCount || 0),
    completedFileId: stringValue_(record.CompletedFileId),
    completedFileUrl: stringValue_(record.CompletedFileUrl),
    completedPreviewUrl: stringValue_(record.CompletedPreviewUrl),
    completedThumbnailUrl: stringValue_(record.CompletedThumbnailUrl),
    completedFileName: stringValue_(record.CompletedFileName),
    completedMimeType: stringValue_(record.CompletedMimeType),
    completedUploadedAt: dateValue_(record.CompletedUploadedAt),
    deleted: boolValue_(record.Deleted),
    lastMutationId: stringValue_(record.LastMutationId)
  };
}

function publicProgressItem_(item) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    title: item.title,
    status: item.status
  };
}

function publicItem_(item) {
  return {
    id: item.id,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    reporterName: item.reporterName,
    title: item.title,
    content: item.content,
    status: item.status,
    completedFileId: item.completedFileId,
    completedFileUrl: item.completedFileUrl,
    completedPreviewUrl: item.completedPreviewUrl,
    completedThumbnailUrl: item.completedThumbnailUrl,
    completedFileName: item.completedFileName,
    completedMimeType: item.completedMimeType,
    completedUploadedAt: item.completedUploadedAt
  };
}

function adminItem_(item) {
  return {
    id: item.id,
    clientRequestId: item.clientRequestId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    reporterName: item.reporterName,
    title: item.title,
    content: item.content,
    status: item.status,
    originalFolderId: item.originalFolderId,
    originalFolderUrl: item.originalFolderUrl,
    originalImageCount: item.originalImageCount,
    completedFileId: item.completedFileId,
    completedFileUrl: item.completedFileUrl,
    completedPreviewUrl: item.completedPreviewUrl,
    completedThumbnailUrl: item.completedThumbnailUrl,
    completedFileName: item.completedFileName,
    completedMimeType: item.completedMimeType,
    completedUploadedAt: item.completedUploadedAt,
    deleted: item.deleted,
    lastMutationId: item.lastMutationId
  };
}

function parsePostPayload_(e) {
  const contents = e && e.postData && e.postData.contents ? e.postData.contents : "";

  if (!contents) {
    return (e && e.parameter) || {};
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new Error("BAD_JSON");
  }
}

function respond_(payload, callback) {
  const json = JSON.stringify(payload);
  const safeCallback = sanitizeCallback_(callback);

  if (safeCallback) {
    return ContentService
      .createTextOutput(safeCallback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

function sanitizeCallback_(callback) {
  const value = String(callback || "");
  return /^[A-Za-z_$][0-9A-Za-z_$]*(\.[A-Za-z_$][0-9A-Za-z_$]*)*$/.test(value) ? value : "";
}

function requireAdmin_(token) {
  if (!token || CacheService.getScriptCache().get(adminTokenKey_(token)) !== "1") {
    throw new Error("UNAUTHORIZED");
  }
}

function adminTokenKey_(token) {
  return "admin_" + String(token || "").slice(0, 120);
}

function getConfig_(key) {
  const propertyValue = PropertiesService.getScriptProperties().getProperty(key);
  const configValue = CONFIG[key];
  const value = propertyValue || configValue || "";
  const stringValue = String(value).trim();

  if (!stringValue || stringValue.indexOf("PASTE_YOUR_") === 0) {
    return "";
  }

  return stringValue;
}

function requiredConfig_(key) {
  const value = getConfig_(key);
  if (!value) {
    throw new Error("CONFIG_MISSING_" + key);
  }

  return value;
}

function normalizeStatus_(value) {
  return String(value || "") === STATUS_DONE ? STATUS_DONE : STATUS_IN_PROGRESS;
}

function createNewsId_() {
  const stamp = Utilities.formatDate(new Date(), getTimeZone_(), "yyyyMMdd-HHmmss");
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return "NEWS-" + stamp + "-" + suffix;
}

function getTimeZone_() {
  return Session.getScriptTimeZone() || "Asia/Bangkok";
}

function nowIso_() {
  return new Date().toISOString();
}

function sortNewestFirst_(a, b) {
  const aDate = new Date(a.completedUploadedAt || a.updatedAt || a.createdAt || 0).getTime();
  const bDate = new Date(b.completedUploadedAt || b.updatedAt || b.createdAt || 0).getTime();
  return bDate - aDate;
}

function dataUrlMimeType_(dataUrl) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,/);
  return match ? match[1] : "";
}

function dataUrlToBlob_(dataUrl, mimeType, fileName) {
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error("INVALID_DATA_URL");
  }

  const bytes = Utilities.base64Decode(match[2]);
  return Utilities.newBlob(bytes, mimeType || match[1], fileName);
}

function extensionFromMime_(mimeType) {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

function driveLinks_(fileId) {
  return {
    fileUrl: "https://drive.google.com/file/d/" + fileId + "/view",
    previewUrl: "https://drive.google.com/file/d/" + fileId + "/preview",
    thumbnailUrl: "https://drive.google.com/thumbnail?id=" + fileId + "&sz=w1600"
  };
}

function getOrCreateNewsFolder_(item) {
  if (item.originalFolderId) {
    try {
      return DriveApp.getFolderById(item.originalFolderId);
    } catch (error) {
      Logger.log("Cannot open original folder, creating a new one: " + error);
    }
  }

  const rootFolder = DriveApp.getFolderById(requiredConfig_("ROOT_FOLDER_ID"));
  return rootFolder.createFolder(newsFolderName_(item.title || "news", item.id));
}

function renameNewsFolder_(folderId, id, title) {
  if (!folderId) {
    return;
  }

  try {
    DriveApp.getFolderById(folderId).setName(newsFolderName_(title, id));
  } catch (error) {
    Logger.log("Cannot rename folder: " + error);
  }
}

function newsFolderName_(title, id) {
  const titlePart = sanitizeDriveName_(title || "news");
  const idPart = sanitizeDriveName_(id || "");
  return idPart ? titlePart + " - " + idPart : titlePart;
}

function trashOldCompletedFile_(fileId) {
  if (!fileId) {
    return;
  }

  try {
    DriveApp.getFileById(fileId).setTrashed(true);
  } catch (error) {
    Logger.log("Cannot trash old completed file: " + error);
  }
}

function notifyNewSubmission_(item) {
  const email = getConfig_("NOTIFY_EMAIL") || CONFIG.NOTIFY_EMAIL;
  if (!email) {
    return;
  }

  const subject = "[แจ้งทำข่าวใหม่] " + item.title;
  const body = [
    "มีรายการแจ้งทำข่าวประชาสัมพันธ์ใหม่",
    "",
    "รหัสข่าว: " + item.id,
    "ชื่อผู้แจ้ง: " + item.reporterName,
    "หัวข้อข่าว: " + item.title,
    "สถานะ: " + item.status,
    "โฟลเดอร์รูป: " + item.originalFolderUrl,
    "",
    "เนื้อหาข่าว:",
    item.content
  ].join("\n");

  const htmlBody =
    "<p><strong>มีรายการแจ้งทำข่าวประชาสัมพันธ์ใหม่</strong></p>" +
    "<ul>" +
    "<li><strong>รหัสข่าว:</strong> " + escapeHtml_(item.id) + "</li>" +
    "<li><strong>ชื่อผู้แจ้ง:</strong> " + escapeHtml_(item.reporterName) + "</li>" +
    "<li><strong>หัวข้อข่าว:</strong> " + escapeHtml_(item.title) + "</li>" +
    "<li><strong>สถานะ:</strong> " + escapeHtml_(item.status) + "</li>" +
    "<li><strong>โฟลเดอร์รูป:</strong> <a href=\"" + escapeAttribute_(item.originalFolderUrl) + "\">เปิดโฟลเดอร์</a></li>" +
    "</ul>" +
    "<p><strong>เนื้อหาข่าว</strong></p>" +
    "<p>" + escapeHtml_(item.content).replace(/\n/g, "<br>") + "</p>";

  try {
    MailApp.sendEmail({
      to: email,
      subject: subject,
      body: body,
      htmlBody: htmlBody
    });
  } catch (error) {
    Logger.log("Cannot send notification email: " + error);
  }
}

function errorResponse_(error) {
  const message = error && error.message ? error.message : String(error);
  const publicErrors = {
    UNAUTHORIZED: true,
    NOT_FOUND: true,
    UNKNOWN_ACTION: true,
    BAD_REQUEST: true,
    BAD_JSON: true,
    TOO_MANY_IMAGES: true,
    INVALID_IMAGE_TYPE: true,
    INVALID_COMPLETED_FILE: true,
    INVALID_DATA_URL: true,
    INVALID_PASSWORD: true,
    ADMIN_PASSWORD_NOT_SET: true
  };

  if (message.indexOf("CONFIG_MISSING_") === 0) {
    return {
      ok: false,
      error: message
    };
  }

  return {
    ok: false,
    error: publicErrors[message] ? message : "SERVER_ERROR",
    message: message
  };
}

function cleanText_(value) {
  return String(value || "").trim();
}

function stringValue_(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function dateValue_(value) {
  if (!value) {
    return "";
  }

  if (Object.prototype.toString.call(value) === "[object Date]") {
    return value.toISOString();
  }

  return String(value);
}

function boolValue_(value) {
  if (value === true) {
    return true;
  }

  const normalized = String(value || "").toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "1";
}

function sanitizeDriveName_(value) {
  const clean = String(value || "")
    .replace(/[\\/:*?"<>|#%{}~&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return clean || "file";
}

function pad2_(number) {
  return number < 10 ? "0" + number : String(number);
}

function escapeHtml_(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute_(value) {
  return escapeHtml_(value).replace(/`/g, "&#96;");
}
