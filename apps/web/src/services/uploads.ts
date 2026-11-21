/** Sends a file to a Convex upload URL and returns its storage id. */
export async function uploadFile(uploadUrl: string, file: File): Promise<string> {
  const response = await fetch(uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  });
  if (!response.ok) throw new Error('Upload failed');
  const { storageId } = await response.json();
  return storageId;
}
