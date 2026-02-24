/**
 * Tests for runFinanceDL job.
 */

const mockSpawn = jest.fn();
jest.mock('child_process', () => ({
  spawn: mockSpawn,
}));

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
jest.mock('../../db/client', () => ({ query: mockQuery }));

const mockEvaluateRules = jest.fn().mockResolvedValue(undefined);
jest.mock('../../alerts/rules', () => ({
  evaluateAlertRules: mockEvaluateRules,
}));

jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { runFinanceDL } from '../../jobs/runFinanceDL';
import { EventEmitter } from 'events';

function createMockProcess(exitCode: number, delay = 10) {
  const proc = new EventEmitter() as EventEmitter & {
    stderr: EventEmitter;
    kill: jest.Mock;
  };
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  setTimeout(() => proc.emit('close', exitCode), delay);
  return proc;
}

afterEach(() => jest.clearAllMocks());

describe('runFinanceDL', () => {
  test('runs for default institutions', async () => {
    mockSpawn.mockImplementation(() => createMockProcess(0));

    await runFinanceDL();

    expect(mockSpawn).toHaveBeenCalledTimes(3);
    expect(mockSpawn).toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['--institutions', 'capitalone']),
      expect.any(Object)
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['--institutions', 'macu']),
      expect.any(Object)
    );
    expect(mockSpawn).toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['--institutions', 'm1finance']),
      expect.any(Object)
    );
  });

  test('runs for specified institutions only', async () => {
    mockSpawn.mockImplementation(() => createMockProcess(0));

    await runFinanceDL(['chase']);

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn).toHaveBeenCalledWith(
      'python3',
      expect.arrayContaining(['--institutions', 'chase']),
      expect.any(Object)
    );
  });

  test('records success in sync_log', async () => {
    mockSpawn.mockImplementation(() => createMockProcess(0));

    await runFinanceDL(['chase']);

    // INSERT running
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO sync_log"),
      ['chase']
    );
    // UPDATE success
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_log SET status"),
      ['success', 'chase']
    );
  });

  test('triggers alert on failure', async () => {
    mockSpawn.mockImplementation(() => createMockProcess(1));

    await runFinanceDL(['chase']);

    expect(mockEvaluateRules).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'sync_failure',
        institution: 'chase',
      })
    );
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE sync_log SET status"),
      ['error', 'chase']
    );
  });

  test('does not trigger alert on success', async () => {
    mockSpawn.mockImplementation(() => createMockProcess(0));

    await runFinanceDL(['chase']);

    expect(mockEvaluateRules).not.toHaveBeenCalled();
  });
});
