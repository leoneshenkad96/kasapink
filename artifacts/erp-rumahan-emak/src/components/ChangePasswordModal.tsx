import { useState } from 'react';
import type { FormEvent } from 'react';
import { X } from 'lucide-react';
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
    const currentToken = localStorage.getItem('kasapink_token');
    try {
      const response = await fetch('/api/users/change-password', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${currentToken || ''}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ oldPassword, newPassword }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Gagal mengganti password.');
      if (typeof data.token !== 'string' || !data.token) throw new Error('Sesi baru tidak tersedia. Silakan login kembali.');
      if (localStorage.getItem('kasapink_token') === currentToken) {
        localStorage.setItem('kasapink_token', data.token);
      }
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

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="change-password-title">
      <div className="modal-head">
        <div><span className="eyebrow">PENGATURAN AKUN</span><h2 id="change-password-title">Ganti Password</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Tutup"><X size={19} /></button>
      </div>
      <form className="form-stack" onSubmit={submit}>
        <label className="field"><span>Password Lama</span><PasswordInput autoComplete="current-password" value={oldPassword} onChange={(event) => { setOldPassword(event.target.value); setMessage(null); }} required /></label>
        <label className="field"><span>Password Baru</span><PasswordInput autoComplete="new-password" minLength={8} value={newPassword} onChange={(event) => { setNewPassword(event.target.value); setMessage(null); }} required /><small>Minimal 8 karakter.</small></label>
        <label className="field"><span>Konfirmasi Password Baru</span><PasswordInput autoComplete="new-password" minLength={8} value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setMessage(null); }} required /></label>
        {confirmPassword && !passwordsMatch && <div className="form-error" role="alert">Konfirmasi password belum sama.</div>}
        {message && <div className={message.type === 'success' ? 'readonly-notice' : 'form-error'} role="status">{message.text}</div>}
        <div className="form-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>Tutup</button>
          <button className="button button-primary" disabled={saving || !passwordsMatch || newPassword.length < 8 || !oldPassword}>{saving ? 'Menyimpan…' : 'Simpan Password'}</button>
        </div>
      </form>
    </section>
  </div>;
}
