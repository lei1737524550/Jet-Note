const ALBUM_DB_NAME = 'qzone_album_backup_db';
const ALBUM_DB_VERSION = 1;
const ALBUM_STORE = 'photos';

let albumDBPromise = null;

let albumDeleteMode = false;
let albumSelectedIds = new Set();
let albumPhotoCache = [];

const ALBUM_DELETED_KEY = 'qzone_album_deleted_v1';

function loadAlbumDeletedIds() {
  try {
    const raw = JSON.parse(AppStorage.getItem(ALBUM_DELETED_KEY) || '[]');
    return new Set(Array.isArray(raw) ? raw : []);
  } catch (error) {
    return new Set();
  }
}

function saveAlbumDeletedIds(set) {
  AppStorage.setItem(ALBUM_DELETED_KEY, JSON.stringify([...set]));
}

function isAlbumRecordSuppressed(id) {
  return loadAlbumDeletedIds().has(id);
}

function markAlbumRecordsDeleted(ids) {
  const deleted = loadAlbumDeletedIds();
  ids.forEach(id => deleted.add(id));
  saveAlbumDeletedIds(deleted);
}

async function deleteAlbumRecords(ids) {
  if (!Array.isArray(ids) || !ids.length) return;

  const db = await openAlbumDB();

  await new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_STORE, 'readwrite');
    const store = tx.objectStore(ALBUM_STORE);

    ids.forEach(id => store.delete(id));

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Album delete failed'));
    tx.onabort = () => reject(tx.error || new Error('Album delete aborted'));
  });

  // 显式删除过的“备份记录”加入 tombstone，
  // 这样原说说还存在时，syncAllMediaToAlbum() 也不会立刻把它补回来。
  markAlbumRecordsDeleted(ids);
}


function openAlbumDB() {
  if (albumDBPromise) return albumDBPromise;

  albumDBPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(ALBUM_DB_NAME, ALBUM_DB_VERSION);

    request.onupgradeneeded = event => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(ALBUM_STORE)) {
        const store = db.createObjectStore(ALBUM_STORE, { keyPath: 'id' });
        store.createIndex('archivedAt', 'archivedAt', { unique:false });
        store.createIndex('sourceType', 'sourceType', { unique:false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
  });

  return albumDBPromise;
}

function simpleImageHash(value) {
  // FNV-1a: 作为同一内容图片的稳定去重键。
  let hash = 2166136261;

  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16);
}

async function putAlbumRecord(record) {
  const db = await openAlbumDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_STORE, 'readwrite');
    const store = tx.objectStore(ALBUM_STORE);

    store.put(record);

    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error || new Error('Album write failed'));
    tx.onabort = () => reject(tx.error || new Error('Album write aborted'));
  });
}

async function getAllAlbumRecords() {
  const db = await openAlbumDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(ALBUM_STORE, 'readonly');
    const request = tx.objectStore(ALBUM_STORE).getAll();

    request.onsuccess = () => {
      const rows = Array.isArray(request.result) ? request.result : [];
      rows.sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));
      resolve(rows);
    };

    request.onerror = () => reject(request.error || new Error('Album read failed'));
  });
}

function makeAlbumRecord(src, sourceType, sourceId, sourceTime = '') {
  const hash = simpleImageHash(src);

  return {
    // 同一张图片在同一个来源中只备份一次；
    // 来源被删除后，该记录仍保留。
    id: `${sourceType}:${sourceId}:${hash}`,
    src,
    hash,
    sourceType,
    sourceId,
    sourceTime,
    archivedAt: Date.now()
  };
}

async function backupImagesToAlbum(images, sourceType, sourceId, sourceTime = '') {
  const safe = Array.isArray(images) ? images.filter(src => NativeMedia.isImage(src)) : [];

  for (const src of safe) {
    const record = makeAlbumRecord(src, sourceType, sourceId, sourceTime);

    if (isAlbumRecordSuppressed(record.id)) {
      continue;
    }

    await putAlbumRecord(record);
  }
}

async function backupPostImages(post) {
  if (!post) return;
  await backupImagesToAlbum(post.images || [], 'post', post.id, post.time || '');
}

async function syncAllMediaToAlbum() {
  try {
    for (const post of posts) {
      await backupPostImages(post);
    }


  } catch (error) {
    console.error('Album sync failed:', error);
  }
}

function albumSourceLabel(type) {
  return type === 'post' ? t('fromPost') : t('album');
}

