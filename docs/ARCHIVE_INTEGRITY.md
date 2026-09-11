# .jnote integrity pipeline

Export transaction:
1. Serialize posts/profile and resolve immutable app-owned media.
2. Build a temporary .jnote in app cache while hashing each media file.
3. fsync the temporary archive.
4. Re-open the ZIP and verify checksums for metadata and every referenced attachment.
5. Copy the verified archive to the selected SAF destination with progress and fsync.
6. Verify the destination size when the document provider exposes it.

Import transaction:
1. Copy the selected document to an app-owned staging directory with progress and fsync.
2. Validate the central directory/local ZIP stream, entry count, safe paths, entry sizes and storage capacity.
3. Extract with bounded metadata sizes and SHA-256 media hashing.
4. Require checksums for manifest/posts/profile and every media entry; reject missing or extra media.
5. Compare attachment metadata size/SHA-256 with staged bytes.
6. On confirmation, copy each media item to a temporary file in the final media filesystem, fsync and verify SHA-256/size.
7. Rename into place (or verified fallback copy), then verify the final file again.
8. Commit IndexedDB post/media metadata only after native media commit succeeds. Roll back newly-created files if the data transaction fails.
