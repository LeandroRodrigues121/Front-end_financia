import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import LoginPage from '@/pages/LoginPage.vue';
import RegisterPage from '@/pages/RegisterPage.vue';
import DashboardPage from '@/pages/DashboardPage.vue';
import IncomesPage from '@/pages/IncomesPage.vue';
import ExpensesPage from '@/pages/ExpensesPage.vue';
import DebtsPage from '@/pages/DebtsPage.vue';
import AnnualReportPage from '@/pages/AnnualReportPage.vue';

const router = createRouter({
    history: createWebHistory(),
    routes: [
        {
            path: '/login',
            name: 'login',
            component: LoginPage,
            meta: { requiresAuth: false },
        },
        {
            path: '/cadastro',
            name: 'register',
            component: RegisterPage,
            meta: { requiresAuth: false },
        },
        {
            path: '/',
            redirect: '/dashboard',
        },
        {
            path: '/dashboard',
            name: 'dashboard',
            component: DashboardPage,
            meta: { requiresAuth: true },
        },
        {
            path: '/receitas',
            name: 'incomes',
            component: IncomesPage,
            meta: { requiresAuth: true },
        },
        {
            path: '/despesas',
            name: 'expenses',
            component: ExpensesPage,
            meta: { requiresAuth: true },
        },
        {
            path: '/dividas',
            name: 'debts',
            component: DebtsPage,
            meta: { requiresAuth: true },
        },
        {
            path: '/anual',
            name: 'annual',
            component: AnnualReportPage,
            meta: { requiresAuth: true },
        },
    ],
});

router.beforeEach(async (to) => {
    const auth = useAuthStore();

    if (!auth.initialized) {
        await auth.fetchUser();
    }

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
        return '/login';
    }

    if ((to.name === 'login' || to.name === 'register') && auth.isAuthenticated) {
        return '/dashboard';
    }

    return true;
});

export default router;
