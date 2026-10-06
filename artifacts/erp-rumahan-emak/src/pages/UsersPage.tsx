import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/App';
import { Field, FieldInput, FormError } from '@/App';
import { Card } from '@/components/ui/card';
import { Plus } from 'lucide-react';

function UsersPage() {
  const [modal, setModal] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const username = String(f.get('username')).trim();
    const password = String(f.get('password')).trim();
    const roles = String(f.get('roles')).split(',').map(r => r.trim()).filter(Boolean);
    const permissions = String(f.get('permissions')).split(',').map(p => p.trim()).filter(Boolean);
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, roles, permissions }),
      });
      if (!res.ok) throw new Error('Gagal membuat akun');
      setSuccess('Akun berhasil dibuat');
      setError('');
      setModal(false);
    } catch (err: any) {
      setError(err?.message || 'Terjadi kesalahan');
    }
  };

  return (
    <>
      <Card className="table-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">MANAGE</span>
            <h2>Akun Pengguna</h2>
          </div>
          <Button onClick={() => { setError(''); setSuccess(''); setModal(true); }}>
            <Plus size={17} /> Tambah akun
          </Button>
        </div>
        {success && <div className="success-message" style={{ marginTop: '12px', color: '#28a745' }}>{success}</div>}
      </Card>
      {modal && (
        <Modal title="Tambah akun" onClose={() => setModal(false)}>
          <form className="form-stack" onSubmit={submit}>
            <Field label="Username">
              <FieldInput name="username" required placeholder="contoh: john" />
            </Field>
            <Field label="Password">
              <FieldInput name="password" type="password" required placeholder="******" />
            </Field>
            <Field label="Roles (comma‑separated)">
              <FieldInput name="roles" placeholder="admin,editor" />
            </Field>
            <Field label="Permissions (comma‑separated)">
              <FieldInput name="permissions" placeholder="erp:read,erp:write" />
            </Field>
            <FormError text={error} />
            <div className="form-actions">
              <Button variant="quiet" onClick={() => setModal(false)}>Batal</Button>
              <Button type="submit">Buat akun</Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

export default UsersPage;
