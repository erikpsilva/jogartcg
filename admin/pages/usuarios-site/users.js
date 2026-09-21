document.querySelectorAll('[data-site-user-form]').forEach(form => {
    const value = name => form.elements.namedItem(name)?.value ?? '';
    const digits = text => text.replace(/\D/g, '');
    const validate = input => {
        const name = input.name, text = input.value.trim();
        let error = '';
        if (input.required && !text) error = 'Preencha este campo.';
        else if (name === 'confirmation' && text !== 'EXCLUIR') error = 'Digite EXCLUIR para confirmar.';
        else if (['firstName','lastName'].includes(name) && (!/^\p{L}[\p{L}\s'’\-]*$/u.test(text) || text.length < 2)) error = 'Use pelo menos duas letras, sem números ou símbolos.';
        else if (name === 'email' && (!input.validity.valid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))) error = 'Informe um e-mail válido.';
        else if (name === 'cpf') {
            const number = digits(text);
            let valid = number.length === 11 && !/^(\d)\1{10}$/.test(number);
            for (let pos = 9; valid && pos < 11; pos++) {
                let sum = 0;
                for (let i = 0; i < pos; i++) sum += Number(number[i]) * (pos + 1 - i);
                valid = Number(number[pos]) === ((10 * sum) % 11) % 10;
            }
            if (!valid) error = 'CPF inválido. Confira os números.';
        } else if (name === 'phone') {
            const number = digits(text);
            if (!/^\d{10,11}$/.test(number) || Number(number.slice(0,2)) < 11 || (number.length === 11 ? number[2] !== '9' : Number(number[2]) < 2)) error = 'Informe um telefone válido com DDD.';
        } else if (name === 'birthDate' && text) {
            const date = new Date(`${text}T12:00:00`), today = new Date();
            let age = today.getFullYear() - date.getFullYear();
            if (today.getMonth() < date.getMonth() || (today.getMonth() === date.getMonth() && today.getDate() < date.getDate())) age--;
            if (Number.isNaN(date.getTime()) || age < 13 || age > 120) error = 'Informe uma data válida: idade entre 13 e 120 anos.';
        } else if (name === 'newPassword' && input.value) {
            const password = input.value;
            if (password.length < 8 || new TextEncoder().encode(password).length > 72 || !/\p{Lu}/u.test(password) || !/\p{Ll}/u.test(password) || !/\d/.test(password) || !/[^\p{L}\d]/u.test(password)) error = 'Use 8 a 72 caracteres, com maiúscula, minúscula, número e símbolo.';
        } else if (name === 'passwordConfirmation' && (input.value || value('newPassword')) && input.value !== value('newPassword')) error = 'As senhas precisam ser iguais.';
        if (name === 'newPassword' && !input.value && value('passwordConfirmation')) error = 'Informe a nova senha ou limpe a confirmação.';
        if (name === 'photo' && input.files[0]) {
            const file = input.files[0];
            if (!['image/jpeg','image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) error = 'Use uma foto JPG ou PNG de até 5 MB.';
        }
        const message = document.getElementById(`error-${name}`);
        if (message) { message.textContent = error; message.classList.toggle('show', !!error); input.setAttribute('aria-invalid', String(!!error)); }
        return !error;
    };
    const fields = [...form.querySelectorAll('input:not([type=hidden]):not([type=checkbox])')];
    fields.forEach(input => {
        input.addEventListener('input', () => validate(input));
        input.addEventListener('change', () => validate(input));
    });
    form.addEventListener('submit', event => {
        let firstInvalid;
        fields.forEach(input => { if (!validate(input)) firstInvalid ??= input; });
        if (firstInvalid) { event.preventDefault(); firstInvalid.focus(); return; }
        const button = form.querySelector('button[type=submit]');
        if (button) { button.disabled = true; button.textContent = 'Processando…'; }
    });
});
