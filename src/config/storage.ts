import path from "path";

const BASE_DIR = process.env.BASE_DIR || "D:\\server-storage";

export const STORAGE_CONFIG = {
    baseDir:   BASE_DIR,
    dataDir:   path.join(BASE_DIR, "data"),
    uploadsDir: path.join(BASE_DIR, "uploads"),
    logsDir:   path.join(BASE_DIR, "logs"),
};