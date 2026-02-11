import path from "path";

const BASE_DIR = process.env.HOME_SERVER_BASE_DIR || "D:\\server-storage";

export const STORAGE_CONFIG = {
    baseDir: BASE_DIR,
    dataDir: path.join(BASE_DIR, "data"),
    uploadsDir: path.join(BASE_DIR, "uploads"),
};