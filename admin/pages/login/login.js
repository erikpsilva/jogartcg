
const validateLoginForm = () => {
    let isValid = true;

    const emailInput = $('#loginEmail');
    const passwordInput = $('#loginPassword');

    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;

    if (!emailRegex.test(emailInput.val().trim())) {
        emailInput.parents('.formGroup__item').addClass('error');
        isValid = false;
    } else {
        emailInput.parents('.formGroup__item').removeClass('error');
    }

    if (passwordInput.val().trim().length < 6) {
        passwordInput.parents('.formGroup__item').addClass('error');
        isValid = false;
    } else {
        passwordInput.parents('.formGroup__item').removeClass('error');
    }

    return isValid;
};

const sendLogin = () => {
    $('body').append('<div class="overlay overlayForm"><div class="loader"></div></div>');

    $.post(ADMIN_BASE_URL + '/services/login.php', {
        email: $('#loginEmail').val().trim(),
        senha: $('#loginPassword').val().trim()
    }, function (response) {
        $('.overlayForm').remove();

        if (response.success) {
            window.location.href = BASE_URL + '/admin/inicio';
        } else {
            $('.adminLogin__content').find('.formAlert').remove();
            $('.adminLogin__content').prepend('<div class="formAlert formAlert--error">' + response.message + '</div>');
        }
    }, 'json').fail(function (xhr) {
        $('.overlayForm').remove();
        let msg = 'Erro ao tentar realizar o login.';
        if (xhr.responseJSON && xhr.responseJSON.message) {
            msg = xhr.responseJSON.message;
        }
        $('.adminLogin__content').find('.formAlert').remove();
        $('.adminLogin__content').prepend('<div class="formAlert formAlert--error">' + msg + '</div>');
    });
};

const clearError = () => {
    $('.input').on('keypress input', function () {
        $(this).parents('.formGroup__item').removeClass('error');
        $('.formAlert').remove();
    });
};

$(document).ready(function () {
    clearError();

    $('#enviarLogin').click(function (event) {
        event.preventDefault();
        if (validateLoginForm()) {
            sendLogin();
        }
    });
});
