async function apiFetch(url, options) {
    const response = await fetch(url, options);
    if (response.status === 401) window.location.replace('/login');
    return response;
}

function showAuthError(status, message) {
    status.textContent = message;
    status.hidden = false;
}

const loginForm = document.getElementById('login-form');
const { hostname, port } = window.location;
const redirectingToLocalServer = port === '5500' && ['localhost', '127.0.0.1', '[::1]'].includes(hostname);
if (redirectingToLocalServer) {
    window.location.replace(loginForm ? 'http://localhost:5000/login' : 'http://localhost:5000/');
}
if (loginForm) {
    document.documentElement.dataset.theme = localStorage.getItem('v3d-theme') || 'light';
    const button = loginForm.querySelector('button');
    const status = document.getElementById('login-status');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        status.hidden = true;
        button.disabled = true;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(Object.fromEntries(new FormData(loginForm))),
            });
            if (response.ok) {
                loginForm.reset();
                window.location.replace('/');
                return;
            }

            const { error } = await response.json();
            showAuthError(status, error || 'Não foi possível entrar. Tente novamente.');
        } catch {
            showAuthError(status, 'Não foi possível entrar. Tente novamente.');
        } finally {
            button.disabled = false;
        }
    });
}

const logoutButton = document.getElementById('logout-button');
if (logoutButton) {
    const status = document.getElementById('logout-status');
    logoutButton.addEventListener('click', async () => {
        status.hidden = true;
        logoutButton.disabled = true;

        try {
            const response = await fetch('/api/auth/logout', { method: 'POST' });
            if (!response.ok) throw new Error('Logout falhou');
            window.location.replace('/login');
        } catch {
            showAuthError(status, 'Não foi possível sair. Tente novamente.');
            logoutButton.disabled = false;
        }
    });

    // Revalida a autorização quando o navegador restaura a página do histórico.
    window.addEventListener('pageshow', (event) => {
        if (event.persisted) window.location.reload();
    });
}