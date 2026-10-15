import { useState } from 'react';
import {
  Cloud,
  CloudOff,
  Download,
  LogOut,
  RefreshCw,
  ShieldCheck,
  UserRound,
  ArrowRight,
} from 'lucide-react';
import { useAccount, syncNow, importGuestProgress, signOut } from '../sync/client';
export function AccountPage({ exportRecord }: { exportRecord: () => Promise<void> }) {
  const account = useAccount(),
    [working, setWorking] = useState(false),
    [error, setError] = useState('');
  async function bringProgress() {
    setWorking(true);
    setError('');
    try {
      await importGuestProgress();
    } catch {
      setError('Could not import device progress. Your original record is still safe.');
    } finally {
      setWorking(false);
    }
  }
  return (
    <main className="content-page account-page" id="main-content">
      <div className="page-heading">
        <span className="eyebrow">
          <Cloud size={16} /> YOUR PASO
        </span>
        <h1>Pick up anywhere.</h1>
        <p className="page-description">
          Your lessons, reviews, placement, and conversations, together across devices.
        </p>
      </div>
      <section className="account-card">
        <div className="account-avatar">
          <UserRound size={30} />
        </div>
        <h2>{account.user?.displayName ?? 'A little progress goes a long way.'}</h2>
        <p>
          {account.user?.email ??
            'Create your Paso profile by signing in with your ChatGPT account. You can keep learning as a guest, too.'}
        </p>
        {account.user ? (
          <>
            <div className={`sync-status ${account.status}`} role="status">
              {account.status === 'offline' ? <CloudOff size={18} /> : <Cloud size={18} />}
              <span>
                {account.message}
                {account.lastSync && (
                  <small>Last synced {new Date(account.lastSync).toLocaleString()}</small>
                )}
              </span>
            </div>
            <button
              className="primary-button"
              disabled={account.status === 'syncing'}
              onClick={() => void syncNow()}
            >
              <RefreshCw size={17} />
              Sync now
            </button>
          </>
        ) : (
          <a
            className="primary-button"
            href="/signin-with-chatgpt?return_to=%2F%23account"
            target="_top"
          >
            Sign in & save progress
            <ArrowRight size={18} />
          </a>
        )}
      </section>
      {account.user && account.guestAvailable && (
        <section className="account-import">
          <h2>You have progress on this device.</h2>
          <p>
            Bring your guest lessons into this account. Existing account progress is kept, and the
            guest copy stays available.
          </p>
          <button
            className="secondary-button"
            disabled={working}
            onClick={() => void bringProgress()}
          >
            {working ? 'Bringing your progress…' : 'Add my guest progress'}
          </button>
        </section>
      )}
      <div className="account-details">
        <ShieldCheck size={24} />
        <div>
          <h2>Offline first. Yours to keep.</h2>
          <p>
            Keep learning without a connection. Signed-in changes sync when you return online.
            {account.communitySpace
              ? 'Voice recordings and conversation requests go to the community server on Hugging Face. It temporarily caches audio; recordings are not included in progress sync.'
              : account.transcription
                ? 'Recordings are sent to the configured speech server for recognition and are not included in progress sync.'
                : 'Microphone recordings stay on this device.'}{' '}
            Saved conversation transcripts sync with your account.
          </p>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="account-actions">
        <button className="secondary-button" onClick={() => void exportRecord()}>
          <Download size={17} />
          Export my learning record
        </button>
        {account.user && (
          <a
            className="text-button"
            href="/signout-with-chatgpt?return_to=%2F%23account"
            target="_top"
            onClick={signOut}
          >
            <LogOut size={17} />
            Sign out
          </a>
        )}
      </div>
      {account.user && (account.status === 'offline' || account.status === 'error') && (
        <p className="quiet-note">
          Before signing out, reconnect and sync to make recent changes available on another device.
          They remain saved locally.
        </p>
      )}
    </main>
  );
}
