export function getMaxBulkImport(): number {
  let maxBulkImport = parseInt(process.env.MAX_BULK_IMPORT || '1000');
  if (maxBulkImport > 50) {
    // never more than 50!
    maxBulkImport = 1000;
  }
  return maxBulkImport;
}
