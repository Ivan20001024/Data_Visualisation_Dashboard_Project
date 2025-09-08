// app/page.js
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '../lib/authOptions';

export default async function Home() {
  const session = await getServerSession(authOptions);
  redirect(session ? '/dashboard' : '/login');
}
