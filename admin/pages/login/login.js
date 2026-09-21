document.getElementById('adminLoginForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const button = document.getElementById('enviarLogin');
    const alert = document.getElementById('loginAlert');
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = 'Entrando…';
    alert.hidden = true;
    try {
        const response = await fetch(form.action, { method: 'POST', body: new FormData(form), credentials: 'same-origin', headers: { Accept: 'application/json' } });
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.message || 'Não foi possível entrar.');
        window.location.assign(form.dataset.redirect);
    } catch (error) {
        alert.textContent = error.message || 'Não foi possível entrar. Tente novamente.';
        alert.hidden = false;
        button.disabled = false;
        button.textContent = 'Entrar no painel';
    }
});
