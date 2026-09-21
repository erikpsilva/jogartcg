
// inicia após carregar a pagina
$( document ).ready(function() {
    initSidebar();
});

const initSidebar = () => {
    $('#toggleSidebar').click(function () {
        $('.sidebar').toggleClass('open');
        $('.sidebar__overlay').toggleClass('show');
    });

    $('#sidebarOverlay').click(function () {
        $('.sidebar').removeClass('open');
        $('.sidebar__overlay').removeClass('show');
    });
};
