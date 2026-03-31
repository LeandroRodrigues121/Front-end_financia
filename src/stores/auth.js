import { defineStore } from 'pinia';
import api from '@/services/api';

export const useAuthStore = defineStore('auth', {
    state: () => ({
        user: null,
        initialized: false,
        loading: false,
    }),
    getters: {
        isAuthenticated: (state) => Boolean(state.user),
    },
    actions: {
        async fetchUser() {
            this.loading = true;
            try {
                const { data } = await api.get('/me');
                this.user = data.user;
            } catch (error) {
                this.user = null;
            } finally {
                this.initialized = true;
                this.loading = false;
            }
        },
        async login(payload) {
            this.loading = true;
            try {
                const { data } = await api.post('/login', payload);
                this.user = data.user;
                return data;
            } finally {
                this.loading = false;
            }
        },
        async register(payload) {
            this.loading = true;
            try {
                const { data } = await api.post('/register', payload);
                this.user = data.user;
                return data;
            } finally {
                this.loading = false;
            }
        },
        async logout() {
            if (!this.user) {
                return;
            }

            await api.post('/logout');
            this.user = null;
        },
    },
});
