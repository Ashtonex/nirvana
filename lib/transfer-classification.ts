type TransferLikeEntry = {
  category?: string | null;
  description?: string | null;
};

const SAVINGS_TRANSFER_KEYWORDS = ['savings', 'saving', 'blackbox', 'black box'];
const SAVINGS_TRANSFER_CATEGORIES = new Set(['Savings', 'Blackbox']);

export function isSavingsOrBlackboxText(value: string | null | undefined) {
  const text = String(value || '').toLowerCase();
  return SAVINGS_TRANSFER_KEYWORDS.some((keyword) => text.includes(keyword));
}

export function getSavingsTransferCategory(description: string | null | undefined) {
  const text = String(description || '').toLowerCase();
  if (text.includes('blackbox') || text.includes('black box')) return 'Blackbox';
  if (text.includes('saving') || text.includes('savings')) return 'Savings';
  return 'Transfer';
}

export function isSavingsOrBlackboxTransferEntry(entry: TransferLikeEntry) {
  const category = String(entry.category || '');
  if (SAVINGS_TRANSFER_CATEGORIES.has(category)) return true;

  const normalizedCategory = category.toLowerCase();
  if (normalizedCategory === 'transfer') {
    return isSavingsOrBlackboxText(`${entry.category || ''} ${entry.description || ''}`);
  }

  return isSavingsOrBlackboxText(`${entry.category || ''} ${entry.description || ''}`);
}
