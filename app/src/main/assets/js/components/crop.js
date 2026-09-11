const picker = document.getElementById('avatarPicker');
const cropScreen = document.getElementById('cropScreen');
const cropCanvas = document.getElementById('cropCanvas');
const ctx = cropCanvas.getContext('2d');

const CROP_CX = cropCanvas.width / 2;
const CROP_CY = 340;
const CROP_R = 255;
const CROP_SIZE = CROP_R * 2;
let cropShape = 'circle';
let cropWidth = CROP_SIZE;
let cropHeight = CROP_SIZE;
let cropMaxSide = 512;
let cropPicker = picker;
let cropSave = null;
let cropGeneration = 0;
let cropSaving = false;

let cropImage = null;
let baseScale = 1;
let zoom = 1;
let offsetX = 0;
let offsetY = 0;
let dragging = false;
let lastX = 0;
let lastY = 0;
let pointers = new Map();
let pinchStartDist = 0;
let pinchStartZoom = 1;

function changeAvatar() {
  if (!isWorkspaceWritable()) return;
  picker.click();
}

function handleAvatarFile(event) {
  if (!isWorkspaceWritable()) { event.target.value = ''; return; }
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (file) openAvatarCrop(file, async result => {
    // Commit before updating the visible profile, so a failed write preserves it.
    AppStorage.setItem(PROFILE_AVATAR_KEY, result);
    document.getElementById('mainAvatar').src = result;
    document.querySelectorAll('.sync-avatar').forEach(img => img.src = result);
    renderPosts();
  });
}
function openAvatarCrop(file, onSave) {
  openImageCrop(file, {
    shape: typeof getAvatarShape === 'function' && getAvatarShape() === 'square' ? 'square' : 'circle',
    aspectRatio: 1,
    maxSide: 512,
    picker
  }, onSave);
}

function openImageCrop(file, options, onSave) {
  if (!file.type.startsWith('image/')) { alert(t('imageOnly')); return; }
  const config = options || {};
  const aspectRatio = Math.max(.35, Math.min(2.85, Number(config.aspectRatio) || 1));
  const generation = ++cropGeneration;
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    if (generation !== cropGeneration) return;
    cropImage = img;
    cropShape = config.shape === 'circle' ? 'circle' : (config.shape === 'square' ? 'square' : 'rectangle');
    cropMaxSide = Math.max(256, Math.min(2560, Number(config.maxSide) || 512));
    cropPicker = config.picker || null;
    cropSave = onSave;
    cropWidth = Math.min(CROP_SIZE, 590 * aspectRatio);
    cropHeight = cropWidth / aspectRatio;
    baseScale = Math.max(cropWidth / img.naturalWidth, cropHeight / img.naturalHeight);
    zoom = 1; offsetX = 0; offsetY = 0; pointers.clear(); dragging = false;
    document.getElementById('zoomRange').value = 1;
    document.body.appendChild(cropScreen);
    cropScreen.classList.add('open');
    document.body.style.overflow = 'hidden';
    drawCrop();
  };
  img.onerror = () => { URL.revokeObjectURL(url); alert(t('imageLoadFailed')); };
  img.src = url;
}

function closeCrop() {
  if (cropSaving) return;
  ++cropGeneration;
  cropScreen.classList.remove('open');
  cropImage = null; cropSave = null;
  document.body.style.overflow = document.querySelector('.settings-screen.open') ? 'hidden' : '';
  if (cropPicker) cropPicker.value = '';
  cropPicker = null;
  pointers.clear();
  dragging = false;
}

function clampOffsets() {
  if (!cropImage) return;
  const s = baseScale * zoom;
  const dw = cropImage.naturalWidth * s;
  const dh = cropImage.naturalHeight * s;
  const maxX = Math.max(0, dw / 2 - cropWidth / 2);
  const maxY = Math.max(0, dh / 2 - cropHeight / 2);
  offsetX = Math.max(-maxX, Math.min(maxX, offsetX));
  offsetY = Math.max(-maxY, Math.min(maxY, offsetY));
}

