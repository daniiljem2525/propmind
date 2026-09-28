// Загрузка файлов: в демо-версии храним data-URL в записи (лимит 1,5 МБ).
// allowedMimes — whitelist типов (защита от хранения исполняемого HTML/SVG).

export const MAX_FILE_BYTES = 1.5 * 1024 * 1024;

export const SAFE_DOC_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
];

export function uploadFile(file, allowedMimes) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("NO_FILE"));
    if (file.size > MAX_FILE_BYTES) return reject(new Error("FILE_TOO_LARGE"));
    if (allowedMimes && file.type && !allowedMimes.includes(file.type)) {
      return reject(new Error("BAD_TYPE"));
    }
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("READ_ERROR"));
    reader.readAsDataURL(file);
  });
}
