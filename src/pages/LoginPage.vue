<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const form = reactive({
    login: '',
    password: '',
});

const errorMessage = ref('');

const submit = async () => {
    errorMessage.value = '';

    try {
        await auth.login(form);
        router.push('/dashboard');
    } catch (error) {
        errorMessage.value =
            error?.response?.data?.message ||
            error?.response?.data?.errors?.login?.[0] ||
            'Não foi possível entrar. Confira usuário e senha.';
    }
};
</script>

<template>
    <section class="auth-page">
        <div class="auth-ambient" />

        <div class="auth-shell">
            <article class="auth-brand-panel">
                <p class="auth-eyebrow">Finance Atlas</p>
                <h1>Seu painel financeiro com foco total em clareza.</h1>
                <p>
                    Controle receitas, despesas, dívidas e indicadores em um único fluxo.
                    Entre com sua conta para continuar.
                </p>
                <ul class="auth-feature-list">
                    <li>Resumo mensal e anual em tempo real</li>
                    <li>Histórico por categorias e status</li>
                    <li>Visual responsivo para desktop e mobile</li>
                </ul>
            </article>

            <article class="auth-form-panel">
                <div class="auth-form-head">
                    <h2>Entrar</h2>
                    <p>Acesse seu espaço.</p>
                </div>

                <form class="auth-form" @submit.prevent="submit">
                    <label>
                        Usuário ou e-mail
                        <input
                            v-model="form.login"
                            type="text"
                            placeholder="admin ou email@dominio.com"
                            required
                            autocomplete="username"
                        />
                    </label>

                    <label>
                        Senha
                        <input
                            v-model="form.password"
                            type="password"
                            placeholder="******"
                            required
                            autocomplete="current-password"
                        />
                    </label>

                    <button type="submit" class="btn-primary auth-submit" :disabled="auth.loading">
                        {{ auth.loading ? 'Entrando...' : 'Entrar na conta' }}
                    </button>

                    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
                </form>

                <div class="auth-footer">
                    <p>Ainda não tem conta?</p>
                    <RouterLink to="/cadastro" class="auth-link">Criar conta</RouterLink>
                </div>
            </article>
        </div>
    </section>
</template>
