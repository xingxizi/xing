const {
  app, BrowserWindow, Tray, Menu, ipcMain, dialog,
  screen, nativeImage, Notification, globalShortcut
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const STATE_PATH = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}
function saveWindowState(bounds) {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(bounds)); } catch {}
}

function createWindow() {
  const state = loadWindowState();
  const { width: sw } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: state.width || 240,
    height: state.height || 420,
    x: state.x ?? sw - 280,
    y: state.y ?? 60,
    minWidth: 210,
    minHeight: 360,
    maxWidth: 460,
    maxHeight: 680,
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  const persist = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    saveWindowState(mainWindow.getBounds());
  };
  mainWindow.on('moved', persist);
  mainWindow.on('resized', persist);

  mainWindow.on('close', (e) => {
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  if (!fs.existsSync(iconPath)) return;

  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon);

  const menu = Menu.buildFromTemplate([
    {
      label: '显示/隐藏',
      click: () => {
        if (!mainWindow) return;
        mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
      }
    },
    { type: 'separator' },
    {
      label: '置顶',
      type: 'checkbox',
      checked: true,
      click: (item) => {
        if (mainWindow) mainWindow.setAlwaysOnTop(item.checked, 'floating');
      }
    },
    {
      label: '重置位置',
      click: () => {
        if (!mainWindow) return;
        const { width: sw } = screen.getPrimaryDisplay().workAreaSize;
        mainWindow.setBounds({ x: sw - 280, y: 60, width: 240, height: 420 });
      }
    },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Study With Moyi · 番茄钟');
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
  });
}

// ========== IPC ==========
ipcMain.handle('window:hide', () => { if (mainWindow) mainWindow.hide(); });
ipcMain.handle('window:quit', () => { isQuitting = true; app.quit(); });
ipcMain.handle('window:toggle-pin', () => {
  if (!mainWindow) return true;
  const next = !mainWindow.isAlwaysOnTop();
  mainWindow.setAlwaysOnTop(next, 'floating');
  return next;
});
ipcMain.handle('notify', (_e, { title, body }) => {
  if (Notification.isSupported()) new Notification({ title, body, silent: true }).show();
});
ipcMain.handle('window:resize', (_e, { width, height }) => {
  if (!mainWindow) return;
  const b = mainWindow.getBounds();
  mainWindow.setBounds({ x: b.x, y: b.y, width, height });
});

// 音乐：打开文件选择器（支持多选）
ipcMain.handle('music:pick', async () => {
  if (!mainWindow) return [];
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '添加音乐到音乐库（可多选）',
    filters: [
      { name: '音频文件', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'] },
      { name: '所有文件', extensions: ['*'] }
    ],
    properties: ['openFile', 'multiSelections']
  });
  if (result.canceled || !result.filePaths.length) return [];
  return result.filePaths.map(fp => ({
    path: fp,
    name: path.basename(fp),
    url: pathToFileURL(fp).href
  }));
});

// 导出学习日志
ipcMain.handle('data:export', async (_e, { data, format }) => {
  if (!mainWindow) return { ok: false };

  const ext = format === 'csv' ? 'csv' : 'json';
  const defaultName = `moyi-timer-log_${new Date().toISOString().split('T')[0]}.${ext}`;

  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出学习日志',
    defaultPath: defaultName,
    filters: ext === 'csv'
      ? [{ name: 'CSV 表格', extensions: ['csv'] }]
      : [{ name: 'JSON 数据', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  try {
    fs.writeFileSync(result.filePath, data, 'utf8');
    return { ok: true, path: result.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// 导入学习日志
ipcMain.handle('data:import', async () => {
  if (!mainWindow) return { ok: false };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入学习日志',
    filters: [{ name: 'JSON 数据', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true };

  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf8');
    return { ok: true, path: result.filePaths[0], content };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ========== 生命周期 ==========
app.whenReady().then(() => {
  createWindow();
  createTray();

  globalShortcut.register('CommandOrControl+Shift+M', () => {
    if (!mainWindow) return;
    mainWindow.isVisible() ? mainWindow.hide() : (mainWindow.show(), mainWindow.focus());
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else if (mainWindow) mainWindow.show();
  });
});

app.on('before-quit', () => { isQuitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });