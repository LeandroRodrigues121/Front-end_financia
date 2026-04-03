<script setup>
import { computed } from 'vue';

const props = defineProps({
    name: {
        type: String,
        required: true,
    },
    size: {
        type: Number,
        default: 18,
    },
    strokeWidth: {
        type: Number,
        default: 1.9,
    },
});

const iconPaths = {
    menu: ['M3 6h18', 'M3 12h18', 'M3 18h18'],
    chevronLeft: ['m15 18-6-6 6-6'],
    chevronRight: ['m9 18 6-6-6-6'],
    chevronDown: ['m6 9 6 6 6-6'],
    dashboard: ['M3 3h8v8H3z', 'M13 3h8v5h-8z', 'M13 10h8v11h-8z', 'M3 13h8v8H3z'],
    incomes: ['M4 17l6-6 4 4 6-8', 'M16 7h4v4', 'M20 7l-6 8-4-4-6 6'],
    expenses: ['M4 7h16', 'M4 12h10', 'M4 17h7'],
    debts: ['M3 7h18', 'M7 7V5h10v2', 'M6 11h12v8H6z', 'M10 15h4'],
    annual: ['M4 19V5', 'M10 19V9', 'M16 19V12', 'M22 19V7'],
    user: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'],
    logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
    refresh: ['M21 2v6h-6', 'M3 22v-6h6', 'M3.5 9A9 9 0 0 1 18 5l3 3', 'M20.5 15A9 9 0 0 1 6 19l-3-3'],
    filter: ['M3 5h18', 'M6 12h12', 'M10 19h4'],
    edit: ['M12 20h9', 'M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
    delete: ['M3 6h18', 'M8 6V4h8v2', 'M6 6l1 14h10l1-14', 'M10 11v6', 'M14 11v6'],
    alert: ['M12 9v4', 'M12 17h.01', 'M10.3 3.9L1.8 18.7A2 2 0 0 0 3.5 21.7h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
    check: ['M20 6 9 17l-5-5'],
    search: ['m21 21-4.4-4.4', 'M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z'],
    trendUp: ['M3 17l6-6 4 4 7-8', 'M17 7h4v4'],
    trendDown: ['M3 7l6 6 4-4 7 8', 'M17 17h4v-4'],
    target: ['M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0', 'M12 12m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0', 'M12 12m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0'],
    progress: ['M4 12h16', 'M12 4v16'],
    chart: ['M4 19h16', 'M6 15l3-3 3 2 6-6'],
    award: ['m12 15 3.5 2 2-3.5 3.5-2V4.8L12 2 6.5 4.8V11.5l2 3.5Z', 'M9.5 22 12 17l2.5 5', 'm9.5 9 1.5 1.5L14.5 7'],
    pieChart: ['M21.21 15.89A10 10 0 1 1 8.11 2.79', 'M12 2v10h10'],
    download: ['M12 3v12', 'm7 10 5 5 5-5', 'M5 21h14'],
    fileText: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M16 13H8', 'M16 17H8', 'M10 9H8'],
    fileSpreadsheet: ['M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', 'M14 2v6h6', 'M8 13h8', 'M8 17h8', 'M10 9H8', 'M8 13v4', 'M12 13v4', 'M16 13v4'],
    plus: ['M12 5v14', 'M5 12h14'],
    close: ['M6 6l12 12', 'M18 6 6 18'],
    wallet: ['M3 7.5A2.5 2.5 0 0 1 5.5 5H19a2 2 0 0 1 2 2v1H5.5A2.5 2.5 0 0 0 3 10.5v0', 'M3 10.5A2.5 2.5 0 0 1 5.5 8H21v9a2 2 0 0 1-2 2H5.5A2.5 2.5 0 0 1 3 16.5v-6Z', 'M16 13h3', 'M18 13h.01'],
};

const currentPaths = computed(() => iconPaths[props.name] || iconPaths.chart);
</script>

<template>
    <svg
        class="app-icon"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        :viewBox="'0 0 24 24'"
        :width="size"
        :height="size"
        :stroke-width="strokeWidth"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
    >
        <path v-for="(path, index) in currentPaths" :key="`${props.name}-${index}`" :d="path" />
    </svg>
</template>