function updateAlbumHeaderState(total) {
  const count = document.getElementById('albumCount');
  const title = document.getElementById('albumTitle');
  const deleteButton = document.getElementById('albumDeleteButton');

  if (!count || !title || !deleteButton) return;

  if (albumDeleteMode) {
    title.textContent = t('albumSelect');
    count.textContent = currentLanguage === 'en'
      ? `${albumSelectedIds.size}/${total}`
      : `${albumSelectedIds.size}/${total}${t('albumCountUnit')}`;
    deleteButton.classList.add('active');
  } else {
    title.textContent = t('album');
    count.textContent = currentLanguage === 'en'
      ? `${total}${t('albumCountUnit')}`
      : `${total}${t('albumCountUnit')}`;
    deleteButton.classList.remove('active');
  }

  deleteButton.disabled = total === 0;
}

function toggleAlbumPhotoSelection(id) {
  if (albumSelectedIds.has(id)) {
    albumSelectedIds.delete(id);
  } else {
    albumSelectedIds.add(id);
  }

  renderAlbum();
}

function enterAlbumDeleteMode() {
  if (!albumPhotoCache.length) return;

  albumDeleteMode = true;
  albumSelectedIds.clear();
  renderAlbum();
}

function exitAlbumDeleteMode() {
  albumDeleteMode = false;
  albumSelectedIds.clear();
  renderAlbum();
}

function handleAlbumBack() {
  if (albumDeleteMode) {
    exitAlbumDeleteMode();
    return;
  }

  closeAlbum();
}

function handleAlbumDeleteButton() {
  if (!albumPhotoCache.length) return;

  if (!albumDeleteMode) {
    enterAlbumDeleteMode();
    return;
  }

  if (albumSelectedIds.size === 0) {
    exitAlbumDeleteMode();
    return;
  }

  openDeleteConfirm('album', [...albumSelectedIds]);
}

async function renderAlbum() {
  const grid = document.getElementById('albumGrid');
  const empty = document.getElementById('albumEmpty');

  if (!grid || !empty) return;

  try {
    const photos = await getAllAlbumRecords();
    albumPhotoCache = photos;

    if (photos.length === 0) {
      albumDeleteMode = false;
      albumSelectedIds.clear();
    } else {
      // 删除后清理已不存在的 selection。
      const validIds = new Set(photos.map(photo => photo.id));
      albumSelectedIds = new Set(
        [...albumSelectedIds].filter(id => validIds.has(id))
      );
    }

    updateAlbumHeaderState(photos.length);

    grid.innerHTML = photos.map(photo => {
      const selected = albumSelectedIds.has(photo.id);
      const classes = [
        'album-tile',
        albumDeleteMode ? 'select-mode' : '',
        selected ? 'selected' : ''
      ].filter(Boolean).join(' ');

      return `
        <div class="${classes}" data-album-id="${escapeHTML(photo.id)}">
          <img src="${photo.src}" alt="">
          <div class="album-source">${escapeHTML(albumSourceLabel(photo.sourceType))}</div>
          <div class="album-select-badge">${selected ? '✓' : ''}</div>
        </div>
      `;
    }).join('');

    empty.classList.toggle('show', photos.length === 0);

    const photoMap = new Map(photos.map(photo => [photo.id, photo]));

    grid.querySelectorAll('.album-tile').forEach(tile => {
      tile.addEventListener('click', event => {
        event.stopPropagation();

        const id = tile.dataset.albumId;
        const photo = photoMap.get(id);
        if (!photo) return;

        if (albumDeleteMode) {
          toggleAlbumPhotoSelection(id);
          return;
        }

        openImageViewer(photo.src);
      });
    });
  } catch (error) {
    console.error('Album render failed:', error);
    grid.innerHTML = '';
    albumPhotoCache = [];
    albumDeleteMode = false;
    albumSelectedIds.clear();
    updateAlbumHeaderState(0);
    empty.classList.add('show');
  }
}

async function openAlbum() {
  cancelDeleteConfirm();
  if (typeof closePostActionPanel === 'function') closePostActionPanel();
  const screen = document.getElementById('albumScreen');

  if (screen.parentElement !== document.body) {
    document.body.appendChild(screen);
  }

  screen.classList.add('open');
  document.body.style.overflow = 'hidden';

  // 打开相册前先同步一次，确保旧说说中的图片也被备份。
  await syncAllMediaToAlbum();
  applyLanguage();
  await renderAlbum();
}

function closeAlbum() {
  albumDeleteMode = false;
  albumSelectedIds.clear();
  document.getElementById('albumScreen').classList.remove('open');
  document.body.style.overflow = '';
}


/* =========================================================
   图片读取与压缩
   ========================================================= */
