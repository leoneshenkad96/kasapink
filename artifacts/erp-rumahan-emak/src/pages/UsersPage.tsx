import { useCallback, useEffect, useState } from 'react';
import { Modal, Field, FieldInput, FormError } from '@/App';
import { AlertCircle, Check, Pencil, Plus, Trash2, User, Shield } from 'lucide-react';

/* ─── Types ──────────────────────────────────────────── */
interface AppUser {
  id: number;
  username: string;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt?: string;
}

/* ─── Inline helper components (same pattern as App.tsx) ─ */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>;
}
function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false }: {
  children: React.ReactNode; onClick?: () => void; variant?: 'primary' | 'secondary' | 'quiet'; type?: 'button' | 'submit'; disabled?: boolean;
}) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`button button-${variant}`}>{children}</button>;
}
function PageHeading({ kicker, title, note, action }: { kicker: string; title: string; note: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{kicker}</div><h1>{title}</h1><p>{note}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}
function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon"><User size={20} /></span><b>{title}</b><p>{text}</p></div>;
}
function LoadingPanel() {
  return <div className="loading-grid"><div className="skeleton big" /><div className="skeleton" /><div className="skeleton" /></div>;
}

const errText = (e: unknown) => {
  const x = e as { response?: { data?: { error?: string; message?: string } }; message?: string };
  return x?.response?.data?.error || x?.response?.data?.message || x?.message || 'Terjadi kendala. Silakan coba lagi.';
};

const dateLabel = (d: string | Date) => {
  if (!d) return "";
  const day = d instanceof Date ? d.toISOString()?.slice(0, 10) : d?.slice?.(0, 10) ?? "";
  if (!day) return "";
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${day}T00:00:00`));
};

/* ─── Main Page ──────────────────────────────────────── */
function UsersPage() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState('');
  const [modal, setModal] = useState<AppUser | 'new' | null>(null);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setFetchError('');
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) throw new Error('Gagal memuat daftar pengguna');
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      setFetchError(errText(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchUsers(); }, [fetchUsers]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    const f = new FormData(e.currentTarget);
    const username = String(f.get('username')).trim();
    const password = String(f.get('password')).trim();
    const roles = String(f.get('roles')).split(',').map(r => r.trim()).filter(Boolean);
    const permissions = String(f.get('permissions')).split(',').map(p => p.trim()).filter(Boolean);

    try {
      if (modal === 'new') {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, roles, permissions }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Gagal membuat akun');
        }
      } else if (modal && typeof modal === 'object') {
        const body: Record<string, any> = { username, roles, permissions };
        if (password) body.password = password; // only send if changed
        const res = await fetch(`/api/admin/users/${modal.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Gagal memperbarui akun');
        }
      }
      setModal(null);
      await fetchUsers();
    } catch (err) {
      setFormError(errText(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: AppUser) => {
    if (!confirm(`Yakin ingin menghapus akun "${user.username}"?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Gagal menghapus akun');
      await fetchUsers();
    } catch (err) {
      alert(errText(err));
    }
  };

  const visible = users.filter(u =>
    `${u.username} ${(u.roles || []).join(' ')} ${(u.permissions || []).join(' ')}`.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingPanel />;
  if (fetchError) return (
    <div className="error-panel">
      <AlertCircle size={22} />
      <div>
        <b>Data belum dapat dimuat</b>
        <p>{fetchError}</p>
        <button className="text-button" onClick={() => void fetchUsers()}>Coba muat kembali</button>
      </div>
    </div>
  );

  return (
    <>
      <PageHeading
        kicker="PENGATURAN SISTEM"
        title="Manajemen Pengguna"
        note="Kelola akun pengguna, peran, dan hak akses sistem."
        action={<Button onClick={() => { setFormError(''); setModal('new'); }}><Plus size={17} /> Tambah akun</Button>}
      />

      <Card className="table-card">
        <div className="table-toolbar">
          <div className="search-wrap">
            <span className="search-mark">⌕</span>
            <input
              aria-label="Cari pengguna"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari username atau peran..."
            />
          </div>
          <span className="result-count">{visible.length} pengguna</span>
        </div>

        {visible.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>PENGGUNA</th>
                  <th>PERAN</th>
                  <th>HAK AKSES</th>
                  <th>DIBUAT</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visible.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="table-name">
                        <span className="ingredient-token">{u.username.slice(0, 1).toUpperCase()}</span>
                        <b>{u.username}</b>
                      </div>
                    </td>
                    <td>
                      {(u.roles || []).length > 0
                        ? (u.roles || []).map(r => <span key={r} className="status-pill status-ok" style={{ marginRight: '4px' }}>{r}</span>)
                        : <span className="muted">—</span>
                      }
                    </td>
                    <td>
                      {(u.permissions || []).length > 0
                        ? (u.permissions || []).join(', ')
                        : <span className="muted">—</span>
                      }
                    </td>
                    <td>{dateLabel(u.createdAt)}</td>
                    <td>
                      <button className="icon-button tiny" aria-label={`Ubah ${u.username}`} onClick={() => { setFormError(''); setModal(u); }}>
                        <Pencil size={15} />
                      </button>
                      <button className="icon-button tiny" aria-label={`Hapus ${u.username}`} onClick={() => handleDelete(u)} style={{ marginLeft: '6px', color: '#e11d48' }}>
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title={search ? 'Pengguna tidak ditemukan' : 'Belum ada akun pengguna'}
            text={search ? 'Coba kata pencarian lain.' : 'Tambahkan akun pertama untuk mulai mengelola pengguna.'}
          />
        )}
      </Card>

      {modal && (
        <Modal title={modal === 'new' ? 'Tambah akun baru' : 'Ubah data akun'} onClose={() => setModal(null)}>
          <form className="form-stack" onSubmit={submit}>
            <Field label="Username">
              <FieldInput
                name="username"
                required
                defaultValue={modal === 'new' ? '' : modal.username}
                placeholder="Contoh: admin"
              />
            </Field>
            <Field label={modal === 'new' ? 'Password' : 'Password baru'} hint={modal !== 'new' ? 'Kosongkan jika tidak ingin mengubah password.' : undefined}>
              <FieldInput
                name="password"
                type="password"
                required={modal === 'new'}
                placeholder="••••••"
              />
            </Field>
            <div className="form-row">
              <Field label="Peran (pisah koma)" hint="Contoh: admin, editor">
                <FieldInput
                  name="roles"
                  defaultValue={modal === 'new' ? '' : (modal.roles || []).join(', ')}
                  placeholder="admin, editor"
                />
              </Field>
              <Field label="Hak akses (pisah koma)" hint="Contoh: erp:read, erp:write">
                <FieldInput
                  name="permissions"
                  defaultValue={modal === 'new' ? '' : (modal.permissions || []).join(', ')}
                  placeholder="erp:read, erp:write"
                />
              </Field>
            </div>
            <FormError text={formError} />
            <div className="form-actions">
              <Button variant="quiet" onClick={() => setModal(null)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Menyimpan…' : modal === 'new' ? 'Buat akun' : 'Simpan perubahan'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default UsersPage;
