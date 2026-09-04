<script setup lang="ts">
withDefaults(defineProps<{
  required?: boolean
}>(), {
  required: false
})

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const saving = ref(false)
const errorMessage = ref('')

async function changePassword(): Promise<void> {
  errorMessage.value = ''
  if (newPassword.value.length < 12) {
    errorMessage.value = '新密码至少需要 12 位。'
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    errorMessage.value = '两次输入的新密码不一致。'
    return
  }

  saving.value = true
  try {
    await adminFetch('/api/admin/auth/password', {
      method: 'POST',
      body: {
        currentPassword: currentPassword.value,
        newPassword: newPassword.value
      }
    })
    await navigateTo('/admin/login?password=changed', { replace: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    errorMessage.value = message.includes('CURRENT_PASSWORD_INCORRECT')
      ? '当前密码不正确。'
      : '密码修改失败，请检查当前密码后重试。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section
    class="rounded-lg border p-5"
    :class="required ? 'border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'"
  >
    <div class="flex items-start gap-3">
      <UIcon
        :name="required ? 'i-lucide-shield-alert' : 'i-lucide-key-round'"
        class="mt-0.5 size-5 shrink-0"
        :class="required ? 'text-amber-700 dark:text-amber-300' : 'text-zinc-600 dark:text-zinc-300'"
      />
      <div>
        <h2 class="font-bold text-zinc-950 dark:text-zinc-100">
          {{ required ? '首次登录，请先修改密码' : '修改登录密码' }}
        </h2>
        <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          新密码至少 12 位。修改后当前登录会退出，请使用新密码重新登录。
        </p>
      </div>
    </div>

    <form
      class="mt-5 grid gap-4 md:grid-cols-3"
      @submit.prevent="changePassword"
    >
      <UFormField label="当前密码">
        <UInput
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          class="w-full"
        />
      </UFormField>
      <UFormField label="新密码">
        <UInput
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <UFormField label="再次输入新密码">
        <UInput
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          class="w-full"
        />
      </UFormField>
      <div class="md:col-span-3">
        <p
          v-if="errorMessage"
          class="mb-3 text-sm text-red-700 dark:text-red-300"
          role="alert"
        >
          {{ errorMessage }}
        </p>
        <UButton
          type="submit"
          icon="i-lucide-key-round"
          label="修改密码"
          :loading="saving"
          :disabled="!currentPassword || !newPassword || !confirmPassword"
        />
      </div>
    </form>
  </section>
</template>
