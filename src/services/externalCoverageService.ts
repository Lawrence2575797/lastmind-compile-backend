import { listUserFolders } from './folderSyncService';

// Prior learning is intentionally kept outside concept_reviews: it should
// unblock prerequisites without inventing an FSRS card, due date, stability,
// recall score, or Keys event. The selection lives in the synced folder JSON,
// so it follows the student's account without requiring a second copy.
export async function getExternalCoveredConceptIds(userId: string): Promise<Set<string>> {
  const folders = await listUserFolders(userId);
  const covered = new Set<string>();
  for (const folder of folders) {
    if (folder.deletedAt || !folder.data || typeof folder.data !== 'object') continue;
    const ids = (folder.data as { externalCoveredConceptIds?: unknown }).externalCoveredConceptIds;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) if (typeof id === 'string' && id) covered.add(id);
  }
  return covered;
}
