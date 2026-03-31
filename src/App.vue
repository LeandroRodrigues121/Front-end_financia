<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import AppIcon from '@/components/AppIcon.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const showShell = computed(() => auth.isAuthenticated && !['login', 'register'].includes(String(route.name)));
const sidebarCollapsed = ref(false);
const sidebarStorageKey = 'financeatlas:sidebar-collapsed';

const navItems = [
    { name: 'dashboard', path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { name: 'incomes', path: '/receitas', label: 'Receitas', icon: 'incomes' },
    { name: 'expenses', path: '/despesas', label: 'Despesas', icon: 'expenses' },
    { name: 'debts', path: '/dividas', label: 'Dividas', icon: 'debts' },
    { name: 'annual', path: '/anual', label: 'Visao anual', icon: 'annual' },
];

const userInitial = computed(() => String(auth.user?.name || 'U').charAt(0).toUpperCase());

const toggleSidebar = () => {
    sidebarCollapsed.value = !sidebarCollapsed.value;
};

const logout = async () => {
    await auth.logout();
    router.push('/login');
};

onMounted(() => {
    const storedState = localStorage.getItem(sidebarStorageKey);
    sidebarCollapsed.value = storedState === '1';
});

watch(sidebarCollapsed, (value) => {
    localStorage.setItem(sidebarStorageKey, value ? '1' : '0');
});
</script>

<template>
    <div class="app-bg">
        <div v-if="!auth.initialized" class="center-loader">
            <div class="loader-orb" />
            <p>Carregando sua base financeira...</p>
        </div>

        <template v-else>
            <div v-if="showShell" class="app-shell" :class="{ 'is-collapsed': sidebarCollapsed }">
                <aside class="sidebar" :class="{ collapsed: sidebarCollapsed }">
                    <div class="brand">
                        <div class="brand-line">
                            <h1 v-if="!sidebarCollapsed">Finance Atlas</h1>
                            <button
                                type="button"
                                class="sidebar-toggle"
                                @click="toggleSidebar"
                                :title="sidebarCollapsed ? 'Expandir menu' : 'Recolher menu'"
                            >
                                <AppIcon :name="sidebarCollapsed ? 'chevronRight' : 'chevronLeft'" :size="18" />
                            </button>
                        </div>
                        <p v-if="!sidebarCollapsed">Gestao Financeira Pessoal</p>
                    </div>

                    <nav class="menu">
                        <RouterLink
                            v-for="item in navItems"
                            :key="item.name"
                            :to="item.path"
                            class="menu-item"
                            active-class="active"
                            :title="item.label"
                        >
                            <span class="menu-item-icon">
                                <AppIcon :name="item.icon" :size="17" />
                            </span>
                            <span v-if="!sidebarCollapsed" class="menu-item-label">{{ item.label }}</span>
                        </RouterLink>
                    </nav>

                    <div class="user-box">
                        <div class="user-chip">
                            <span class="user-avatar">{{ userInitial }}</span>
                            <span v-if="!sidebarCollapsed">{{ auth.user?.name }}</span>
                        </div>
                        <button type="button" class="btn-ghost btn-logout" @click="logout" :title="'Sair'">
                            <AppIcon name="logout" :size="16" />
                            <span v-if="!sidebarCollapsed">Sair</span>
                        </button>
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
