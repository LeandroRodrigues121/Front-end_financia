<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps({
    text: {
        type: String,
        required: true,
    },
    maxWidth: {
        type: Number,
        default: 280,
    },
});

const isOpen = ref(false);
const triggerRef = ref(null);
const panelRef = ref(null);
const panelStyle = ref({});
const isCoarsePointer = ref(false);

let closeTimeoutId = null;

const clearCloseTimeout = () => {
    if (!closeTimeoutId) return;
    window.clearTimeout(closeTimeoutId);
    closeTimeoutId = null;
};

const updatePointerMode = () => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    isCoarsePointer.value = window.matchMedia('(hover: none), (pointer: coarse)').matches;
};

const updatePosition = () => {
    if (!triggerRef.value || !panelRef.value) return;

    const triggerRect = triggerRef.value.getBoundingClientRect();
    const panelRect = panelRef.value.getBoundingClientRect();
    const gap = 10;
    const viewportPadding = 12;

    let top = triggerRect.top - panelRect.height - gap;
    if (top < viewportPadding) {
        top = Math.min(window.innerHeight - panelRect.height - viewportPadding, triggerRect.bottom + gap);
    }

    let left = triggerRect.left + triggerRect.width / 2 - panelRect.width / 2;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - panelRect.width - viewportPadding));

    panelStyle.value = {
        top: `${top}px`,
        left: `${left}px`,
        maxWidth: `${props.maxWidth}px`,
    };
};

const openTooltip = async () => {
    clearCloseTimeout();
    if (isOpen.value) {
        updatePosition();
        return;
    }

    isOpen.value = true;
    await nextTick();
    updatePosition();
};

const closeTooltip = () => {
    clearCloseTimeout();
    isOpen.value = false;
};

const scheduleClose = () => {
    clearCloseTimeout();
    closeTimeoutId = window.setTimeout(() => {
        isOpen.value = false;
        closeTimeoutId = null;
    }, 90);
};

const handleTriggerMouseEnter = () => {
    if (isCoarsePointer.value) return;
    openTooltip();
};

const handleTriggerMouseLeave = () => {
    if (isCoarsePointer.value) return;
    scheduleClose();
};

const handlePanelMouseEnter = () => {
    if (isCoarsePointer.value) return;
    clearCloseTimeout();
};

const handlePanelMouseLeave = () => {
    if (isCoarsePointer.value) return;
    scheduleClose();
};

const handleTriggerClick = (event) => {
    if (!isCoarsePointer.value) return;
    event.stopPropagation();

    if (isOpen.value) {
        closeTooltip();
        return;
    }

    openTooltip();
};

const handleDocumentClick = (event) => {
    if (!isOpen.value) return;

    const target = event.target;
    if (triggerRef.value?.contains(target) || panelRef.value?.contains(target)) return;

    closeTooltip();
};

const handleWindowKeydown = (event) => {
    if (event.key === 'Escape' && isOpen.value) {
        closeTooltip();
    }
};

watch(isOpen, (value) => {
    if (typeof window === 'undefined') return;

    if (value) {
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return;
    }

    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
});

onMounted(() => {
    updatePointerMode();

    if (typeof window === 'undefined') return;

    document.addEventListener('click', handleDocumentClick);
    window.addEventListener('keydown', handleWindowKeydown);
    window.addEventListener('resize', updatePointerMode);
});

onBeforeUnmount(() => {
    clearCloseTimeout();

    if (typeof window === 'undefined') return;

    document.removeEventListener('click', handleDocumentClick);
    window.removeEventListener('keydown', handleWindowKeydown);
    window.removeEventListener('resize', updatePointerMode);
    window.removeEventListener('resize', updatePosition);
    window.removeEventListener('scroll', updatePosition, true);
});
</script>

<template>
    <span class="app-tooltip-anchor">
        <button
            ref="triggerRef"
            type="button"
            class="app-tooltip-trigger"
            aria-label="Ajuda"
            :aria-expanded="isOpen"
            @mouseenter="handleTriggerMouseEnter"
            @mouseleave="handleTriggerMouseLeave"
            @focus="openTooltip"
            @blur="closeTooltip"
            @click="handleTriggerClick"
        >
            <AppIcon name="helpCircle" :size="15" :stroke-width="2" />
        </button>

        <Teleport to="body">
            <Transition name="app-tooltip-fade">
                <div
                    v-if="isOpen"
                    ref="panelRef"
                    class="app-tooltip-panel"
                    :style="panelStyle"
                    role="tooltip"
                    @mouseenter="handlePanelMouseEnter"
                    @mouseleave="handlePanelMouseLeave"
                >
                    {{ text }}
                </div>
            </Transition>
        </Teleport>
    </span>
</template>

<style scoped>
.app-tooltip-anchor {
    display: inline-flex;
    align-items: center;
}

.app-tooltip-trigger {
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: 999px;
    padding: 0;
    background: transparent;
    color: #94a3b8;
    display: inline-grid;
    place-items: center;
    cursor: help;
    transition: color 0.18s ease, background-color 0.18s ease;
}

.app-tooltip-trigger:hover,
.app-tooltip-trigger:focus-visible,
.app-tooltip-trigger[aria-expanded='true'] {
    color: #64748b;
    background: rgba(148, 163, 184, 0.14);
}

.app-tooltip-trigger:focus-visible {
    outline: none;
}

.app-tooltip-panel {
    position: fixed;
    z-index: 1200;
    padding: 10px 12px;
    border-radius: 14px;
    background: #0f172a;
    color: #f8fafc;
    font-size: 0.76rem;
    font-weight: 600;
    line-height: 1.5;
    box-shadow: 0 18px 36px rgba(15, 23, 42, 0.28);
    pointer-events: auto;
}

.app-tooltip-fade-enter-active,
.app-tooltip-fade-leave-active {
    transition: opacity 0.16s ease, transform 0.16s ease;
}

.app-tooltip-fade-enter-from,
.app-tooltip-fade-leave-to {
    opacity: 0;
    transform: translateY(4px);
}
</style>
