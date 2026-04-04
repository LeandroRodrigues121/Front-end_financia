<script setup>
import { computed } from 'vue';
import AppIcon from '@/components/AppIcon.vue';

const props = defineProps({
    open: {
        type: Boolean,
        default: false,
    },
    incomeName: {
        type: String,
        default: '',
    },
    itemName: {
        type: String,
        default: '',
    },
    entityLabel: {
        type: String,
        default: 'receita',
    },
    title: {
        type: String,
        default: '',
    },
    confirmLabel: {
        type: String,
        default: 'Excluir',
    },
    loading: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(['close', 'confirm']);

const resolvedItemName = computed(() => props.itemName || props.incomeName);
const resolvedTitle = computed(() => props.title || `Excluir ${props.entityLabel}`);
const resolvedConfirmLabel = computed(() => (props.loading ? 'Excluindo...' : props.confirmLabel));

const handleClose = () => {
    emit('close');
};

const handleConfirm = () => {
    emit('confirm');
};
</script>

<template>
    <Teleport to="body">
        <Transition name="modal-fade">
            <div v-if="open" class="modal-backdrop confirm-delete-backdrop" @click.self="handleClose">
                <section
                    class="modal-panel confirm-delete-modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-delete-title"
                    aria-describedby="confirm-delete-description"
                >
                    <header class="confirm-delete-header">
                        <h3 id="confirm-delete-title">{{ resolvedTitle }}</h3>
                    </header>

                    <div class="confirm-delete-body">
                        <div class="confirm-delete-visual" aria-hidden="true">
                            <AppIcon name="alert" :size="56" :stroke-width="2.2" />
                        </div>

                        <p id="confirm-delete-description" class="confirm-delete-message">
                            Tem certeza que deseja excluir
                            <strong>"{{ resolvedItemName }}"</strong>?
                            Esta ação não pode ser desfeita.
                        </p>
                    </div>

                    <div class="confirm-delete-actions">
                        <button type="button" class="confirm-delete-cancel" :disabled="loading" @click="handleClose">
                            Cancelar
                        </button>

                        <button type="button" class="confirm-delete-submit" :disabled="loading" @click="handleConfirm">
                            <AppIcon name="delete" :size="16" />
                            <span>{{ resolvedConfirmLabel }}</span>
                        </button>
                    </div>
                </section>
            </div>
        </Transition>
    </Teleport>
</template>

