
// ── VALIDAÇÕES ───────────────────────────────────────────────

const setFieldState = (selector, isValid) => {
    const parent = $(selector).closest('.formGroup__item');
    if (isValid) {
        parent.removeClass('error');
        parent.find('.errorText').removeClass('show');
    } else {
        parent.addClass('error');
        parent.find('.errorText').addClass('show');
    }
    return isValid;
};

const validateNome = () =>
    setFieldState('#userName', $('#userName').val().trim().length >= 3);

const validateSobrenome = () =>
    setFieldState('#userLastName', $('#userLastName').val().trim().length >= 3);

const validateEmail = () => {
    const regex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
    return setFieldState('#userEmail', regex.test($('#userEmail').val().trim()));
};

const isValidCPF = (cpf) => {
    cpf = cpf.replace(/[^\d]/g, '');
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
    const calcDigit = (cpf, factor) => {
        let total = 0;
        for (let i = 0; i < factor - 1; i++) total += cpf[i] * (factor - i);
        const rem = (total * 10) % 11;
        return rem === 10 ? 0 : rem;
    };
    return calcDigit(cpf, 10) === parseInt(cpf[9]) && calcDigit(cpf, 11) === parseInt(cpf[10]);
};

const validateCpf = () => {
    if (!IS_ADMIN) return true;
    return setFieldState('#userCpf', isValidCPF($('#userCpf').val()));
};

// Senha é opcional — só valida se o campo tiver conteúdo
const validateSenha = () => {
    const val = $('#userPassword').val();
    if (val === '') {
        setFieldState('#userPassword', true);
        setFieldState('#userConfirmPassword', true);
        return true;
    }
    const valid = val.length >= 6 && val.length <= 20;
    const result = setFieldState('#userPassword', valid);
    if ($('#userConfirmPassword').val() !== '') validateConfirmSenha();
    return result;
};

const validateConfirmSenha = () => {
    if ($('#userPassword').val() === '') {
        return setFieldState('#userConfirmPassword', true);
    }
    const match = $('#userPassword').val() === $('#userConfirmPassword').val();
    return setFieldState('#userConfirmPassword', match);
};

const validateAll = () => {
    const results = [
        validateNome(),
        validateSobrenome(),
        validateEmail(),
        validateCpf(),
        validateSenha(),
        validateConfirmSenha(),
    ];
    return results.every(r => r === true);
};

// ── ENVIO ────────────────────────────────────────────────────

const sendMeusDados = () => {
    $('body').append('<div class="overlay overlayForm"><div class="loader"></div></div>');

    const payload = {
        userNameVal:        $('#userName').val().trim(),
        userLastNameVal:    $('#userLastName').val().trim(),
        userEmailVal:       $('#userEmail').val().trim(),
        userPasswordVal:    $('#userPassword').val(),
    };

    if (IS_ADMIN) {
        payload.userCpfVal         = $('#userCpf').val().replace(/[^\d]/g, '');
        payload.userLevelAccessVal = $('#userLevelAccess').val();
    }

    $.post(ADMIN_BASE_URL + '/services/update_user.php', payload, function (response) {
        $('.overlayForm').remove();
        alert(response.message);
    }, 'json').fail(function () {
        $('.overlayForm').remove();
        alert('Erro ao tentar salvar os dados.');
    });
};

// ── INICIALIZAÇÃO ────────────────────────────────────────────

const insertMask = () => {
    if (IS_ADMIN) $('#userCpf').mask('999.999.999-99');
};

const bindKeyup = () => {
    $('#userName').on('keyup',            validateNome);
    $('#userLastName').on('keyup',        validateSobrenome);
    $('#userEmail').on('keyup',           validateEmail);
    $('#userCpf').on('keyup input',       validateCpf);
    $('#userPassword').on('keyup',        validateSenha);
    $('#userConfirmPassword').on('keyup', validateConfirmSenha);
};

const bindSubmit = () => {
    $('#salvarMeusDados').on('click', function (e) {
        e.preventDefault();
        if (validateAll()) sendMeusDados();
    });
};

$(document).ready(() => {
    insertMask();
    bindKeyup();
    bindSubmit();
});
