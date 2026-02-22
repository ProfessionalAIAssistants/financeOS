import { useState } from 'react';
import { useQuery, useMutation } from '../hooks/useQuery';
import { syncApi } from '../lib/api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { Save, RefreshCw, Database, Bell, Key, Cpu } from 'lucide-react';
import { fmtRelative } from '../lib/utils';

export function Settings() {
  const { data: status, isLoading } = useQuery(['sync-status'], syncApi.status);
  const syncMutation = useMutation({ mutationFn: () => syncApi.force() });

  const [ntfyTopic, setNtfyTopic] = useState('financeos');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    // In a real implementation this would call a settings API
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (isLoading) return <PageSpinner />;

  return (
    <div className="space-y-6 max-w-2xl pb-20 md:pb-0">

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <Button variant="ghost" size="sm" icon={<RefreshCw className="w-4 h-4" />}
            loading={syncMutation.isPending} onClick={() => syncMutation.mutate()}>
            Sync All
          </Button>
        </CardHeader>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Firefly III</span>
            </div>
            <Badge variant={status?.firefly?.healthy ? 'success' : 'danger'}>
              {status?.firefly?.healthy ? 'Connected' : 'Offline'}
            </Badge>
          </div>
          {status?.institutions?.map((inst: { name: string; lastSync?: string; lastStatus?: string }) => (
            <div key={inst.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm capitalize" style={{ color: 'var(--text-secondary)' }}>{inst.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {inst.lastSync && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{fmtRelative(inst.lastSync)}</span>}
                <Badge variant={inst.lastStatus === 'success' ? 'success' : inst.lastStatus ? 'danger' : 'default'}>
                  {inst.lastStatus ?? 'Never synced'}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Push Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications (ntfy.sh)</CardTitle>
          <Bell className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </CardHeader>
        <div className="space-y-4">
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>ntfy Topic Name</label>
            <input value={ntfyTopic} onChange={e => setNtfyTopic(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
              style={{
                background: 'var(--bg-input)',
                border: '1px solid var(--border-input)',
                color: 'var(--text-primary)',
              }} />
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Subscribe to <code className="text-blue-400">ntfy.sh/{ntfyTopic}</code> on your phone.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <p className="font-medium text-blue-300 mb-1">📱 Mobile Setup</p>
            <ol className="list-decimal list-inside space-y-1" style={{ color: 'var(--text-secondary)' }}>
              <li>Install the <strong style={{ color: 'var(--text-primary)' }}>ntfy</strong> app (iOS / Android)</li>
              <li>Subscribe to topic: <code className="text-blue-400">{ntfyTopic}</code></li>
              <li>Or use self-hosted ntfy at port 8073</li>
            </ol>
          </div>
        </div>
      </Card>

      {/* Credentials info */}
      <Card>
        <CardHeader>
          <CardTitle>Bank Credentials</CardTitle>
          <Key className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </CardHeader>
        <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
          Bank credentials are stored in <code className="text-blue-400">.env</code> at
          <code className="text-blue-400"> Desktop/Dashboard/.env</code>
          — never committed to git.
        </p>
        <div className="space-y-2 text-xs font-mono p-4 rounded-xl" style={{ background: 'var(--bg-input)', color: 'var(--text-muted)' }}>
          <p>CHASE_USERNAME=<span className="text-blue-400">your_email</span></p>
          <p>CHASE_PASSWORD=<span className="text-blue-400">your_password</span></p>
          <p>USAA_USERNAME=<span className="text-blue-400">your_id</span></p>
          <p>CAPITALONE_USERNAME=<span className="text-blue-400">your_email</span></p>
          <p>MACU_USERNAME=<span className="text-blue-400">your_username</span></p>
          <p>M1_USERNAME=<span className="text-blue-400">your_email</span></p>
          <p>OPENAI_API_KEY=<span className="text-blue-400">sk-...</span></p>
          <p>HOMESAGE_API_KEY=<span className="text-blue-400">optional</span></p>
        </div>
        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Edit .env and run <code>docker compose restart sync-service</code> to apply.</p>
      </Card>

      <Button icon={<Save className="w-4 h-4" />} onClick={handleSave} variant={saved ? 'success' : 'primary'}>
        {saved ? 'Saved!' : 'Save Settings'}
      </Button>
    </div>
  );
}
