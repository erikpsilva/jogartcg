document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggleSidebar');
    const sidebar = document.getElementById('adminSidebar');
    const overlay = document.getElementById('sidebarOverlay');
    if (!toggle || !sidebar || !overlay) return;
    const setOpen = (open) => {
        sidebar.classList.toggle('open', open);
        overlay.classList.toggle('show', open);
        toggle.setAttribute('aria-expanded', String(open));
        document.body.classList.toggle('admin-menu-open', open);
        (open ? document.getElementById('closeSidebar') : toggle)?.focus();
    };
    toggle.addEventListener('click', () => setOpen(!sidebar.classList.contains('open')));
    overlay.addEventListener('click', () => setOpen(false));
    document.getElementById('closeSidebar')?.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', (event) => {
        if (!sidebar.classList.contains('open')) return;
        if (event.key === 'Escape') setOpen(false);
        if (event.key === 'Tab') {
            const controls = [...sidebar.querySelectorAll('a,button')];
            const first = controls[0], last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
    });
    window.matchMedia('(min-width:768px)').addEventListener('change', (event) => { if (event.matches) setOpen(false); });
});