function drawCrop() {
  if (!cropImage) return;

  clampOffsets();
  ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

  const s = baseScale * zoom;
  const dw = cropImage.naturalWidth * s;
  const dh = cropImage.naturalHeight * s;
  const dx = CROP_CX - dw / 2 + offsetX;
  const dy = CROP_CY - dh / 2 + offsetY;

  ctx.drawImage(cropImage, dx, dy, dw, dh);

  // Dim everything outside the active circle/square/background crop area.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.48)';
  ctx.beginPath();
  ctx.rect(0, 0, cropCanvas.width, cropCanvas.height);
  if (cropShape === 'circle') ctx.arc(CROP_CX, CROP_CY, cropWidth / 2, 0, Math.PI * 2, true);
  else ctx.rect(CROP_CX - cropWidth / 2, CROP_CY - cropHeight / 2, cropWidth, cropHeight);
  ctx.fill('evenodd');
  ctx.restore();

  // Draw the visible crop boundary using the selected avatar/background shape.
  ctx.save();
  ctx.beginPath();
  if (cropShape === 'circle') ctx.arc(CROP_CX, CROP_CY, cropWidth / 2, 0, Math.PI * 2);
  else ctx.rect(CROP_CX - cropWidth / 2, CROP_CY - cropHeight / 2, cropWidth, cropHeight);
  ctx.strokeStyle = 'rgba(255,255,255,.96)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function setZoom(v) {
  zoom = Number(v);
  clampOffsets();
  drawCrop();
}

function canvasPoint(ev) {
  const r = cropCanvas.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) * cropCanvas.width / r.width,
    y: (ev.clientY - r.top) * cropCanvas.height / r.height
  };
}

function pointerDistance() {
  const pts = [...pointers.values()];
  if (pts.length < 2) return 0;
  return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
}

cropCanvas.addEventListener('pointerdown', ev => {
  cropCanvas.setPointerCapture(ev.pointerId);
  const p = canvasPoint(ev);
  pointers.set(ev.pointerId, p);

  if (pointers.size === 1) {
    dragging = true;
    lastX = p.x;
    lastY = p.y;
  } else if (pointers.size === 2) {
    dragging = false;
    pinchStartDist = pointerDistance();
    pinchStartZoom = zoom;
  }
});

cropCanvas.addEventListener('pointermove', ev => {
  if (!pointers.has(ev.pointerId)) return;
  const p = canvasPoint(ev);
  pointers.set(ev.pointerId, p);

  if (pointers.size === 2) {
    const d = pointerDistance();
    if (pinchStartDist > 0) {
      zoom = Math.max(1, Math.min(4, pinchStartZoom * d / pinchStartDist));
      document.getElementById('zoomRange').value = zoom;
      drawCrop();
    }
    return;
  }

  if (dragging && pointers.size === 1) {
    offsetX += p.x - lastX;
    offsetY += p.y - lastY;
    lastX = p.x;
    lastY = p.y;
    drawCrop();
  }
});

function releasePointer(ev) {
  pointers.delete(ev.pointerId);
  if (pointers.size === 1) {
    const p = [...pointers.values()][0];
    dragging = true;
    lastX = p.x;
    lastY = p.y;
  } else {
    dragging = false;
  }
}
cropCanvas.addEventListener('pointerup', releasePointer);
cropCanvas.addEventListener('pointercancel', releasePointer);

cropCanvas.addEventListener('wheel', ev => {
  ev.preventDefault();
  zoom = Math.max(1, Math.min(4, zoom * (ev.deltaY < 0 ? 1.06 : 0.94)));
  document.getElementById('zoomRange').value = zoom;
  drawCrop();
}, {passive:false});

async function finishCrop() {
  if (!cropImage || cropSaving) return;
  clampOffsets();
  cropSaving = true;
  const button = cropScreen.querySelector('.crop-done');
  button.disabled = true;
  try {
    const out = document.createElement('canvas');
    const ratio = cropWidth / cropHeight;
    out.width = Math.round(ratio >= 1 ? cropMaxSide : cropMaxSide * ratio);
    out.height = Math.round(ratio >= 1 ? cropMaxSide / ratio : cropMaxSide);
    const scale = baseScale * zoom;
    const dx = CROP_CX - cropImage.naturalWidth * scale / 2 + offsetX;
    const dy = CROP_CY - cropImage.naturalHeight * scale / 2 + offsetY;
    out.getContext('2d').drawImage(cropImage,
      (CROP_CX - cropWidth/2 - dx)/scale, (CROP_CY - cropHeight/2 - dy)/scale,
      cropWidth/scale, cropHeight/scale, 0, 0, out.width, out.height);
    await cropSave(out.toDataURL('image/jpeg', .88));
    cropSaving = false;
    closeCrop();
  } catch (error) {
    console.error('Crop save failed', error);
    alert(t('storageFull'));
  } finally {
    cropSaving = false; button.disabled = false;
  }
}
