import { io } from 'socket.io-client';

// Realtime push channel. Used so cross-device changes (e.g. a party uploads a bill) appear on the
// admin's screen within ~1s without aggressive polling. Best-effort: if the socket can't connect,
// the app keeps working via its normal navigation/visibility refresh.

const AUTH_SESSION_KEY = 'waqas_emb_auth_session';

const readToken = () => {
  try {
    const session = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
    return session?.token || '';
  } catch {
    return '';
  }
};

/** Socket server origin = API base URL without its trailing "/api" path (empty = same origin). */
const deriveSocketBase = () => {
  const base = String(
    process.env.REACT_APP_API_BASE_URL ||
      (process.env.NODE_ENV === 'development' ? 'http://localhost:3001/api' : ''),
  )
    .replace(/\/$/, '')
    .replace(/\/api$/i, '');
  return base || undefined;
};

let socket = null;

export const connectRealtime = () => {
  const token = readToken();
  if (!token) return null;

  if (socket) {
    // Refresh the handshake token on reconnect (e.g. after a session refresh).
    socket.auth = { token };
    if (!socket.connected) socket.connect();
    return socket;
  }

  const base = deriveSocketBase();
  const opts = {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 10000,
    timeout: 10000,
    autoConnect: true,
  };
  socket = base ? io(base, opts) : io(opts);
  return socket;
};

export const disconnectRealtime = () => {
  if (!socket) return;
  try {
    socket.removeAllListeners();
    socket.disconnect();
  } catch {
    /* ignore */
  }
  socket = null;
};

/** Subscribe to org-wide change pushes. Returns an unsubscribe function. */
export const onDataChanged = (handler) => {
  const s = connectRealtime();
  if (!s) return () => {};
  s.on('data:changed', handler);
  return () => {
    try {
      s.off('data:changed', handler);
    } catch {
      /* ignore */
    }
  };
};
