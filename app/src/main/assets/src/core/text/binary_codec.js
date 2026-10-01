function bytesToBase64(bytes) {
  let out = '';

  for (
    let i = 0;
    i < bytes.length;
    i += 32768
  ) {
    out += String.fromCharCode(
      ...bytes.subarray(i, i + 32768)
    );
  }

  return btoa(out);
}


function base64ToBytes(value) {
  const string = atob(value);

  return Uint8Array.from(
    string,
    char => char.charCodeAt(0)
  );
}


