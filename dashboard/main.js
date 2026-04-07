const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

function getConfigPath() {
    return path.join(app.getPath('userData'), 'config.json');
}

function loadConfig() {
    try {
        return JSON.parse(fs.readFileSync(getConfigPath(), 'utf8'));
    } catch {
        return { serverUrl: 'http://localhost:3000', token: null, username: null };
    }
}

function saveConfig(config) {
    fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8');
}

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: '#0b0d12',
        title: 'Home Server Dashboard',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
        },
    });

    win.setMenuBarVisibility(false);
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('get-config', () => loadConfig());
ipcMain.handle('save-config', (_event, config) => {
    saveConfig(config);
    return true;
});
