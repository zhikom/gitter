// How the UI, the backend and the desktop shell find each other. The desktop
// shell is Rust (src-tauri/src/lib.rs) and repeats READY_PREFIX and the
// command-line flags; keep the two in step.

/** Request header carrying the backend's access token. EventSource sends it as `?token=` instead. */
export const TOKEN_HEADER = 'X-Gitter-Token';

/** Printed by the backend once it listens: `GITTER_READY {"port":1234,"token":"..."}`. */
export const READY_PREFIX = 'GITTER_READY ';

/** Desktop mode: loopback only, a free port, exit with the parent process. */
export const DESKTOP_FLAG = '--desktop';
export const PARENT_PID_FLAG = '--parent-pid=';

/** Where the development backend listens; Vite proxies /api to it. */
export const DEV_BACKEND_PORT = 3001;
