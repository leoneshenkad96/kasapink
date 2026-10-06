import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';

type PasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>;

export default function PasswordInput({ className = 'input', ...inputProps }: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return <div className="relative">
    <input {...inputProps} type={showPassword ? 'text' : 'password'} className={`${className} pr-10`} />
    <button
      type="button"
      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
      aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
      aria-pressed={showPassword}
      onClick={() => setShowPassword((visible) => !visible)}
    >
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {showPassword ? <>
          <path d="M3 3l18 18" />
          <path d="M10.6 5.1A10.8 10.8 0 0 1 12 5c6.4 0 10 7 10 7a15.6 15.6 0 0 1-3.1 3.9M6.2 6.2C3.5 8 2 12 2 12s3.6 7 10 7c1.2 0 2.3-.3 3.3-.7" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
        </> : <>
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
        </>}
      </svg>
    </button>
  </div>;
}
