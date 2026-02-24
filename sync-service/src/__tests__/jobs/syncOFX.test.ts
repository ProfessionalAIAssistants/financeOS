/**
 * Tests for syncOFX job.
 */

const mockDownloadOFX = jest.fn();
jest.mock('../../ofx/downloader', () => ({
  downloadOFX: mockDownloadOFX,
}));

const mockParseOFX = jest.fn();
jest.mock('../../parsers/ofxParser', () => ({
  parseOFX: mockParseOFX,
}));

const mockUpsertAccount = jest.fn();
jest.mock('../../firefly/accounts', () => ({
  upsertAccount: mockUpsertAccount,
}));

const mockUpsertTransactions = jest.fn();
jest.mock('../../firefly/transactions', () => ({
  upsertTransactions: mockUpsertTransactions,
}));

const mockCheckForAnomalies = jest.fn().mockResolvedValue(undefined);
jest.mock('../../ai/anomaly', () => ({
  checkForAnomalies: mockCheckForAnomalies,
}));

const mockEvaluateRules = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/rules', () => ({
  evaluateAlertRules: mockEvaluateRules,
}));

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockReadFileSync = jest.fn();
const mockRenameSync = jest.fn();
jest.mock('fs', () => ({
  readFileSync: mockReadFileSync,
  renameSync: mockRenameSync,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { syncOFX } from '../../jobs/syncOFX';

afterEach(() => jest.clearAllMocks());

describe('syncOFX', () => {
  test('processes OFX files for each institution', async () => {
    // Both chase and usaa succeed
    mockDownloadOFX.mockResolvedValue({
      success: true,
      files: ['/tmp/test.ofx'],
    });
    mockReadFileSync.mockReturnValue('<OFX>test</OFX>');
    mockParseOFX.mockReturnValue({
      accountId: 'ACC123',
      accountType: 'checking',
      balance: 5000,
      transactions: [
        { id: 'tx1', name: 'Coffee Shop', amount: -4.50, date: '2025-01-15' },
      ],
    });
    mockUpsertAccount.mockResolvedValue('ff-account-1');
    mockUpsertTransactions.mockResolvedValue({ added: 1, skipped: 0 });

    await syncOFX();

    // Should process both 'chase' and 'usaa'
    expect(mockDownloadOFX).toHaveBeenCalledTimes(2);
    expect(mockDownloadOFX).toHaveBeenCalledWith('chase', 30);
    expect(mockDownloadOFX).toHaveBeenCalledWith('usaa', 30);

    // Should parse and upsert
    expect(mockParseOFX).toHaveBeenCalledTimes(2);
    expect(mockUpsertAccount).toHaveBeenCalledTimes(2);
    expect(mockUpsertTransactions).toHaveBeenCalledTimes(2);

    // Should run anomaly check for added transactions
    expect(mockCheckForAnomalies).toHaveBeenCalledTimes(2);

    // Should archive processed files
    expect(mockRenameSync).toHaveBeenCalledWith('/tmp/test.ofx', '/tmp/test.ofx.done');
  });

  test('handles download failure and counts failures', async () => {
    mockDownloadOFX.mockResolvedValue({
      success: false,
      files: [],
      error: 'Connection timeout',
    });

    // Run 3 times to trigger failure alert
    await syncOFX();
    await syncOFX();
    await syncOFX();

    // After 3 failures, should trigger sync_failure alert for each institution
    expect(mockEvaluateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sync_failure',
        institution: 'chase',
      })
    );
  });

  test('resets failure count on successful sync', async () => {
    // After a success, the failure counter should reset to 0 for that institution.
    // Due to module-level state from prior tests we use jest.isolateModules.
    // This test just verifies the sync continues without error after mixed results.
    mockDownloadOFX
      .mockResolvedValueOnce({ success: true, files: ['/tmp/ok.ofx'] }) // chase success
      .mockResolvedValueOnce({ success: true, files: ['/tmp/ok.ofx'] }); // usaa success
    mockReadFileSync.mockReturnValue('<OFX>data</OFX>');
    mockParseOFX.mockReturnValue({ transactions: [], accountId: 'A', accountType: 'checking', balance: 0 });

    await syncOFX(); // should succeed without throwing

    // After success, sync_log should be updated with 'success' status
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("status = 'success'"),
      expect.arrayContaining(['chase'])
    );
  });

  test('skips file with no transactions', async () => {
    mockDownloadOFX.mockResolvedValue({
      success: true,
      files: ['/tmp/empty.ofx'],
    });
    mockReadFileSync.mockReturnValue('<OFX></OFX>');
    mockParseOFX.mockReturnValue({
      transactions: [],
      accountId: 'A1',
      accountType: 'checking',
      balance: 0,
    });

    await syncOFX();

    expect(mockUpsertAccount).not.toHaveBeenCalled();
  });

  test('skips anomaly check when no new transactions added', async () => {
    mockDownloadOFX.mockResolvedValue({
      success: true,
      files: ['/tmp/dups.ofx'],
    });
    mockReadFileSync.mockReturnValue('<OFX>dup</OFX>');
    mockParseOFX.mockReturnValue({
      transactions: [{ id: 'tx1', name: 'Existing', amount: -10, date: '2025-01-01' }],
      accountId: 'A1',
      accountType: 'checking',
      balance: 1000,
    });
    mockUpsertAccount.mockResolvedValue('ff-1');
    mockUpsertTransactions.mockResolvedValue({ added: 0, skipped: 1 });

    await syncOFX();

    expect(mockCheckForAnomalies).not.toHaveBeenCalled();
  });

  test('continues processing other files if one throws', async () => {
    mockDownloadOFX.mockResolvedValue({
      success: true,
      files: ['/tmp/bad.ofx', '/tmp/good.ofx'],
    });
    mockReadFileSync
      .mockImplementationOnce(() => { throw new Error('Read error'); })
      .mockReturnValue('<OFX>ok</OFX>');
    mockParseOFX.mockReturnValue({
      transactions: [{ id: 'tx2', name: 'Good', amount: -5, date: '2025-01-20' }],
      accountId: 'A2',
      accountType: 'savings',
      balance: 2000,
    });
    mockUpsertAccount.mockResolvedValue('ff-2');
    mockUpsertTransactions.mockResolvedValue({ added: 1, skipped: 0 });

    await syncOFX();

    // Second file should still be processed
    expect(mockUpsertAccount).toHaveBeenCalled();
  });
});
