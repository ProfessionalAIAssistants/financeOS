import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '../hooks/useQuery';
import { syncApi, authApi } from '../lib/api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { PageSpinner } from '../components/ui/Spinner';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { useTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import {
  Save, RefreshCw, Database, Bell, Cpu, User,
  Lock, Palette, Sun, Moon, Monitor, AlertTriangle, Trash2,
} from 'lucide-react';
import { fmtRelative } from '../lib/utils';

function InputField({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-xs mb-1.5 block font-medium" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none transition-colors"
        style={{
          background: 'var(--bg-input)',
          border: '1px solid var(--border-input)',
          color: 'var(--text-primary)',
        }}
        onFocus={e => { e.currentTarget.style.borderColor = 'var(--border-focus)'; }}
        onBlur={e => { e.currentTarget.style.borderColor = 'var(--border-input)'; }}
      />
    </div>
  );
}

export function Settings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { theme, setTheme } = useTheme();
  const { user, logout } = useAuth();
  const { data: status, isLoading } = useQuery(['sync-status'], syncApi.status);
  const syncMutation = useMutation({ mutationFn: () => syncApi.force() });

  // Profile form
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');

  // ntfy
  const [ntfyTopic, setNtfyTopic] = useState('financeos');

  // Danger zone
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const profileMutation = useMutation({
    mutationFn: () => authApi.updateProfile({ name: name.trim(), email: email.trim() }),
    onSuccess: () => {
      toast('Profile updated', 'success');
      qc.invalidateQueries({ queryKey: ['auth-me'] });
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      toast(err.response?.data?.error ?? 'Failed to update profile', 'error');
    },
  });

  const passwordMutation = useMutation({
    mutationFn: () => authApi.changePassword({ currentPassword: currentPw, newPassword: newPw }),
    onSuccess: () => {
      toast('Password changed. Logging out…', 'success');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => void logout(), 1500);
    },
    onError: (err: Error & { response?: { data?: { error?: string } } }) => {
      toast(err.response?.data?.error ?? 'Failed to change password', 'error');
    },
  });

  if (isLoading) return <PageSpinner />;

  const themeOptions = [
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const;

  return (
    <div className="space-y-6 max-w-2xl pb-20 md:pb-0">

      {/* ─── Profile ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <User className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </CardHeader>
        <div className="space-y-4">
          <InputField label="Display Name" value={name} onChange={setName} placeholder="Your name" />
          <InputField label="Email Address" value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
          <Button
            variant="primary"
            size="sm"
            icon={<Save className="w-4 h-4" />}
            loading={profileMutation.isPending}
            disabled={(!name.trim() && !email.trim()) || (name === (user?.name ?? '') && email === (user?.email ?? ''))}
            onClick={() => profileMutation.mutate()}
          >
            Save Profile
          </Button>
        </div>
      </Card>

      {/* ─── Password ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Change Password</CardTitle>
          <Lock className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </CardHeader>
        <div className="space-y-4">
          <InputField label="Current Password" value={currentPw} onChange={setCurrentPw} type="password" />
          <InputField label="New Password" value={newPw} onChange={setNewPw} type="password" placeholder="Min 8 characters" />
          <InputField label="Confirm New Password" value={confirmPw} onChange={setConfirmPw} type="password" />
          {newPw && confirmPw && newPw !== confirmPw && (
            <p className="text-xs text-red-400">Passwords do not match.</p>
          )}
          <Button
            variant="primary"
            size="sm"
            icon={<Lock className="w-4 h-4" />}
            loading={passwordMutation.isPending}
            disabled={!currentPw || !newPw || newPw.length < 8 || newPw !== confirmPw}
            onClick={() => passwordMutation.mutate()}
          >
            Update Password
          </Button>
        </div>
      </Card>

      {/* ─── Appearance ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <Palette className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </CardHeader>
        <div className="space-y-3">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Choose how FinanceOS looks to you.</p>
          <div className="flex gap-2">
            {themeOptions.map(({ value, label, icon: Icon }) => {
              const active = theme === value;
              return (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200"
                  style={active ? {
                    background: 'var(--accent-subtle)',
                    color: 'var(--accent)',
                    border: '1px solid var(--accent)',
                    boxShadow: 'var(--shadow-glow)',
                  } : {
                    background: 'var(--bg-input)',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-input)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* ─── Push Notifications ───────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Push Notifications</CardTitle>
          <Bell className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} />
        </CardHeader>
        <div className="space-y-4">
          <InputField label="ntfy Topic Name" value={ntfyTopic} onChange={setNtfyTopic} placeholder="financeos" />
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Subscribe to <code style={{ color: 'var(--accent)' }}>ntfy.sh/{ntfyTopic}</code> on your phone to get alerts.
          </p>
          <div className="p-3 rounded-lg text-xs" style={{ background: 'var(--accent-subtle)', border: '1px solid var(--border-focus)', color: 'var(--text-secondary)' }}>
            <p className="font-medium mb-1" style={{ color: 'var(--accent)' }}>📱 Mobile Setup</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>Install the <strong style={{ color: 'var(--text-primary)' }}>ntfy</strong> app (iOS / Android)</li>
              <li>Subscribe to topic: <code style={{ color: 'var(--accent)' }}>{ntfyTopic}</code></li>
              <li>Or use self-hosted ntfy at port 8073</li>
            </ol>
          </div>
        </div>
      </Card>

      {/* ─── System Status ────────────────────────────────────────── */}
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

      {/* ─── Danger Zone ──────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="w-4 h-4" /> Danger Zone
            </span>
          </CardTitle>
        </CardHeader>
        <div className="space-y-3">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Permanently delete your account and all associated data. This action cannot be undone.
          </p>
          <Button
            variant="danger"
            size="sm"
            icon={<Trash2 className="w-4 h-4" />}
            onClick={() => setShowDeleteConfirm(true)}
          >
            Delete Account
          </Button>
        </div>
      </Card>

      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Account?"
        message="This will permanently remove your account, synced data, alert rules, and all settings. This cannot be undone."
        confirmLabel="Delete Account"
        danger
        onConfirm={() => {
          setShowDeleteConfirm(false);
          toast('Account deletion is not yet available.', 'info');
        }}
        onClose={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}
