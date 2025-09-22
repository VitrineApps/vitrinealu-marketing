'use client';

import { useState } from 'react';

interface ApprovalCardProps {
  requestId: string;
  apiBaseUrl: string;
}

export const ApprovalCard = ({ requestId, apiBaseUrl }: ApprovalCardProps) => {
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const submitDecision = async (decision: 'approve' | 'reject') => {
    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch(`${apiBaseUrl}/approvals/${requestId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ decision, note })
      });

      if (!response.ok) {
        throw new Error('Failed to submit decision');
      }

      setStatus(`Request ${decision}d successfully`);
      setNote('');
    } catch (error) {
      setStatus('Something went wrong. Try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="max-w-lg w-full rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
      <header className="mb-4">
        <p className="text-sm uppercase tracking-widest text-slate-400">Approval Request</p>
        <h1 className="text-2xl font-semibold text-slate-50">Workflow #{requestId}</h1>
      </header>
      <textarea
        className="mt-2 w-full min-h-[120px] rounded-md border border-slate-700 bg-slate-950 p-3 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
        placeholder="Leave an optional note for the team..."
        value={note}
        onChange={(event) => setNote((event.target as HTMLTextAreaElement).value)}
      />
      <div className="mt-4 flex items-center gap-3">
        <button
          className="flex-1 rounded-md bg-emerald-500 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          onClick={() => submitDecision('approve')}
        >
          Approve
        </button>
        <button
          className="flex-1 rounded-md bg-rose-500 py-2 text-sm font-semibold text-rose-50 transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
          onClick={() => submitDecision('reject')}
        >
          Reject
        </button>
      </div>
      {status && <p className="mt-3 text-sm text-slate-400">{status}</p>}
    </section>
  );
};
