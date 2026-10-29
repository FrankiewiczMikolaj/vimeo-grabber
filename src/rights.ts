export async function rightsAcknowledged(): Promise<boolean> {
  try {
    return (await chrome.storage.local.get('rightsAcknowledged')).rightsAcknowledged === true;
  } catch {
    return false;
  }
}
