/**
 * fetch hacia /api/bot/* que añade el token BOT_API_TOKEN si el usuario lo guardó en
 * localStorage (clave 'BOT_API_TOKEN'). Sin token configurado en el servidor, no hace falta.
 */
export function botFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  try {
    const token = typeof window !== 'undefined' ? window.localStorage.getItem('BOT_API_TOKEN') : null;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } catch {
    // localStorage no disponible
  }
  return fetch(input, { ...init, headers });
}
