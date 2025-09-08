// app/signup/page.jsx
'use client';
import SignUpForm from '../../components/SignUpForm';

export default function SignUpPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
      <SignUpForm onSuccess={() => (window.location.href = '/login')} />
    </main>
  );
}
