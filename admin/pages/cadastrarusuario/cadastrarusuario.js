
// ── VALIDAÇÕES INDIVIDUAIS ───────────────────────────────────

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

const validateNome = () => {
    return setFieldState('#userName', $('#userName').val().trim().length >= 3);
};

const validateSobrenome = () => {
    return setFieldState('#userLastName', $('#userLastName').val().trim().length >= 3);
};

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
    return setFieldState('#userCpf', isValidCPF($('#userCpf').val()));
};

const validateSenha = () => {
    const val = $('#userPassword').val().trim();
    const valid = val.length >= 6 && val.length <= 20;
    const result = setFieldState('#userPassword', valid);
    if ($('#userConfirmPassword').val().trim() !== '') validateConfirmSenha();
    return result;
};

const validateConfirmSenha = () => {
    const senha   = $('#userPassword').val().trim();
    const confirm = $('#userConfirmPassword').val().trim();
    return setFieldState('#userConfirmPassword', confirm !== '' && confirm === senha);
};

// ── VALIDAÇÃO COMPLETA ───────────────────────────────────────

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

const sendRegisterUser = () => {
    $('body').append('<div class="overlay overlayForm"><div class="loader"></div></div>');

    $.post(ADMIN_BASE_URL + '/services/register_user.php', {
        userNameVal:        $('#userName').val().trim(),
        userLastNameVal:    $('#userLastName').val().trim(),
        userCpfVal:         $('#userCpf').val().replace(/[^\d]/g, ''),
        userEmailVal:       $('#userEmail').val().trim(),
        userLevelAccessVal: $('#userLevelAccess').val(),
        userPasswordVal:    $('#userPassword').val(),
    }, function (response) {
        $('.overlayForm').remove();

        if (response.success) {
            alert(response.message);
            $('.input, select').val('');
            $('select#userLevelAccess').val('admin');
        } else {
            alert(response.message);
        }
    }, 'json').fail(function () {
        $('.overlayForm').remove();
        alert('Erro ao tentar cadastrar o usuário.');
    });
};

// ── INICIALIZAÇÃO ────────────────────────────────────────────

const insertMask = () => {
    $('#userCpf').mask('999.999.999-99');
};

const bindKeyup = () => {
    $('#userName').on('keyup',           validateNome);
    $('#userLastName').on('keyup',       validateSobrenome);
    $('#userEmail').on('keyup',          validateEmail);
    $('#userCpf').on('keyup input',      validateCpf);
    $('#userPassword').on('keyup',       validateSenha);
    $('#userConfirmPassword').on('keyup',validateConfirmSenha);
};

const bindSubmit = () => {
    $('#enviarRegisterUser').on('click', function (e) {
        e.preventDefault();
        if (validateAll()) sendRegisterUser();
    });
};

$(document).ready(() => {
    insertMask();
    bindKeyup();
    bindSubmit();
});
