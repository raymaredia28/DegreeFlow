import { useState } from 'react';
import { Key, ExternalLink, X } from 'lucide-react';
import { storeApiKey, markModalSeen } from '../utils/keyVault.mjs';

/**
 * @param {Object}   props
 * @param {function} props.onClose   - called after key is successfully saved
 * @param {function} props.onDismiss - called when user clicks X without saving
 * @param {string}   props.theme     - 'dark' | 'light'
 */
export function ChatKeyModal({ onClose, onDismiss, theme }) {
  const dark = theme === 'dark';

  const [keyValue, setKeyValue] = useState('');
  const [error,    setError]    = useState('');
  const [busy,     setBusy]     = useState(false);

  const submit = async () => {
    const trimmed = keyValue.trim();
    if (!trimmed) { setError('Please paste your API key.'); return; }
    if (trimmed.length < 10) { setError('Key looks too short — double-check it.'); return; }
    setBusy(true);
    try {
      await storeApiKey(trimmed);
      markModalSeen();
      onClose();
    } catch {
      setError('Could not store the key securely. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="rounded-2xl shadow-2xl w-full max-w-sm mx-auto"
        style={{
          backgroundColor: dark ? '#1e293b' : '#ffffff',
          border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.06)',
        }}
      >

        {/* Header */}
        <div
          className="flex items-start justify-between px-6 pt-6 pb-4"
          style={{ borderBottom: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #f3f4f6' }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Key className="w-4 h-4 flex-shrink-0" style={{ color: dark ? '#d1d5db' : '#374151' }} />
              <h2 className="text-base font-bold" style={{ color: dark ? '#f9fafb' : '#111827' }}>
                API Key Required
              </h2>
            </div>
            <p className="text-sm leading-snug" style={{ color: dark ? '#9ca3af' : '#6b7280' }}>
              DegreeFlow's chat uses the TAMU AI API. Enter your key below to get started.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="ml-3 mt-0.5 flex-shrink-0 rounded-lg p-1.5 transition-colors"
            style={{ color: dark ? '#9ca3af' : '#9ca3af' }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = dark ? 'rgba(255,255,255,0.08)' : '#f3f4f6'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* How to get a key */}
        <div className="px-6 pt-4 pb-2">
          <p
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: dark ? '#6b7280' : '#9ca3af' }}
          >
            Don't have a key?
          </p>
          <ol className="space-y-2 text-sm" style={{ color: dark ? '#d1d5db' : '#4b5563' }}>
            <li className="flex gap-2.5">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                style={{
                  backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                  color: dark ? '#9ca3af' : '#6b7280',
                }}
              >1</span>
              <span>
                Visit{' '}
                <a
                  href="https://chat.tamu.ai"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 font-medium underline underline-offset-2 hover:opacity-75"
                  style={{ color: dark ? '#f9fafb' : '#111827' }}
                >
                  chat.tamu.ai <ExternalLink className="w-3 h-3" />
                </a>
                {' '}and sign in with your TAMU NetID.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                style={{
                  backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                  color: dark ? '#9ca3af' : '#6b7280',
                }}
              >2</span>
              <span>
                Go to{' '}
                <strong style={{ color: dark ? '#f3f4f6' : '#1f2937' }}>Settings → API Keys</strong>
                {' '}and create a new key.
              </span>
            </li>
            <li className="flex gap-2.5">
              <span
                className="flex-shrink-0 w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center"
                style={{
                  backgroundColor: dark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
                  color: dark ? '#9ca3af' : '#6b7280',
                }}
              >3</span>
              <span>Copy and paste it below.</span>
            </li>
          </ol>
        </div>

        {/* Input + submit */}
        <div className="px-6 pt-4 pb-6 space-y-3">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste your TAMU AI API key"
            value={keyValue}
            onChange={(e) => { setKeyValue(e.target.value); setError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            className="w-full rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2"
            style={{
              backgroundColor: dark ? '#0f172a' : '#ffffff',
              border: dark ? '1px solid rgba(255,255,255,0.12)' : '1px solid #d1d5db',
              color: dark ? '#f1f5f9' : '#111827',
              '--tw-ring-color': dark ? 'rgba(148,163,184,0.4)' : 'rgba(107,114,128,0.4)',
            }}
          />

          {error && (
            <p className="text-xs" style={{ color: dark ? '#f87171' : '#ef4444' }}>{error}</p>
          )}

          <p className="text-xs" style={{ color: dark ? '#6b7280' : '#9ca3af' }}>
            Your key is encrypted in-browser and never stored on DegreeFlow's servers. It clears when you close this tab.
          </p>

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="w-full py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            style={{
              backgroundColor: dark ? '#f1f5f9' : '#111827',
              color: dark ? '#0f172a' : '#ffffff',
            }}
          >
            {busy ? 'Saving…' : 'Start chatting'}
          </button>
        </div>
      </div>
    </div>
  );
}
