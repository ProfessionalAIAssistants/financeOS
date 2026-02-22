import { spawn } from 'child_process';
import path from 'path';
import { config } from '../config';

export interface OFXDownloadResult {
  success: boolean;
  files: string[];
  error?: string;
  institution: string;
}

export function downloadOFX(institution: 'chase' | 'usaa', days = 30): Promise<OFXDownloadResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '../ofx/client.py');
    const outputDir  = path.join(config.downloadsDir, institution);

    const env = {
      ...process.env,
      CHASE_USERNAME: config.chaseUsername,
      CHASE_PASSWORD: config.chasePassword,
      USAA_USERNAME:  config.usaaUsername,
      USAA_PASSWORD:  config.usaaPassword,
    };

    const proc = spawn('python3', [
      scriptPath,
      '--institution', institution,
      '--days', String(days),
      '--output', config.downloadsDir,
    ], { env });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ success: false, files: [], error: 'Timeout after 120s', institution });
    }, 120000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(stdout.trim());
        resolve({ ...result, institution });
      } catch {
        resolve({
          success: false,
          files: [],
          error: stderr || `Exit code ${code}`,
          institution,
        });
      }
    });
  });
}
