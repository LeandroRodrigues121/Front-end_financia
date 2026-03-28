<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = useRouter();
const auth = useAuthStore();

const form = reactive({
    login: 'admin',
    password: '123456',
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
            'Nao foi possivel entrar. Confira usuario e senha.';
    }
};
</script>

<template>
    <section class="auth-page">
        <div class="auth-card">
            <div>
                <h1>Finance Atlas</h1>
                <p>Controle suas financas de forma clara, mensal e anual.</p>
            </div>

            <form class="form-grid" @submit.prevent="submit">
                <label>
                    Usuario
                    <input v-model="form.login" type="text" placeholder="admin" required />
                </label>

                <label>
                    Senha
                    <input v-model="form.password" type="password" placeholder="******" required />
                </label>

                <button type="submit" class="btn-primary" :disabled="auth.loading">
                    {{ auth.loading ? 'Entrando...' : 'Entrar' }}
                </button>

                <p class="error-text" v-if="errorMessage">{{ errorMessage }}</p>
                <p class="hint-text">Credenciais padrao: <strong>admin / 123456</strong></p>
            </form>
        </div>
    </section>
</template>
