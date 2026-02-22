export interface OFXTransaction {
  id: string;
  date: string;
  name: string;
  amount: number;
  type?: string;
  memo?: string;
}

export interface ParsedOFX {
  transactions: OFXTransaction[];
  accountId: string;
  accountType: string;
  institution: string;
  balance?: number;
  balanceDate?: string;
}

function extractTag(content: string, tag: string): string {
  const re = new RegExp(`<${tag}>([^<\r\n]+)`, 'i');
  const m = content.match(re);
  return m ? m[1].trim() : '';
}

function parseOFXDate(d: string): string {
  const clean = d.replace(/\[.*\]/, '').trim();
  if (clean.length >= 8) {
    const y = clean.slice(0, 4);
    const mo = clean.slice(4, 6);
    const day = clean.slice(6, 8);
    return `${y}-${mo}-${day}`;
  }
  return new Date().toISOString().split('T')[0];
}

export function parseOFX(content: string): ParsedOFX {
  const transactions: OFXTransaction[] = [];

  // Extract account info
  const accountId = extractTag(content, 'ACCTID') || extractTag(content, 'ACCTFROM>ACCTID');
  const accountType = extractTag(content, 'ACCTTYPE') || 'checking';
  const institution = extractTag(content, 'ORG') || extractTag(content, 'FID') || 'unknown';
  const balanceStr = extractTag(content, 'BALAMT');
  const balance = balanceStr ? parseFloat(balanceStr) : undefined;
  const balanceDateRaw = extractTag(content, 'DTASOF');
  const balanceDate = balanceDateRaw ? parseOFXDate(balanceDateRaw) : undefined;

  // Extract transactions — handle both SGML and XML
  const stmtTrnRe = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match;

  while ((match = stmtTrnRe.exec(content)) !== null) {
    const block = match[1];
    const id = extractTag(block, 'FITID');
    const dateRaw = extractTag(block, 'DTPOSTED');
    const amountStr = extractTag(block, 'TRNAMT');
    const name = extractTag(block, 'NAME') || extractTag(block, 'PAYEE') || 'Unknown';
    const memo = extractTag(block, 'MEMO');
    const trntype = extractTag(block, 'TRNTYPE');

    if (!amountStr) continue;

    transactions.push({
      id,
      date: dateRaw ? parseOFXDate(dateRaw) : new Date().toISOString().split('T')[0],
      name,
      amount: parseFloat(amountStr),
      type: trntype,
      memo,
    });
  }

  // Fallback for SGML without closing tags
  if (transactions.length === 0) {
    const txBlocks = content.split('<STMTTRN>').slice(1);
    for (const block of txBlocks) {
      const id = extractTag(block, 'FITID');
      const dateRaw = extractTag(block, 'DTPOSTED');
      const amountStr = extractTag(block, 'TRNAMT');
      const name = extractTag(block, 'NAME') || extractTag(block, 'PAYEE') || 'Unknown';
      const memo = extractTag(block, 'MEMO');
      if (!amountStr) continue;
      transactions.push({
        id,
        date: dateRaw ? parseOFXDate(dateRaw) : new Date().toISOString().split('T')[0],
        name,
        amount: parseFloat(amountStr),
        memo,
      });
    }
  }

  return { transactions, accountId, accountType, institution, balance, balanceDate };
}
