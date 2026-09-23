// Загрузка файлов: в демо-версии храним data-URL в записи (лимит 1,5 МБ).

export const MAX_FILE_BYTES = 1.5 * 1024 * 1024;

export function uploadFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("NO_FILE"));
    if (file.size > MAX_FILE_BYTES) return reject(new Error("FILE_TOO_LARGE"));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("READ_ERROR"));
    reader.readAsDataURL(file);
  });
}
