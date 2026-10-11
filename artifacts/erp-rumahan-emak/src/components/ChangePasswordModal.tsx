import { useState } from 'react';
import type { FormEvent } from 'react';
import { Modal } from './ui/modal';
import PasswordInput from './PasswordInput';

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const passwordsMatch = newPassword === confirmPassword;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordsMatch || newPassword.length < 8) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch('/api/users/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Gagal mengganti password.');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setMessage({ type: 'success', text: data.message || 'Password berhasil diganti.' });
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Gagal mengganti password.' });
    } finally {
      setSaving(false);
    }
  }

  const close = () => {
    if (saving) return;
    if ((oldPassword || newPassword || confirmPassword) && !window.confirm('Perubahan belum disimpan. Tetap keluar?')) return;
    onClose();
  };
  return <Modal title="Ganti Password" onClose={close} dirty={Boolean(oldPassword || newPassword || confirmPassword)} busy={saving}>
      <form className="form-stack" onSubmit={submit}>
        <label className="field"><span>Password Lama</span><PasswordInput autoComplete="current-password" value={oldPassword} onChange={(event) => { setOldPassword(event.target.value); setMessage(null); }} required /></label>
        <label className="field"><span>Password Baru</span><PasswordInput autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setMessage(null); }} required /><small>Minimal 8 karakter.</small></label>
        <label className="field"><span>Konfirmasi Password Baru</span><PasswordInput autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setMessage(null); }} required /></label>
        {confirmPassword && !passwordsMatch && <div className="form-error" role="alert">Konfirmasi password belum sama.</div>}
        {message && <div className={message.type === 'success' ? 'readonly-notice' : 'form-error'} role="status">{message.text}</div>}
        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={close}>Tutup</button>
          <button className="button button-primary" disabled={saving || !passwordsMatch || newPassword.length < 8 || !oldPassword}>{saving ? 'Menyimpan…' : 'Simpan Password'}</button>
        </div>
      </form>
  </Modal>;
}
