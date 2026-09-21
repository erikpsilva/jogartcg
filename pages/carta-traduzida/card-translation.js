document.addEventListener('DOMContentLoaded', () => {
    const preview = document.querySelector('[data-card-preview]');
    const overlay = document.querySelector('[data-card-overlay]');
    const note = document.querySelector('[data-view-note]');
    const buttons = document.querySelectorAll('[data-card-mode]');

    if (!preview || !overlay || !buttons.length) {
        return;
    }

    buttons.forEach((button) => {
        button.addEventListener('click', () => {
            const translated = button.dataset.cardMode === 'translated';
            overlay.hidden = !translated;
            preview.classList.toggle('is-original', !translated);

            buttons.forEach((item) => {
                const active = item === button;
                item.classList.toggle('is-active', active);
                item.setAttribute('aria-pressed', String(active));
            });

            if (note) {
                note.textContent = translated
                    ? 'Visualização traduzida: a camada PT-BR está aplicada sobre as áreas textuais.'
                    : 'Visualização original: nenhuma alteração foi aplicada à imagem oficial.';
            }
        });
    });
});

