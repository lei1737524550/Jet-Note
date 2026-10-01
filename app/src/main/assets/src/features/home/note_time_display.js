function formatPostTimestamp(post) {
  const parsed = Date.parse(post?.createdAt || '');
  const fallbackId = Number(post?.id);
  const timestamp = Number.isFinite(parsed)
    ? parsed
    : (Number.isFinite(fallbackId) && fallbackId > 0 ? fallbackId : NaN);

  if (!Number.isFinite(timestamp)) return String(post?.time || '');

  const date = new Date(timestamp);
  const now = new Date();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  const isToday = date.getFullYear() === now.getFullYear()
    && date.getMonth() === now.getMonth()
    && date.getDate() === now.getDate();

  if (isToday) return `${hh}:${mm} ${t('today')}`;
  if (date.getFullYear() === now.getFullYear()) return `${hh}:${mm} ${month}/${day}`;
  return `${hh}:${mm} ${date.getFullYear()}/${month}/${day}`;
}

function formatNowForPost() {
  return formatPostTimestamp({ createdAt: new Date().toISOString() });
}


