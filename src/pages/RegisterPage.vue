<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const form = reactive({
    name: '',
    username: '',
    email: '',
    password: '',
    password_confirmation: '',
});

const errorMessage = ref('');

const normalizeValidationError = (error) => {
    const errors = error?.response?.data?.errors;

    if (!errors || typeof errors !== 'object') {
        return null;
    }

    const firstKey = Object.keys(errors)[0];
    const firstMessage = firstKey ? errors[firstKey]?.[0] : null;

    return firstMessage || null;
};

const submit = async () => {
    errorMessage.value = '';

    try {
        await auth.register(form);
        router.push('/dashboard');
    } catch (error) {
        errorMessage.value =
            normalizeValidationError(error) ||
            error?.response?.data?.message ||
            'Não foi possível criar sua conta agora.';
    }
};
</script>

<template>
    <section class="auth-page">
        <div class="auth-ambient" />

        <div class="auth-shell">
            <article class="auth-brand-panel">
                <p class="auth-eyebrow">Novo cadastro</p>
                <h1>Crie sua conta e acompanhe sua evolução financeira.</h1>
                <p>
                    Em poucos passos você entra no sistema com seu próprio usuário.
                    Depois é só registrar suas movimentações.
                </p>
                <ul class="auth-feature-list">
                    <li>Cadastro rápido e validado</li>
                    <li>Login automático após criação</li>
                    <li>Sessão segura com autenticação do Laravel</li>
                </ul>
            </article>

            <article class="auth-form-panel">
                <div class="auth-form-head">
                    <h2>Criar conta</h2>
                    <p>Preencha os dados abaixo.</p>
                </div>

                <form class="auth-form" @submit.prevent="submit">
                    <label>
                        Nome completo
                        <input
                            v-model="form.name"
                            type="text"
                            placeholder="Seu nome"
                            required
                            autocomplete="name"
                        />
                    </label>

                    <label>
                        Usuário
                        <input
                            v-model="form.username"
                            type="text"
                            placeholder="usuario_unico"
                            required
                            autocomplete="username"
                        />
                    </label>

                    <label>
                        Email
                        <input
                            v-model="form.email"
                            type="email"
                            placeholder="voce@dominio.com"
                            required
                            autocomplete="email"
                        />
                    </label>

                    <label>
                        Senha
                        <input
                            v-model="form.password"
                            type="password"
                            placeholder="Mínimo 6 caracteres"
                            required
                            autocomplete="new-password"
                        />
                    </label>

                    <label>
                        Confirmar senha
                        <input
                            v-model="form.password_confirmation"
                            type="password"
                            placeholder="Repita a senha"
                            required
                            autocomplete="new-password"
                        />
                    </label>

                    <button type="submit" class="btn-primary auth-submit" :disabled="auth.loading">
                        {{ auth.loading ? 'Criando...' : 'Criar conta' }}
                    </button>

                    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
                </form>

                <div class="auth-footer">
                    <p>Já tem conta?</p>
                    <RouterLink to="/login" class="auth-link">Entrar</RouterLink>
                </div>
            </article>
        </div>
    </section>
</template>
