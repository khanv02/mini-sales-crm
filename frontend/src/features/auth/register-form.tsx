import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PASSWORD_MIN_LENGTH } from '@pulse/shared';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { ApiClientError } from '../../lib/api/client';
import { useAuth } from './auth-context';

export function RegisterForm() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Mật khẩu cần tối thiểu ${PASSWORD_MIN_LENGTH} ký tự.`);
      return;
    }

    setSubmitting(true);
    try {
      await register({ orgName, name, email, password });
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Không thể tạo tài khoản.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit} noValidate>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Tên công ty</span>
        <Input
          name="orgName"
          required
          value={orgName}
          onChange={(event) => setOrgName(event.target.value)}
          placeholder="Công ty TNHH Pulse"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Họ và tên</span>
        <Input
          name="name"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Nguyễn Văn A"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Email</span>
        <Input
          type="email"
          name="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ten@congty.vn"
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="font-medium">Mật khẩu</span>
        <Input
          type="password"
          name="password"
          autoComplete="new-password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder={`Tối thiểu ${PASSWORD_MIN_LENGTH} ký tự`}
        />
      </label>
      {error ? (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={submitting}>
        Tạo tài khoản
      </Button>
    </form>
  );
}
