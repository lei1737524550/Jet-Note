const AVATAR_SHAPE_KEY = 'jet_note_avatar_shape';
const DEFAULT_BACKGROUND = {mode:'rgb', rgb:{r:255,g:255,b:255}, image:null};

let currentAvatarShape = AppStorage.getItem(AVATAR_SHAPE_KEY) === 'round' ? 'round' : 'square';
let currentBackground = structuredClone(DEFAULT_BACKGROUND);

const AppearanceRepository = {
  databasePromise: null,
  database() {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const databaseName = getCurrentAppMode() === 'demo' ? 'jet_note_appearance_demo' : 'jet_note_appearance';
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('settings')) {
          request.result.createObjectStore('settings');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Appearance database blocked'));
    });
    return this.databasePromise;
  },
  async getBackground() {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const request = tx.objectStore('settings').get('background');
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Background read failed'));
    });
  },
  async putBackground(value) {
    const db = await this.database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(value, 'background');
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Background save failed'));
    });
  }
};

function clampRgb(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= 255 ? number : fallback;
}

function normalizeBackground(value) {
  if (typeof value === 'string' && value.startsWith('data:image/')) {
    return {mode:'image', image:value, rgb:{...DEFAULT_BACKGROUND.rgb}};
  }
  if (!value || typeof value !== 'object') return structuredClone(DEFAULT_BACKGROUND);
  const rgb = value.rgb || {};
  const normalized = {
    mode: value.mode === 'image' && typeof value.image === 'string' ? 'image' : 'rgb',
    image: typeof value.image === 'string' && value.image.startsWith('data:image/') ? value.image : null,
    rgb: {
      r: clampRgb(rgb.r, DEFAULT_BACKGROUND.rgb.r),
      g: clampRgb(rgb.g, DEFAULT_BACKGROUND.rgb.g),
      b: clampRgb(rgb.b, DEFAULT_BACKGROUND.rgb.b)
    }
  };
  if (normalized.mode === 'image' && !normalized.image) normalized.mode = 'rgb';
  return normalized;
}

function getAvatarShape() {
  return currentAvatarShape;
}

function applyAvatarShape(shape) {
  currentAvatarShape = shape === 'round' ? 'round' : 'square';
  document.documentElement.dataset.avatarShape = currentAvatarShape;
}

function setAvatarShape(shape) {
  applyAvatarShape(shape);
  AppStorage.setItem(AVATAR_SHAPE_KEY, currentAvatarShape);
  refreshAppearanceSettings();
  if (typeof renderPosts === 'function') renderPosts();
}

function applyBackground(value) {
  currentBackground = normalizeBackground(value);
  const root = document.documentElement;
  const rgb = currentBackground.rgb;
  const color = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
  root.style.setProperty('--page-background', color);
  root.style.setProperty('--page-background-image', currentBackground.mode === 'image'
      ? `url("${currentBackground.image}")`
      : 'none');
  const theme = document.querySelector('meta[name="theme-color"]');
  if (theme) theme.content = currentBackground.mode === 'rgb'
      ? `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`
      : '#ffffff';
}

function refreshAppearanceSettings() {
  document.getElementById('avatarRoundOption')?.classList.toggle('active', currentAvatarShape === 'round');
  document.getElementById('avatarSquareOption')?.classList.toggle('active', currentAvatarShape === 'square');
  document.getElementById('backgroundImageOption')?.classList.toggle('active', currentBackground.mode === 'image');
  document.getElementById('backgroundRgbOption')?.classList.toggle('active', currentBackground.mode === 'rgb');

  const rgb = currentBackground.rgb;
  const r = document.getElementById('backgroundR');
  const g = document.getElementById('backgroundG');
  const b = document.getElementById('backgroundB');
  if (r && document.activeElement !== r) r.value = rgb.r;
  if (g && document.activeElement !== g) g.value = rgb.g;
  if (b && document.activeElement !== b) b.value = rgb.b;
  const summary = document.getElementById('backgroundRgbSummary');
  if (summary) summary.textContent = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
  document.getElementById('backgroundRgbEditor')?.classList.toggle('open', currentBackground.mode === 'rgb');
}

function showAppearanceStatus(message) {
  const status = document.getElementById('appearanceStatus');
  if (status) status.textContent = message;
}

function chooseBackgroundImage() {
  document.getElementById('backgroundImagePicker')?.click();
}

function handleBackgroundImageFile(event) {
  const picker = event.target;
  const file = picker.files && picker.files[0];
  picker.value = '';
  if (!file) return;
  const ratio = Math.max(.45, Math.min(2.2, window.innerWidth / window.innerHeight));
  openImageCrop(file, {
    shape: 'rectangle',
    aspectRatio: ratio,
    maxSide: 1920,
    picker
  }, async result => {
    const next = {mode:'image', image:result, rgb:{...currentBackground.rgb}};
    await AppearanceRepository.putBackground(next);
    applyBackground(next);
    refreshAppearanceSettings();
    showAppearanceStatus(t('backgroundSaved'));
  });
}

async function selectRgbBackground() {
  document.getElementById('backgroundRgbEditor')?.classList.add('open');
  await saveRgbBackground(false);
  document.getElementById('backgroundR')?.focus();
}

async function saveRgbBackground(showStatus = true) {
  const values = ['backgroundR','backgroundG','backgroundB'].map(id => Number(document.getElementById(id)?.value));
  if (values.some(value => !Number.isInteger(value) || value < 0 || value > 255)) {
    alert(t('invalidRgb'));
    return false;
  }
  const next = {mode:'rgb', image:currentBackground.image, rgb:{r:values[0],g:values[1],b:values[2]}};
  try {
    await AppearanceRepository.putBackground(next);
    applyBackground(next);
    refreshAppearanceSettings();
    if (showStatus) showAppearanceStatus(t('backgroundSaved'));
    return true;
  } catch (error) {
    console.error('Background save failed', error);
    alert(t('storageFull'));
    return false;
  }
}

applyAvatarShape(currentAvatarShape);
applyBackground(DEFAULT_BACKGROUND);
refreshAppearanceSettings();
AppearanceRepository.getBackground().then(value => {
  applyBackground(value);
  refreshAppearanceSettings();
}).catch(error => console.warn('Background restore failed', error));
