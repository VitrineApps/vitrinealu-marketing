import { ApprovalCard } from './(components)/ApprovalCard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.localhost';

export default function Page() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <ApprovalCard requestId="12345" apiBaseUrl={API_BASE_URL} />
      <p className="text-sm text-slate-500">
        Decisions post to <span className="font-mono">{API_BASE_URL}</span>. Update <span className="font-mono">NEXT_PUBLIC_API_BASE_URL</span> to point to your worker API.
      </p>
    </main>
  );
}
