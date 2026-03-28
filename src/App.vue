<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const showShell = computed(() => auth.isAuthenticated && route.name !== 'login');

const navItems = [
    { name: 'dashboard', path: '/dashboard', label: 'Dashboard' },
    { name: 'incomes', path: '/receitas', label: 'Receitas' },
    { name: 'expenses', path: '/despesas', label: 'Despesas' },
    { name: 'debts', path: '/dividas', label: 'Dívidas' },
    { name: 'annual', path: '/anual', label: 'Visão Anual' },
];

const logout = async () => {
    await auth.logout();
    router.push('/login');
};
</script>

<template>
    <div class="app-bg">
        <div v-if="!auth.initialized" class="center-loader">
            <div class="loader-orb" />
            <p>Carregando sua base financeira...</p>
        </div>

        <template v-else>
            <div v-if="showShell" class="app-shell">
                <aside class="sidebar">
                    <div class="brand">
                        <h1>Finance Atlas</h1>
                        <p>Gestão Financeira Pessoal</p>
                    </div>

                    <nav class="menu">
                        <RouterLink
                            v-for="item in navItems"
                            :key="item.name"
                            :to="item.path"
                            class="menu-item"
                            active-class="active"
                        >
                            {{ item.label }}
                        </RouterLink>
                    </nav>

                    <div class="user-box">
                        <span>{{ auth.user?.name }}</span>
                        <button type="button" class="btn-ghost" @click="logout">Sair</button>
                    </div>
                </aside>

                <main class="content">
                    <RouterView />
                </main>
            </div>

            <RouterView v-else />
        </template>
    </div>
</template>
